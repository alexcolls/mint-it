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

Environment:

- `RPC_URL` — cluster for scripts and devnet assertions. Default `https://api.devnet.solana.com`.
- `MAINNET_RPC_URL` — read-only endpoint for parity. Default `https://api.mainnet-beta.solana.com`.

`RPC_URL` selects the cluster. Leave it on the devnet default when you run these commands. The scripts sign with `keys/authority.json` and submit to the cluster that variable names.

`pnpm test` loads the three key files at startup, so a missing file fails before any test runs. It talks to devnet, and it expects the mint to exist and the wallet balance to be above zero. The freeze test freezes the wallet token account, checks that a transfer fails, thaws it in a `finally` block, then moves 1 USDT (`10^6` base units) out and back. A process kill between freeze and thaw can leave the account frozen; the authority key can thaw it.

Further notes: [../docs/solana.md](../docs/solana.md), [../docs/security.md](../docs/security.md), and [../CONTRIBUTING.md](../CONTRIBUTING.md).
