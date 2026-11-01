// Tests against the local mainnet fork: `pnpm run fork:snapshot`, then `pnpm run fork:node`.
// Every call goes to the loopback validator; connectFork() refuses public clusters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Keypair, PublicKey, type SimulatedTransactionAccountInfo, type TransactionInstruction, TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  AccountLayout, TOKEN_PROGRAM_ID, createBurnInstruction, createFreezeAccountInstruction, createMintToInstruction,
  createThawAccountInstruction, createTransferCheckedInstruction, getAccount, getMint, getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { fetchMetadataFromSeeds, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { USDT_SPEC } from '../../src/common.ts';
import { FORK_RPC_URL, connectFork, loadForkAuthority, readManifest } from '../../src/fork.ts';

const manifest = readManifest();
const connection = await connectFork();
const authority = loadForkAuthority();
const mint = new PublicKey(manifest.mint);
const ONE = 10n ** BigInt(manifest.decimals);
const authorityAta = (await getOrCreateAssociatedTokenAccount(connection, authority, mint, authority.publicKey)).address;
const holder = manifest.holders.find((h) => !h.frozen && BigInt(h.amount) >= ONE);
const needsHolder = { skip: holder ? false : 'snapshot has no unfrozen holder with at least 1 USDT' };

// SPL Token program error codes (TokenError enum).
const OWNER_MISMATCH = { InstructionError: [0, { Custom: 4 }] };
const ACCOUNT_FROZEN = { InstructionError: [0, { Custom: 17 }] };

/**
 * Fee payer is the fork authority. The blockhash is the confirmed one: web3.js would otherwise use the
 * finalized one, which stays at genesis for the fork's first ~32 slots, so back-to-back runs would
 * build byte-identical (already processed) transactions.
 */
async function build(ixs: TransactionInstruction[]) {
  const latest = await connection.getLatestBlockhash('confirmed');
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: authority.publicKey, recentBlockhash: latest.blockhash, instructions: ixs,
  }).compileToV0Message());
  return { tx, latest };
}

async function send(...ixs: TransactionInstruction[]) {
  const { tx, latest } = await build(ixs);
  tx.sign([authority]);
  const signature = await connection.sendTransaction(tx);
  const { value } = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  if (value.err) throw new Error(`${signature} failed: ${JSON.stringify(value.err)}`);
}

/**
 * Without `signers`, signatures are not verified, so a key nobody here holds (Tether's, a holder's)
 * can appear as a signer. `watch` returns the post-state of those accounts.
 */
async function simulate(ixs: TransactionInstruction[], opts: { signers?: Keypair[]; watch?: PublicKey[] } = {}) {
  const { tx } = await build(ixs);
  if (opts.signers) tx.sign([authority, ...opts.signers]);
  const { value } = await connection.simulateTransaction(tx, {
    sigVerify: !!opts.signers,
    accounts: opts.watch && { encoding: 'base64', addresses: opts.watch.map((k) => k.toBase58()) },
  });
  return value;
}

const amountOf = (acc: SimulatedTransactionAccountInfo | null) =>
  AccountLayout.decode(Buffer.from(acc!.data[0], 'base64')).amount;

test('fork serves the mainnet mint: program, supply, decimals', async () => {
  assert.ok((await connection.getAccountInfo(mint))?.owner.equals(TOKEN_PROGRAM_ID), 'legacy SPL Token');
  const m = await getMint(connection, mint);
  assert.equal(m.supply.toString(), manifest.supply, `supply at mainnet slot ${manifest.slot}`);
  assert.equal(m.decimals, USDT_SPEC.decimals);
  assert.equal(m.isInitialized, true);
});

test('mint and freeze authority are the fork key, not Tether\'s', async () => {
  const m = await getMint(connection, mint);
  assert.ok(m.mintAuthority?.equals(authority.publicKey));
  assert.ok(m.freezeAuthority?.equals(authority.publicKey));
  assert.equal(manifest.mainnetFreezeAuthority, manifest.mainnetMintAuthority, 'mainnet: one key mints and freezes');
  assert.notEqual(manifest.mainnetMintAuthority, manifest.forkAuthority);
});

