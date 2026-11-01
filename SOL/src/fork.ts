// Local mainnet fork of Solana USDT: a solana-test-validator whose genesis holds account
// snapshots read from mainnet. Signing code paths connect through connectFork(), which
// refuses anything that is not a loopback validator.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Connection, Keypair } from '@solana/web3.js';

export const FORK_DIR = join(import.meta.dirname, '..', 'fork');
export const FORK_ACCOUNTS_DIR = join(FORK_DIR, 'accounts');
export const FORK_LEDGER_DIR = join(FORK_DIR, 'ledger');
export const FORK_MANIFEST_FILE = join(FORK_DIR, 'manifest.json');
const FORK_AUTHORITY_FILE = join(FORK_DIR, 'authority.json');

export const FORK_RPC_URL = process.env.FORK_RPC_URL ?? 'http://127.0.0.1:8899';
export const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

// Genesis hashes of the public clusters. A fork validator has its own, fresh genesis.
const PUBLIC_GENESIS: Record<string, string> = {
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d': 'mainnet-beta',
  EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG: 'devnet',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY': 'testnet',
};

export interface ForkHolder {
  tokenAccount: string;
  owner: string;
  amount: string;
  frozen: boolean;
}

export interface ForkManifest {
  source: string;
  slot: number;
  takenAt: string;
  mint: string;
  supply: string;
  decimals: number;
  mainnetMintAuthority: string | null;
  mainnetFreezeAuthority: string | null;
  forkAuthority: string;
  metadata: string;
  holderSource: string;
  holders: ForkHolder[];
}

/** Connect to the fork validator. Throws unless it is on loopback and not a public cluster. */
export async function connectFork(): Promise<Connection> {
  const { hostname } = new URL(FORK_RPC_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
    throw new Error(`refusing FORK_RPC_URL ${FORK_RPC_URL}: the fork runs on a loopback validator only`);
  }
  const connection = new Connection(FORK_RPC_URL, 'confirmed');
  const genesis = await connection.getGenesisHash().catch((e: Error) => {
    throw new Error(`no fork validator at ${FORK_RPC_URL} (${e.message}). Start it with \`pnpm run fork:node\`.`);
  });
  if (PUBLIC_GENESIS[genesis]) {
    throw new Error(`refusing ${FORK_RPC_URL}: genesis ${genesis} is ${PUBLIC_GENESIS[genesis]}, not a local fork`);
  }
  return connection;
}

/**
 * Throwaway key that replaces Tether's mint and freeze authority in the fork snapshot.
 * Created on first use under fork/ (gitignored, mode 0600). It only exists in the fork's genesis.
 */
export function loadOrCreateForkAuthority(): Keypair {
  if (existsSync(FORK_AUTHORITY_FILE)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(FORK_AUTHORITY_FILE, 'utf8'))));
  }
  const key = Keypair.generate();
  mkdirSync(FORK_DIR, { recursive: true });
  writeFileSync(FORK_AUTHORITY_FILE, JSON.stringify(Array.from(key.secretKey)), { mode: 0o600 });
  chmodSync(FORK_AUTHORITY_FILE, 0o600);
  return key;
}

export function loadForkAuthority(): Keypair {
  if (!existsSync(FORK_AUTHORITY_FILE)) throw new Error('no fork snapshot, run `pnpm run fork:snapshot` first');
  return loadOrCreateForkAuthority();
}

export function readManifest(): ForkManifest {
  if (!existsSync(FORK_MANIFEST_FILE)) throw new Error('no fork snapshot, run `pnpm run fork:snapshot` first');
  return JSON.parse(readFileSync(FORK_MANIFEST_FILE, 'utf8'));
}
