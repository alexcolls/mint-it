# SOL — Solana USDT replica

Devnet SPL token used for stablecoin security research. The mint follows the on-chain shape of mainnet Tether USD (`Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`): legacy Token program, 6 decimals, and one key for mint, freeze, and metadata update authority.

Package name: `minter`. Install dependencies with pnpm. Scripts run through `tsx`, which loads the TypeScript sources directly. The client uses the legacy SPL Token program.

## Parity with mainnet

| Property | Mainnet USDT | This replica |
|---|---|---|
| Program | Legacy SPL Token (`Tokenkeg…`) | Same program id |
| Decimals | 6 | 6 |
| Mint, freeze, and update authority | One key | One key, `keys/authority.json` |
| Metadata | name `USDT`, symbol `USDT`, uri empty, 0 seller fee, no creators, mutable | Same fields at creation |

`src/common.ts` sets `uri` to an empty string, matching mainnet. `pnpm run set-uri` can point the mint at a hosted JSON afterward so wallets that read Metaplex metadata can load a logo. A copy of that JSON lives in [`metadata/usdt.json`](metadata/usdt.json). The hosted file used for this replica is:

https://gist.githubusercontent.com/alexcolls/2634ef14ab71dd2eb441a25574dea4a4/raw/usdt.json

The `image` field is the USDT logo from the Solana token list. Mainnet USDT leaves `uri` empty and relies on token lists.

`CreateMetadataAccountV3` sets `tokenStandard` to Fungible. Mainnet USDT metadata was created with the legacy v1 instruction, which leaves `tokenStandard` unset. The parity test compares name, symbol, seller fee, mutability, creators, and collection, and it skips `uri` for that reason.

## Devnet addresses

These are the public keys of the key files in this working copy:

- Mint: `JC4T4vQU9Lnggi9wq3SYrevhCsc85WGkyUa1ExenHBo7`
- Authority: `HFmXBChS65iNNhN8v9EsPoXLigUswa114f8c5ihZhHXg`
- Wallet: `FTdim8undS54z8dLyLBUT5PvZYyQr625y5bxPt5WrStG`

## Keys

`keys/` is gitignored. The scripts expect three Solana CLI keypair files (JSON arrays of secret-key bytes):

- `authority.json` — mint authority, freeze authority, metadata update authority, and fee payer
- `mint.json` — keypair whose public key is the mint account address
- `wallet.json` — owner of the associated token account that receives minted USDT

This package only loads keys. Generate the three files with the Solana CLI before the first command, and fund `authority.json` with devnet SOL from a faucet. The `solana-keygen` commands are in [../CONTRIBUTING.md](../CONTRIBUTING.md).

## Setup and commands

Requirements: Node.js and pnpm. Install from this directory.

```bash
pnpm install
pnpm run create
pnpm run mint -- 5000
pnpm run set-uri -- https://gist.githubusercontent.com/alexcolls/2634ef14ab71dd2eb441a25574dea4a4/raw/usdt.json
pnpm test
```

| Script | Command | Role |
|---|---|---|
| `create` | `tsx scripts/create-usdt.ts` | Create the mint (6 decimals, mint authority = freeze authority) and Metaplex metadata. If the mint account already exists, the script prints its address and exits |
| `mint` | `tsx scripts/mint.ts` | `mintTo` the wallet associated-token account. Argument is a human amount; default `1000000` |
| `set-uri` | `tsx scripts/set-uri.ts` | Set metadata `uri` after fetching the URL. The JSON must include an `image` field |
| `test` | `tsx --test tests/*.test.ts` | Devnet integration tests. Mainnet is read for account and metadata parity |
| `fork:snapshot` | `tsx scripts/fork-snapshot.ts` | Read the mainnet USDT mint, metadata, and holder accounts into `fork/` |
| `fork:node` | `tsx scripts/fork-node.ts` | Start `solana-test-validator` with that snapshot as genesis |
| `fork:test` | `tsx --test tests/fork/*.test.ts` | Authority, mint, and freeze checks against the fork |

Environment:

- `RPC_URL` — cluster for scripts and devnet assertions. Default `https://api.devnet.solana.com`.
- `MAINNET_RPC_URL` — read-only endpoint for parity. Default `https://api.mainnet-beta.solana.com`.

`RPC_URL` selects the cluster. Leave it on the devnet default when you run these commands. The scripts sign with `keys/authority.json` and submit to the cluster that variable names.

`pnpm test` loads the three key files at startup, so a missing file fails before any test runs. It talks to devnet, and it expects the mint to exist and the wallet balance to be above zero. The freeze test freezes the wallet token account, checks that a transfer fails, thaws it in a `finally` block, then moves 1 USDT (`10^6` base units) out and back. A process kill between freeze and thaw can leave the account frozen; the authority key can thaw it.

## Local mainnet fork

Real mainnet USDT state loaded into a local `solana-test-validator`. The snapshot only reads mainnet. Every transaction goes to the local validator. Requires the Solana (Agave) CLI on `PATH`; the devnet key files are not used.

```bash
pnpm run fork:snapshot             # read mint, metadata, and holder accounts from mainnet into fork/
pnpm run fork:node                 # terminal 1: solana-test-validator with that snapshot as genesis
pnpm run fork:test                 # terminal 2: authority, mint, and freeze checks on the fork
```

The snapshot is taken at one slot and holds:

- The mint account at the real address `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`, with its mainnet supply and decimals. Its mint and freeze authority are replaced with `fork/authority.json`, a throwaway key the script creates (mode `0600`). Tether's key is recorded in `fork/manifest.json`.
- The Metaplex metadata account, unchanged. Its update authority stays Tether's key.
- Holder token accounts with their balances. `FORK_HOLDERS` takes a comma-separated list of token accounts or wallets; a wallet maps to its USDT associated token account. Without it, the script asks for the largest accounts (`FORK_HOLDER_COUNT`, default 5). The public endpoint refuses that call, so the script falls back to non-empty accounts from the mint's recent transactions. That fallback skips transactions newer than v0, which `@solana/web3.js` v1 cannot decode.

Transaction history cannot be carried over. A validator's genesis holds account state only, so the fork starts at the snapshot with no earlier transactions. Accounts outside the snapshot do not exist on the fork, so the cloned balances add up to less than the supply.

`fork:node` resets `fork/ledger` on every start and gives the fork authority the genesis SOL. Extra flags pass through to the validator: `pnpm run fork:node -- --quiet`. `solana-test-validator` listens for RPC (8899, 8900) and its faucet (9900) on all interfaces, even with `--bind-address 127.0.0.1`. Block those ports on an untrusted network.

`fork:test` connects through `FORK_RPC_URL` (default `http://127.0.0.1:8899`). It refuses a host other than loopback and a validator whose genesis hash is mainnet, devnet, or testnet. Checks that act as a key nobody holds here, Tether's authority or a holder, are simulations with signature verification off. Each test undoes its own state changes, so the suite can rerun against one running validator.

Further notes: [../docs/solana.md](../docs/solana.md), [../docs/security.md](../docs/security.md), and [../CONTRIBUTING.md](../CONTRIBUTING.md).
