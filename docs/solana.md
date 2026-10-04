# Solana replica

`SOL/` is an npm package named `minter`. It talks to Solana with `@solana/web3.js` and `@solana/spl-token`, and it writes Metaplex metadata with `@metaplex-foundation/mpl-token-metadata` and Umi. `tsx` executes the TypeScript sources directly. There is no `tsconfig.json`. The token program is the legacy SPL Token program.

Commands and the setup sequence are in [../SOL/README.md](../SOL/README.md). Part of the reading order in [overview.md](overview.md). Boundaries and key handling are in [security.md](security.md).

## What it reproduces

`src/common.ts` records the mainnet USDT mint `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` and the fields the replica copies:

- 6 decimals
- metadata name `USDT`, symbol `USDT` (the Ethereum replica's name string is `Tether USD`; each package follows its own chain)
- empty `uri`, seller fee basis points `0`, mutable metadata, no creators
- one authority for minting, freezing, and metadata updates

`scripts/create-usdt.ts` allocates a mint account, calls `InitializeMint2` with that authority as both mint and freeze authority, then `CreateMetadataAccountV3`. If the mint account already exists, the script prints the address and exits. `CreateMetadataAccountV3` sets `tokenStandard` to Fungible. Mainnet USDT metadata was created with the legacy v1 instruction, which leaves `tokenStandard` unset. The parity test compares name, symbol, seller fee, mutability, primary sale flag, creators, and collection, and it allows `uri` to differ.

The local document for the logo JSON is `metadata/usdt.json`. The URL already used for this replica is `https://gist.githubusercontent.com/alexcolls/2634ef14ab71dd2eb441a25574dea4a4/raw/usdt.json`.

## Keys and scripts

Run these from `SOL/` after `npm install`. The three files `keys/authority.json`, `keys/mint.json`, and `keys/wallet.json` must already exist. Each is a Solana keypair JSON array. This package has no key-generation script; the scripts only load the files. Create them with the Solana CLI as shown in [../CONTRIBUTING.md](../CONTRIBUTING.md), and fund the authority account with devnet SOL. Rent for the mint and transaction fees are paid by that key.

| npm script | What it runs |
|---|---|
| `npm run create` | `tsx scripts/create-usdt.ts` |
| `npm run mint` | `tsx scripts/mint.ts` |
| `npm run set-uri` | `tsx scripts/set-uri.ts` |
| `npm test` | `tsx --test tests/*.test.ts` |

`mint.ts` reads the amount from the first argument (`npm run mint -- 5000`). The default is `1000000`. Amounts are converted with `toBaseUnits`, which rejects more than 6 decimal places. The script creates the wallet's associated token account if needed and then `mintTo`s. There is no redeem script in this package.

`set-uri.ts` requires a URL argument. It fetches that URL, requires an HTTP success, and requires a JSON object with an `image` value. It then `updateV1`s the metadata.

Public keys of the key files in this working copy:

- Mint `JC4T4vQU9Lnggi9wq3SYrevhCsc85WGkyUa1ExenHBo7`
- Authority `HFmXBChS65iNNhN8v9EsPoXLigUswa114f8c5ihZhHXg`
- Wallet `FTdim8undS54z8dLyLBUT5PvZYyQr625y5bxPt5WrStG`

Replacing `keys/mint.json` changes the mint address. `create` skips creation when that public key already holds an account on the cluster selected by `RPC_URL`.

## Environment

| Variable | Used by | Default |
|---|---|---|
| `RPC_URL` | Scripts and the devnet side of the tests | `https://api.devnet.solana.com` |
| `MAINNET_RPC_URL` | Read-only parity connection inside `tests/usdt.test.ts` | `https://api.mainnet-beta.solana.com` |

The connection uses commitment `confirmed`. `RPC_URL` selects the cluster. The scripts sign with the local authority and submit to the cluster that variable names. Leave `RPC_URL` on devnet for this research. The Ethereum package's chain-id guard is documented in [ethereum.md](ethereum.md).

## What the tests check

`tests/usdt.test.ts` is an integration suite against the configured RPC, with mainnet used as a read-only reference. The file calls `loadKeypair` at import time, so `npm test` exits before the tests run when any of the three key files is missing. It expects the mint account to exist and the wallet balance to be above zero.

- The replica mint is owned by the legacy token program, has the same data length as mainnet USDT, 6 decimals, and the local authority as both mint and freeze authority. The test also checks that mainnet USDT's freeze authority equals its mint authority.
- Metadata name, symbol, seller fee, mutability, primary sale flag, creators, and collection match mainnet. `uri` is allowed to differ. The update authority is the local authority.
- The wallet associated-token account holds a positive balance, is owned by `keys/wallet.json`, and is unfrozen at the start of that check.
- A freshly generated signer cannot mint, cannot freeze, and cannot transfer the wallet's tokens. Those three checks are simulations.
- The freeze authority can freeze the wallet account. A transfer simulation fails while it is frozen. Thaw runs in a `finally` block, so an assertion failure still thaws. The test then moves 1 USDT (`10^6` base units) to the authority's associated account and back, so the wallet balance is unchanged at the end.

A killed process can still stop between freeze and thaw and leave the wallet token account frozen. The authority key can thaw it.

## Research limits on this chain

The Solana package models a single-key mint and freeze authority, which is the layout the parity test reads from mainnet USDT. Collateral, an oracle, a peg module, and a redeem script are unrepresented here. Freeze is the control the tests use as the analogue of a blacklist: the authority can stop an account from transferring. Balance seizure of the kind Ethereum does with `destroyBlackFunds` lives in the Ethereum package.
