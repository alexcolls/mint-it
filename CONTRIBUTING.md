# Contributing

Contributions are welcome when they stay inside this repository's research boundary: local and devnet replicas of Tether USD, plus read-only checks against public mainnet data. Read [docs/security.md](docs/security.md) before opening a change.

Suggested reading order:

1. [README.md](README.md) — what the repo studies and how to run both packages
2. [docs/overview.md](docs/overview.md) — the questions the code asks
3. [docs/security.md](docs/security.md) — where scripts may run, and how keys are handled
4. The package you are changing: [ETH/README.md](ETH/README.md) or [SOL/README.md](SOL/README.md)
5. The matching notes: [docs/ethereum.md](docs/ethereum.md) or [docs/solana.md](docs/solana.md)

## Research boundary

Useful changes include:

- Tests for mint, redeem, pause, blacklist, freeze, fees, allowances, and the Ethereum `deprecate` path
- Replica accuracy: bytecode, account layout, and metadata comparisons that read public mainnet endpoints
- Documentation when a command, environment variable, or the research scope changes
- Scripts that deploy and sign only on the local Hardhat chain (chain id `31337`) or on Solana devnet

This is defensive security research. A change that targets a live mainnet system, moves third-party funds, or ships an exploit procedure against a production stablecoin is outside the project. Collateral, oracle, and peg machinery are unrepresented in this tree; a pull request should keep that scope unless the documentation is updated in the same change to say what was added.

## Set up the Ethereum package

`ETH/` is installed with pnpm. From `ETH/`:

```bash
pnpm install
pnpm run keys                      # keys/owner.json and keys/wallet.json (idempotent)
pnpm run node                      # terminal 1: Hardhat node at 127.0.0.1:8545
pnpm run deploy                    # terminal 2: deploy TetherToken
AMOUNT=5000 pnpm run mint          # owner issue(), then transfer to the local wallet
pnpm test                          # behavior, mainnet bytecode parity, local deployment
```

`pnpm run keys` writes `keys/owner.json` and `keys/wallet.json` with mode `0600` and skips a file that already exists. `pnpm run deploy` and `pnpm run mint` call `assertLocalChain` and throw on every chain id other than `31337`. `pnpm run mint` calls `issue` and then `transfer`. Redemption is covered by `ETH/test/TetherToken.test.js` through `redeem`. The Hardhat node is in-memory, so a restart needs `deploy` and `mint` again.

`RPC_URL` defaults to `http://127.0.0.1:8545`. `MAINNET_RPC_URL` defaults to `https://ethereum-rpc.publicnode.com` and is used for read-only parity. `AMOUNT` defaults to `1000000`.

Details: [ETH/README.md](ETH/README.md) and [docs/ethereum.md](docs/ethereum.md).

## Set up the Solana package

`SOL/` is installed with pnpm. Scripts run through `tsx`. There is no key-generation script. The three files `keys/authority.json`, `keys/mint.json`, and `keys/wallet.json` must already exist as Solana keypair JSON arrays (the format `Keypair.fromSecretKey` reads). From `SOL/`, the Solana CLI can create them:

```bash
mkdir -p keys
solana-keygen new --outfile keys/authority.json --no-bip39-passphrase
solana-keygen new --outfile keys/mint.json --no-bip39-passphrase
solana-keygen new --outfile keys/wallet.json --no-bip39-passphrase
```

Fund the authority account with devnet SOL, then:

```bash
pnpm install
pnpm run create                    # create the devnet mint and Metaplex metadata (idempotent)
pnpm run mint -- 5000              # mint 5000 USDT to keys/wallet.json
pnpm run set-uri -- <metadata-url>
pnpm test                          # devnet checks; mainnet is read for parity
```

`pnpm run mint` defaults to `1000000` when the amount argument is omitted. Amounts with more than 6 decimal places are rejected. `RPC_URL` defaults to `https://api.devnet.solana.com`. The scripts sign with `keys/authority.json` and submit to whatever cluster `RPC_URL` names, so leave that variable on devnet. `MAINNET_RPC_URL` defaults to `https://api.mainnet-beta.solana.com` and is used for read-only parity. `pnpm test` loads the three key files at startup, so a missing file fails before the tests run.

Details: [SOL/README.md](SOL/README.md) and [docs/solana.md](docs/solana.md).

## Secrets

Leave these untracked. The root `.gitignore` lists all of them. `ETH/.gitignore` repeats the Ethereum paths, and `SOL/.gitignore` repeats `keys/` and the environment-file patterns:

- `keys/` (Ethereum private keys and mnemonics; Solana secret-key arrays)
- `.env` and `.env.*`
- `ETH/deployments/` (local contract address, owner address, deploy transaction hash)
- `scratch/`
- `*.pem`, `*.p12`, `secrets.json`, and `.secret`

Keep key material on the machine that runs the scripts. Leave it out of commits, docs, and pull requests.

## Style

Match the file you are editing. The repository has no Prettier, ESLint, Solhint, or EditorConfig configuration, and `SOL/` has no `tsconfig.json`.

- Ethereum scripts, libraries, and tests are CommonJS JavaScript (`require`), with two-space indentation, single quotes, and semicolons. `package.json` sets `"type": "commonjs"`.
- Solana sources are TypeScript ESM, with two-space indentation, single quotes, semicolons, and a `.ts` suffix on local imports, because `tsx` loads the files directly. `package.json` sets `"type": "module"`.
- `ETH/contracts/TetherToken.sol` is the published mainnet source used for bytecode comparison. Keep its formatting. `ETH/contracts/test/UpgradedTokenMock.sol` is a test-only successor and uses two-space indentation.

## Pull requests

- Keep each change to one concern.
- Include tests when behavior changes. Ethereum behavior belongs in `ETH/test/`. Solana devnet checks belong in `SOL/tests/`.
- Update the docs when a command, environment variable, or the research scope changes. That usually means the root [README.md](README.md), the package README, and the matching file under `docs/`.
- Preferred commit messages follow Conventional Commits. Use a type such as `feat`, `fix`, `docs`, `test`, `refactor`, or `chore`, an optional scope such as `eth` or `sol`, and a short description. Example: `docs: add a contribution guide`.
- Let git hooks run. Install dependencies with pnpm inside the package you touched.

`ETH/` and `SOL/` are directories of this repository, and their source files are already in the parent history. Run git from the repository root so new files are recorded here. This working tree has a single `.git`, at the root.

## License

By contributing, you agree that your contributions are licensed under the MIT license in [LICENSE](LICENSE). Copyright (c) 2026 Alex.
