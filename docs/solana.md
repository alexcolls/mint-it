# Solana replica

`SOL/` is an npm package named `minter`. It talks to Solana with `@solana/web3.js` and `@solana/spl-token`, and it writes Metaplex metadata with `@metaplex-foundation/mpl-token-metadata` and Umi. `tsx` executes the TypeScript sources directly. The token program is the legacy SPL Token program.

## What it reproduces

`src/common.ts` records the mainnet USDT mint `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` and the fields the replica copies:

- 6 decimals
- metadata name `USDT`, symbol `USDT` (the Ethereum replica's name string is `Tether USD`; each package follows its own chain)
- empty `uri`, seller fee basis points `0`, mutable metadata, no creators
- one authority for minting, freezing, and metadata updates

`scripts/create-usdt.ts` allocates a mint account, calls `InitializeMint2` with that authority as both mint and freeze authority, then `CreateMetadataAccountV3`. If the mint account already exists, the script prints the address and exits.

## Scripts

Run these from `SOL/` after `npm install`. The three files `keys/authority.json`, `keys/mint.json`, and `keys/wallet.json` must already exist. Each is a Solana keypair JSON array. Generate them before the first command; the scripts only load the files.

The authority account needs devnet SOL. Rent for the mint and transaction fees are paid by that key. Fund it from a devnet faucet.

| npm script | What it runs |
|---|---|
| `npm run create` | `tsx scripts/create-usdt.ts` |
| `npm run mint` | `tsx scripts/mint.ts` |
| `npm run set-uri` | `tsx scripts/set-uri.ts` |
| `npm test` | `tsx --test tests/*.test.ts` |

`mint.ts` reads the amount from the first argument (`npm run mint -- 5000`). The default is `1000000`. Amounts are converted with `toBaseUnits`, which rejects more than 6 decimal places. The script creates the wallet's associated token account if needed and then `mintTo`s.

`set-uri.ts` requires a URL, fetches it, and refuses a body without an `image` string. It then `updateV1`s the metadata. The local document for the logo JSON is `metadata/usdt.json`. The URL already used for this replica is `https://gist.githubusercontent.com/alexcolls/2634ef14ab71dd2eb441a25574dea4a4/raw/usdt.json`.

Public keys of the current working-copy key files:

- Mint `JC4T4vQU9Lnggi9wq3SYrevhCsc85WGkyUa1ExenHBo7`
- Authority `HFmXBChS65iNNhN8v9EsPoXLigUswa114f8c5ihZhHXg`
- Wallet `FTdim8undS54z8dLyLBUT5PvZYyQr625y5bxPt5WrStG`

Replacing `keys/mint.json` changes the mint address. `create` skips creation when that public key already holds an account on the cluster selected by `RPC_URL`.

## Environment

| Variable | Used by | Default |
|---|---|---|
| `RPC_URL` | Scripts and the devnet side of the tests | `https://api.devnet.solana.com` |
| `MAINNET_RPC_URL` | Read-only parity connection inside `tests/usdt.test.ts` | `https://api.mainnet-beta.solana.com` |

Point `RPC_URL` at devnet for this research. The scripts sign with the local authority and target the cluster that variable names. Ethereum deploy and mint abort unless the chain id is 31337. Keep `RPC_URL` on devnet when you run these commands.

## What the tests check

`tests/usdt.test.ts` is an integration suite against the configured RPC, with mainnet used as a read-only reference.

- The replica mint is owned by the legacy token program, has the same data length as mainnet USDT, 6 decimals, and the local authority as both mint and freeze authority. The test also checks that mainnet USDT's freeze authority equals its mint authority.
- Metadata name, symbol, seller fee, mutability, primary sale flag, creators, and collection match mainnet. `uri` is allowed to differ.
- The wallet associated-token account holds a positive balance and is owned by `keys/wallet.json`.
- A freshly generated signer cannot mint, cannot freeze, and cannot transfer the wallet's tokens.
- The freeze authority can freeze the wallet account, a transfer simulation fails while it is frozen, and thaw restores transfers. The test then moves 1 token unit to the authority's associated account and back so the wallet balance is unchanged at the end.

Because the freeze test sends real devnet transactions, a crash between freeze and thaw leaves the wallet token account frozen. The authority key can thaw it.

## Research limits on this chain

The Solana package models a single-key mint and freeze authority, which is the layout the parity test reads from mainnet USDT. Collateral, an oracle, a peg module, and a redeem script sit outside this package. Freeze is the control the tests use as the analogue of a blacklist: the authority can stop an account from transferring. Balance seizure of the kind Ethereum does with `destroyBlackFunds` lives only in the Ethereum package.
