// Starts solana-test-validator with the fork/ snapshot as genesis state.
// Each start resets the ledger, so the fork always begins at the snapshot slot's balances.
// solana-test-validator listens for RPC (8899, 8900) and faucet (9900) on all interfaces.
// Usage: pnpm run fork:node [-- extra solana-test-validator flags]
import { spawn } from 'node:child_process';
import { FORK_ACCOUNTS_DIR, FORK_LEDGER_DIR, readManifest } from '../src/fork.ts';

const manifest = readManifest();
const extra = process.argv.slice(2);
if (extra[0] === '--') extra.shift(); // pnpm forwards the separator itself
const args = [
  '--reset',
  '--ledger', FORK_LEDGER_DIR,
  '--account-dir', FORK_ACCOUNTS_DIR,
  '--mint', manifest.forkAuthority, // genesis SOL goes to the fork authority, which pays fees
  ...extra,
];

console.log(`USDT mainnet fork: slot ${manifest.slot} snapshot, ${manifest.holders.length} holder accounts, ` +
  `authority ${manifest.forkAuthority}`);
const validator = spawn('solana-test-validator', args, { stdio: 'inherit' });
validator.on('error', (e: NodeJS.ErrnoException) => {
  console.error(e.code === 'ENOENT' ? 'solana-test-validator not found on PATH; install the Solana (Agave) CLI' : e);
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => validator.kill(signal));
validator.on('exit', (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
