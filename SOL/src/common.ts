import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Connection, Keypair } from '@solana/web3.js';

/**
 * On-chain characteristics of Tether USD on Solana mainnet
 * (mint Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB), read from mainnet.
 *  - SPL Token program (legacy Tokenkeg, NOT Token-2022)
 *  - 6 decimals
 *  - mint authority == freeze authority == metadata update authority (one key)
 *  - Metaplex metadata: name "USDT", symbol "USDT", empty uri, 0 royalties,
 *    no creators, mutable
 */
export const USDT_SPEC = {
  decimals: 6,
  name: 'USDT',
  symbol: 'USDT',
  uri: '',
  sellerFeeBasisPoints: 0,
  isMutable: true,
} as const;

export const MAINNET_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

export const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
export const connection = new Connection(RPC_URL, 'confirmed');

const KEYS_DIR = join(import.meta.dirname, '..', 'keys');

export function loadKeypair(name: 'authority' | 'mint' | 'wallet'): Keypair {
  const secret = JSON.parse(readFileSync(join(KEYS_DIR, `${name}.json`), 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/** Convert a human amount (e.g. "1000000.5") to base units without float error. */
export function toBaseUnits(amount: string, decimals = USDT_SPEC.decimals): bigint {
  const [whole, frac = ''] = amount.split('.');
  if (frac.length > decimals) throw new Error(`max ${decimals} decimals`);
  return BigInt(whole + frac.padEnd(decimals, '0'));
}
