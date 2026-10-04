# mint-it

Stablecoin security research. The repository builds local and devnet replicas of Tether USD (USDT) and checks how minting, redemption, admin controls, and token-standard quirks behave.

The work studies the published USDT surfaces on Ethereum and Solana. It uses those replicas to ask who can change supply, who can freeze or seize balances, and which token behaviors differ from a plain ERC-20 or SPL token integration.

## Research focus

| Question | Where it shows up |
|---|---|
| Who can mint, and into which balance? | Ethereum `issue` credits the owner. Solana `mintTo` requires the mint authority. |
| Who can redeem or burn? | Ethereum `redeem` burns from the owner balance only. The Solana scripts cover minting. |
| What can an admin freeze, pause, or seize? | Ethereum blacklist, pause, and `destroyBlackFunds`. Solana freeze authority on token accounts. |
| How do fees and allowances behave? | Ethereum `setParams` (hard-capped) and the non-zero allowance reset. |
| What happens on upgrade? | Ethereum `deprecate` forwards ERC-20 calls. Legacy `issue` / `redeem` still write the old ledger. |
| Does the replica match mainnet? | Bytecode and metadata parity tests. Mainnet access in those tests is read-only. |

Collateral custody, oracle feeds, and peg-keeping contracts are outside this tree. The tokens are named and parameterized like USDT. Reserves and prices are unrepresented in the code.

## Layout

```
mint-it/
  ETH/              Hardhat replica of Ethereum mainnet USDT (local chain 31337)
  SOL/              SPL Token replica of Solana mainnet USDT (devnet)
  docs/             Research scope, chain notes, and security boundaries
  CONTRIBUTING.md   Setup, research boundary, and pull request expectations
  LICENSE           MIT license
```

Each package has its own README:

- [ETH/README.md](ETH/README.md) — local Hardhat chain, deploy, and mint
- [SOL/README.md](SOL/README.md) — devnet mint, metadata, and tests

## Prerequisites

- Node.js and pnpm. Install dependencies with pnpm in the package you are running.
- For `ETH/`: a free local port `8545`. Scripts refuse every chain id other than `31337`.
- For `SOL/`: the three keypair files described in the Solana README, and devnet SOL on the authority account for rent and fees.
- Outbound HTTPS for parity tests, which read public mainnet RPC endpoints.

## Run the Ethereum replica

From `ETH/`:

```bash
pnpm install
pnpm run keys                      # keys/owner.json and keys/wallet.json (idempotent)
pnpm run node                      # terminal 1: Hardhat node at 127.0.0.1:8545
pnpm run deploy                    # terminal 2: deploy TetherToken
AMOUNT=5000 pnpm run mint          # owner issue(), then transfer to the local wallet
pnpm test                          # behavior, mainnet bytecode parity, local deployment
```

`pnpm run mint` defaults to `1000000` USDT when `AMOUNT` is unset. The Hardhat node is in-memory. After a restart, run `deploy` and `mint` again.

## Run the Solana replica

From `SOL/`:

```bash
pnpm install
pnpm run create                    # create the devnet mint and Metaplex metadata (idempotent)
pnpm run mint -- 5000              # mint 5000 USDT to keys/wallet.json
pnpm run set-uri -- <metadata-url>
pnpm test                          # devnet checks; mainnet is read for parity
```

`pnpm run mint` defaults to `1000000` when the amount argument is omitted. `RPC_URL` selects the cluster and defaults to `https://api.devnet.solana.com`.

## Safety

This repository is defensive security research for a local Hardhat chain and Solana devnet. Keep mainnet use to the read-only parity checks already in the tests.

The material is research tooling and documentation. It is not financial advice, and it is not an invitation or a procedure for attacking live stablecoin systems. Details are in [docs/security.md](docs/security.md).

## Documentation

Read in this order when you are new to the tree:

1. This file, for the layout and the commands
2. [docs/overview.md](docs/overview.md) — scope and threat model
3. [docs/security.md](docs/security.md) — research boundaries and key handling
4. The package you are running: [ETH/README.md](ETH/README.md) or [SOL/README.md](SOL/README.md)
5. [docs/ethereum.md](docs/ethereum.md) or [docs/solana.md](docs/solana.md) — compiler parity, environment variables, and what the tests assert

## Contributing

Setup, the research boundary, secrets, style, and pull request expectations are in [CONTRIBUTING.md](CONTRIBUTING.md). Commit messages in this project follow Conventional Commits (`feat`, `fix`, `docs`, `test`, and similar), with an optional scope such as `eth` or `sol`.

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Alex.

`ETH/contracts/TetherToken.sol` is the published mainnet USDT source, kept so the local build can be compared with chain bytecode. The license covers this repository's scripts, tests, and docs.
