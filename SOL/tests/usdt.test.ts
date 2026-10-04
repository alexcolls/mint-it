// Integration tests against devnet. Mainnet is only read (parity checks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID, createFreezeAccountInstruction, createMintToInstruction, createThawAccountInstruction,
  createTransferCheckedInstruction, getAccount, getAssociatedTokenAddressSync, getMint,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { fetchMetadataFromSeeds, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { MAINNET_USDT_MINT, RPC_URL, USDT_SPEC, connection, loadKeypair } from '../src/common.ts';

const MAINNET_RPC = process.env.MAINNET_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const authority = loadKeypair('authority');
const mint = loadKeypair('mint').publicKey;
const wallet = loadKeypair('wallet');
const walletAta = getAssociatedTokenAddressSync(mint, wallet.publicKey);
const ONE = 10n ** BigInt(USDT_SPEC.decimals);

async function metadataOf(rpc: string, m: string) {
  return fetchMetadataFromSeeds(createUmi(rpc).use(mplTokenMetadata()), { mint: publicKey(m) });
}

/** Simulates a tx (fee payer = authority) and returns the error, if any. */
async function simulateErr(ixs: Parameters<Transaction['add']>, signers: Keypair[]) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(authority, ...signers);
  return (await connection.simulateTransaction(tx)).value.err;
}

test('mint account matches mainnet USDT characteristics', async () => {
  const mainnet = new Connection(MAINNET_RPC, 'confirmed');
  const [realInfo, oursInfo] = await Promise.all([
    mainnet.getAccountInfo(new PublicKey(MAINNET_USDT_MINT)), connection.getAccountInfo(mint),
  ]);
  assert.ok(realInfo && oursInfo);
  assert.equal(oursInfo.owner.toBase58(), realInfo.owner.toBase58(), 'token program');
  assert.ok(oursInfo.owner.equals(TOKEN_PROGRAM_ID), 'legacy SPL Token, not Token-2022');
  assert.equal(oursInfo.data.length, realInfo.data.length, 'account size (no extensions)');

  const [real, ours] = await Promise.all([
    getMint(mainnet, new PublicKey(MAINNET_USDT_MINT)), getMint(connection, mint),
  ]);
  assert.equal(ours.decimals, real.decimals);
  assert.equal(ours.isInitialized, real.isInitialized);
  // Same authority model: one key controls minting and freezing.
  assert.ok(real.mintAuthority && real.freezeAuthority?.equals(real.mintAuthority));
  assert.ok(ours.mintAuthority?.equals(authority.publicKey));
  assert.ok(ours.freezeAuthority?.equals(authority.publicKey));
});

test('Metaplex metadata matches mainnet USDT', async () => {
  const [real, ours] = await Promise.all([
    metadataOf(MAINNET_RPC, MAINNET_USDT_MINT), metadataOf(RPC_URL, mint.toBase58()),
  ]);
  // uri is excluded: mainnet USDT leaves it empty, we may point it at a logo JSON.
  for (const f of ['name', 'symbol', 'sellerFeeBasisPoints', 'isMutable', 'primarySaleHappened'] as const) {
    assert.deepEqual(ours[f], real[f], f);
  }
  assert.deepEqual(ours.creators, real.creators);
  assert.deepEqual(ours.collection, real.collection);
  // Update authority is the same key as mint/freeze authority, like Tether.
  assert.equal(ours.updateAuthority.toString(), authority.publicKey.toBase58());
});

test('local wallet holds minted USDT', async () => {
  const acc = await getAccount(connection, walletAta);
  assert.ok(acc.owner.equals(wallet.publicKey));
  assert.ok(acc.mint.equals(mint));
  assert.ok(acc.amount > 0n);
  assert.equal(acc.isFrozen, false);
});

test('SECURITY: non-authority cannot mint', async () => {
  const attacker = Keypair.generate();
  const err = await simulateErr([createMintToInstruction(mint, walletAta, attacker.publicKey, 1_000_000n * ONE)], [attacker]);
  assert.ok(err, 'unauthorized mint must fail');
});

test('SECURITY: non-authority cannot freeze', async () => {
  const attacker = Keypair.generate();
  const err = await simulateErr([createFreezeAccountInstruction(walletAta, mint, attacker.publicKey)], [attacker]);
  assert.ok(err, 'unauthorized freeze must fail');
});

test('SECURITY: non-owner cannot move wallet funds', async () => {
  const attacker = Keypair.generate();
  const dest = getAssociatedTokenAddressSync(mint, authority.publicKey);
  const err = await simulateErr(
    [createTransferCheckedInstruction(walletAta, mint, dest, attacker.publicKey, ONE, USDT_SPEC.decimals)], [attacker],
  );
  assert.ok(err, 'transfer signed by non-owner must fail');
});

test('freeze blocks transfers (Tether blacklist behavior), thaw restores them', async () => {
  const dest = (await getOrCreateAssociatedTokenAccount(connection, authority, mint, authority.publicKey)).address;
  const transfer = createTransferCheckedInstruction(walletAta, mint, dest, wallet.publicKey, ONE, USDT_SPEC.decimals);

  await sendAndConfirmTransaction(connection,
    new Transaction().add(createFreezeAccountInstruction(walletAta, mint, authority.publicKey)), [authority]);
  try {
    assert.equal((await getAccount(connection, walletAta)).isFrozen, true);
    assert.ok(await simulateErr([transfer], [wallet]), 'transfer from frozen account must fail');
  } finally {
    await sendAndConfirmTransaction(connection,
      new Transaction().add(createThawAccountInstruction(walletAta, mint, authority.publicKey)), [authority]);
  }
  assert.equal((await getAccount(connection, walletAta)).isFrozen, false);

  // Thawed: a real transfer succeeds; send it back so the wallet balance is unchanged.
  const before = (await getAccount(connection, walletAta)).amount;
  await sendAndConfirmTransaction(connection, new Transaction().add(transfer), [authority, wallet]);
  assert.equal((await getAccount(connection, walletAta)).amount, before - ONE);
  await sendAndConfirmTransaction(connection, new Transaction().add(
    createTransferCheckedInstruction(dest, mint, walletAta, authority.publicKey, ONE, USDT_SPEC.decimals)), [authority]);
  assert.equal((await getAccount(connection, walletAta)).amount, before);
});