test('Metaplex metadata is the unpatched mainnet account', async () => {
  const md = await fetchMetadataFromSeeds(createUmi(FORK_RPC_URL).use(mplTokenMetadata()), { mint: publicKey(manifest.mint) });
  assert.equal(md.publicKey.toString(), manifest.metadata);
  assert.equal(md.name.replace(/\0/g, ''), USDT_SPEC.name);
  assert.equal(md.symbol.replace(/\0/g, ''), USDT_SPEC.symbol);
  assert.equal(md.updateAuthority.toString(), manifest.mainnetMintAuthority, 'update authority stays Tether\'s key');
});

test('holder accounts carry their mainnet balances', { skip: manifest.holders.length ? false : 'no holders in snapshot' },
  async () => {
    for (const h of manifest.holders) {
      const acc = await getAccount(connection, new PublicKey(h.tokenAccount));
      assert.ok(acc.mint.equals(mint));
      assert.equal(acc.owner.toBase58(), h.owner);
      assert.equal(acc.amount.toString(), h.amount, h.tokenAccount);
      assert.equal(acc.isFrozen, h.frozen);
    }
  });

test('SECURITY: Tether\'s mainnet key has no mint power on the fork', async () => {
  const tether = new PublicKey(manifest.mainnetMintAuthority!);
  const { err } = await simulate([createMintToInstruction(mint, authorityAta, tether, ONE)]);
  assert.deepEqual(err, OWNER_MISMATCH);
});

test('SECURITY: a signing key without authority cannot mint or freeze', async () => {
  const attacker = Keypair.generate();
  const mintErr = (await simulate([createMintToInstruction(mint, authorityAta, attacker.publicKey, ONE)], { signers: [attacker] })).err;
  assert.deepEqual(mintErr, OWNER_MISMATCH, 'mint');
  const freezeErr = (await simulate([createFreezeAccountInstruction(authorityAta, mint, attacker.publicKey)], { signers: [attacker] })).err;
  assert.deepEqual(freezeErr, OWNER_MISMATCH, 'freeze');
});

test('authority issues new supply on top of the real one, then burns it', async () => {
  const amount = 1_000_000n * ONE;
  const before = (await getMint(connection, mint)).supply;
  await send(createMintToInstruction(mint, authorityAta, authority.publicKey, amount));
  try {
    assert.equal((await getMint(connection, mint)).supply, before + amount);
    assert.equal((await getAccount(connection, authorityAta)).amount, amount);
  } finally {
    await send(createBurnInstruction(authorityAta, mint, authority.publicKey, amount));
  }
  assert.equal((await getMint(connection, mint)).supply, before);
});

// Simulated so the holder keeps its snapshot balance across runs.
test('authority can credit a real holder account directly', needsHolder, async () => {
  const account = new PublicKey(holder!.tokenAccount);
  const amount = 500n * ONE;
  const res = await simulate([createMintToInstruction(mint, account, authority.publicKey, amount)], { watch: [account] });
  assert.equal(res.err, null);
  assert.equal(amountOf(res.accounts![0]), BigInt(holder!.amount) + amount);
});

test('freeze locks a real holder out of their USDT; thaw restores it', needsHolder, async () => {
  const account = new PublicKey(holder!.tokenAccount);
  // The holder's own transfer, simulated without their signature.
  const transfer = createTransferCheckedInstruction(
    account, mint, authorityAta, new PublicKey(holder!.owner), ONE, manifest.decimals,
  );
  assert.equal((await simulate([transfer])).err, null, 'transfer works before freeze');

  await send(createFreezeAccountInstruction(account, mint, authority.publicKey));
  try {
    assert.equal((await getAccount(connection, account)).isFrozen, true);
    assert.deepEqual((await simulate([transfer])).err, ACCOUNT_FROZEN);
  } finally {
    await send(createThawAccountInstruction(account, mint, authority.publicKey));
  }
  assert.equal((await getAccount(connection, account)).isFrozen, false);
  assert.equal((await simulate([transfer])).err, null, 'transfer works after thaw');
});
