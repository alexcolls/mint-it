// Snapshots mainnet USDT into fork/ for `pnpm run fork:node`. Mainnet is only read; nothing is signed.
// Usage: pnpm run fork:snapshot
//   FORK_HOLDERS=a,b,c    token accounts or wallets to include (a wallet resolves to its USDT associated account)
//   FORK_HOLDER_COUNT=5   holders to pick when FORK_HOLDERS is unset
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import {
  ACCOUNT_SIZE, AccountLayout, AccountState, MINT_SIZE, MintLayout, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { MPL_TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import { MAINNET_USDT_MINT } from '../src/common.ts';
import {
  FORK_ACCOUNTS_DIR, FORK_MANIFEST_FILE, MAINNET_RPC_URL, type ForkHolder, type ForkManifest, loadOrCreateForkAuthority,
} from '../src/fork.ts';

const RENT_EXEMPT_EPOCH = '18446744073709551615'; // u64::MAX, as mainnet reports for rent-exempt accounts
const rpcHost = new URL(MAINNET_RPC_URL).host; // keep API keys in the URL path or query out of output
const mainnet = new Connection(MAINNET_RPC_URL, 'confirmed');
const mint = new PublicKey(MAINNET_USDT_MINT);
const metadataProgram = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);
const [metadata] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), metadataProgram.toBuffer(), mint.toBuffer()], metadataProgram,
);
const holderCount = Number(process.env.FORK_HOLDER_COUNT ?? 5);

function isUsdtTokenAccount(info: AccountInfo<Buffer> | null): info is AccountInfo<Buffer> {
  return !!info && info.owner.equals(TOKEN_PROGRAM_ID) && info.data.length === ACCOUNT_SIZE
    && AccountLayout.decode(info.data).mint.equals(mint);
}

/** Explicit list: USDT token accounts are kept, anything else is treated as a wallet and mapped to its ATA. */
async function holdersFromList(list: string[]): Promise<PublicKey[]> {
  const keys = list.map((a) => new PublicKey(a.trim()));
  const infos = await mainnet.getMultipleAccountsInfo(keys);
  return keys.map((k, i) => (isUsdtTokenAccount(infos[i]) ? k : getAssociatedTokenAddressSync(mint, k, true)));
}

/**
 * Non-empty USDT accounts touched by the mint's latest transactions. Works on public RPCs.
 * Transactions newer than v0 are skipped: @solana/web3.js v1 cannot decode them.
 */
async function holdersFromRecentActivity(count: number): Promise<PublicKey[]> {
  const found = new Map<string, PublicKey>();
  for (const { signature, err } of await mainnet.getSignaturesForAddress(mint, { limit: 50 })) {
    if (err) continue;
    const tx = await mainnet.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })
      .catch((e: { code?: number }) => {
        if (e.code === -32015) return null; // unsupported transaction version
        throw e;
      });
    for (const b of tx?.meta?.postTokenBalances ?? []) {
      if (b.mint !== MAINNET_USDT_MINT || b.uiTokenAmount.amount === '0') continue;
      const key = tx!.transaction.message.accountKeys[b.accountIndex].pubkey;
      found.set(key.toBase58(), key);
    }
    if (found.size >= count) break;
  }
  return [...found.values()].slice(0, count);
}

async function pickHolders(): Promise<{ source: string; keys: PublicKey[] }> {
  if (process.env.FORK_HOLDERS) {
    return { source: 'FORK_HOLDERS', keys: await holdersFromList(process.env.FORK_HOLDERS.split(',')) };
  }
  try {
    const largest = await new Connection(MAINNET_RPC_URL, { commitment: 'confirmed', disableRetryOnRateLimit: true })
      .getTokenLargestAccounts(mint);
    return { source: 'largest accounts', keys: largest.value.slice(0, holderCount).map((a) => a.address) };
  } catch (e) {
    console.warn(`getTokenLargestAccounts unavailable on ${rpcHost} (${(e as Error).message.split('\n')[0]}); ` +
      'picking holders from recent mint activity');
    return { source: 'recent activity', keys: await holdersFromRecentActivity(holderCount) };
  }
}

