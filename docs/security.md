# Security and research boundaries

This repository is defensive security research on stablecoin mint and admin behavior. The Ethereum scripts deploy and mint on a local Hardhat chain. The Solana scripts create and mint a devnet SPL token. Tests may read public mainnet RPC endpoints to compare bytecode, account data, and metadata. Those calls are JSON-RPC reads.

Suggested reading order: [../README.md](../README.md), [overview.md](overview.md), this page, then [ethereum.md](ethereum.md) or [solana.md](solana.md). Contribution rules are in [../CONTRIBUTING.md](../CONTRIBUTING.md).

The material is research tooling and documentation. It is not financial advice, and it is not an invitation or a procedure for attacking live stablecoin systems.

## Where this work runs

- Local Ethereum chain id `31337` (`npm run node` in `ETH/`). `deploy` and `mint` call `assertLocalChain` and abort on any other chain id. The Hardhat config defines `localhost` as its only network.
- Solana devnet, the default `RPC_URL` (`https://api.devnet.solana.com`). Solana scripts have no cluster-id check. They sign with `keys/authority.json` and submit to the cluster `RPC_URL` names, so set that variable to devnet before `create`, `mint`, `set-uri`, or `test`.
- Read-only mainnet comparison: Ethereum `eth_getCode` and `eth_call`; Solana `getAccountInfo` and metadata fetches against the published USDT mint.

Live mainnet USDT, other production stablecoins, and any attempt to move, freeze, or confuse balances on a network where third parties hold funds are outside this research. A balance minted here is a test balance.

## What the tests cover

The behaviors locked in by `ETH/test` and `SOL/tests` are who may mint, how redeem works on the Ethereum contract, pause and freeze, blacklist edges, fee caps, allowance rules, and deprecate forwarding. The Ethereum npm mint script calls `issue` and `transfer`. `redeem` is called from `ETH/test/TetherToken.test.js`. The in-process Ethereum behavior suite runs on Hardhat's built-in network. Parity tests need outbound network access.

## Keys and local files

Ethereum key files contain a hex private key and a mnemonic. `npm run keys` writes them with mode `0600` under `keys/`, and `test/local-deployment.test.js` checks that mode when the local node is up. Solana key files contain the raw secret-key bytes. The Solana package only reads those files; create them outside the scripts and keep them private on the machine that runs the commands.

Leave key material out of tickets, docs, and chat. The root and package `.gitignore` files already exclude:

- `keys/`
- `.env` and `.env.*`
- `deployments/` (`ETH/deployments/localhost.json` stores the local contract address, the owner address, and the deploy transaction hash)
- `scratch/`
- `*.pem`, `*.p12`, `secrets.json`, and `.secret`

## Mainnet reads

Parity defaults:

- Ethereum `MAINNET_RPC_URL`: `https://ethereum-rpc.publicnode.com`
- Solana `MAINNET_RPC_URL`: `https://api.mainnet-beta.solana.com`

Override them with your own read-only endpoints when the public ones rate-limit. Ethereum parity calls abort after 20 seconds and the suite allows 120 seconds. The Solana suite reads mainnet account info and metadata, and it signs devnet transactions with the local authority.

## Admin power is the object of study

On both replicas, one privileged key can increase supply. On Ethereum that key can also pause transfers, blacklist, destroy blacklisted balances, set a capped fee, and deprecate the token interface. On Solana that key can mint and freeze. The tests check that other signers cannot do those things. They also record USDT-specific edges (empty ERC-20 return data, allowance reset, blacklist applied to `_from` only, legacy ledger updates after `deprecate`) so integrators can see them on a local chain.

Collateral, oracles, and peg maintenance are unrepresented in this tree. A matching name, symbol, and decimals leaves reserves unrepresented in the code.

## License

The repository license is MIT. See [../LICENSE](../LICENSE). Copyright (c) 2026 Alex. `ETH/contracts/TetherToken.sol` is included as the published contract text required for bytecode parity. Contributions are under the same license; see [../CONTRIBUTING.md](../CONTRIBUTING.md).