/** Same JSON shape as `solana account --output json`, which `solana-test-validator --account-dir` loads. */
function writeAccount(pubkey: PublicKey, info: AccountInfo<Buffer>, data: Buffer) {
  const json = JSON.stringify({
    pubkey: pubkey.toBase58(),
    account: {
      lamports: info.lamports,
      data: [data.toString('base64'), 'base64'],
      owner: info.owner.toBase58(),
      executable: info.executable,
      rentEpoch: RENT_EXEMPT_EPOCH,
      space: data.length,
    },
  }, null, 2).replace(`"${RENT_EXEMPT_EPOCH}"`, RENT_EXEMPT_EPOCH);
  writeFileSync(join(FORK_ACCOUNTS_DIR, `${pubkey.toBase58()}.json`), json + '\n');
}

const formatUsdt = (base: bigint, decimals: number) =>
  `${base / 10n ** BigInt(decimals)}.${(base % 10n ** BigInt(decimals)).toString().padStart(decimals, '0')}`;

const authority = loadOrCreateForkAuthority();
const picked = await pickHolders();
const holderKeys = [...new Map(picked.keys.map((k) => [k.toBase58(), k])).values()];

// One call, one slot: mint, metadata, and holder balances are a consistent snapshot.
const { context, value: [mintInfo, metadataInfo, ...holderInfos] } =
  await mainnet.getMultipleAccountsInfoAndContext([mint, metadata, ...holderKeys]);
if (!mintInfo || !metadataInfo) throw new Error(`USDT mint or metadata account missing on ${rpcHost}`);

// Swap Tether's mint and freeze authority for the fork key. Supply, decimals, and flags stay as read.
const real = MintLayout.decode(mintInfo.data);
const patched = Buffer.alloc(MINT_SIZE);
MintLayout.encode({
  ...real,
  mintAuthorityOption: 1, mintAuthority: authority.publicKey,
  freezeAuthorityOption: 1, freezeAuthority: authority.publicKey,
}, patched);

rmSync(FORK_ACCOUNTS_DIR, { recursive: true, force: true });
mkdirSync(FORK_ACCOUNTS_DIR, { recursive: true });
writeAccount(mint, mintInfo, patched);
writeAccount(metadata, metadataInfo, metadataInfo.data);

const holders: ForkHolder[] = [];
holderKeys.forEach((key, i) => {
  const info = holderInfos[i];
  if (!isUsdtTokenAccount(info)) {
    console.warn(`skipping ${key.toBase58()}: no USDT token account there at slot ${context.slot}`);
    return;
  }
  const acc = AccountLayout.decode(info.data);
  writeAccount(key, info, info.data);
  holders.push({
    tokenAccount: key.toBase58(), owner: acc.owner.toBase58(), amount: acc.amount.toString(),
    frozen: acc.state === AccountState.Frozen,
  });
});

const manifest: ForkManifest = {
  source: rpcHost,
  slot: context.slot,
  takenAt: new Date().toISOString(),
  mint: mint.toBase58(),
  supply: real.supply.toString(),
  decimals: real.decimals,
  mainnetMintAuthority: real.mintAuthorityOption ? real.mintAuthority.toBase58() : null,
  mainnetFreezeAuthority: real.freezeAuthorityOption ? real.freezeAuthority.toBase58() : null,
  forkAuthority: authority.publicKey.toBase58(),
  metadata: metadata.toBase58(),
  holderSource: picked.source,
  holders,
};
writeFileSync(FORK_MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Mainnet USDT snapshot from ${rpcHost} at slot ${context.slot}`);
console.log(`  supply      ${formatUsdt(real.supply, real.decimals)} USDT (${real.decimals} decimals)`);
console.log(`  authority   ${manifest.mainnetMintAuthority} (mainnet) -> ${manifest.forkAuthority} (fork)`);
console.log(`  holders     ${holders.length} from ${picked.source}`);
for (const h of holders) {
  console.log(`    ${h.tokenAccount}  ${formatUsdt(BigInt(h.amount), real.decimals)} USDT${h.frozen ? '  [frozen]' : ''}`);
}
console.log(`Wrote ${2 + holders.length} accounts to fork/accounts/. Start the fork with \`pnpm run fork:node\`.`);
