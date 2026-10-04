# Security and research boundaries

This repository is defensive security research on stablecoin mint and admin behavior. The Ethereum scripts deploy and mint on a local Hardhat chain. The Solana scripts create and mint a devnet SPL token. Tests may read public mainnet RPC endpoints to compare bytecode, account data, and metadata. Those calls are JSON-RPC reads.

## In scope

- Local Ethereum chain id `31337` (`npm run node` in `ETH/`). `deploy` and `mint` abort on any other chain id.
- Solana devnet, which is the default `RPC_URL` (`https://api.devnet.solana.com`).
- Read-only mainnet comparison: Ethereum `eth_getCode` and `eth_call`; Solana `getAccountInfo` and metadata fetches against the published USDT mint.
- The behaviors locked in by `ETH/test` and `SOL/tests`: who may mint, how redeem works on the Ethereum contract, pause and freeze, blacklist edges, fee caps, allowance rules, and deprecate forwarding.
- Handling of local key files. Ethereum `npm run keys` writes mode `0600`. Both `keys/` directories are gitignored.

## Out of scope

Live mainnet USDT, other production stablecoins, and any attempt to move, freeze, or confuse balances on a network where third parties hold funds are outside this research. The docs describe what the local tests assert. They are research notes, and they are not a procedure for attacking a deployed system.

The packages are research replicas for Hardhat and devnet. They are research tooling, and they are not financial advice. A balance minted here is a test balance.

## Keys and RPC endpoints

Ethereum key files contain a hex private key and a mnemonic. Solana key files contain the raw secret-key bytes. Keep them on the machine that runs the scripts, and leave them out of tickets, docs, and chat. Leave `RPC_URL` on devnet. The Solana mint path signs with `keys/authority.json` for whatever cluster that variable names.

`ETH/deployments/localhost.json` stores the local contract address, the owner address, and the deploy transaction hash. It is gitignored as machine-local state. `scratch/` is gitignored local dump space.

Parity defaults:

- Ethereum `MAINNET_RPC_URL`: `https://ethereum-rpc.publicnode.com`
- Solana `MAINNET_RPC_URL`: `https://api.mainnet-beta.solana.com`

Override them with your own read-only endpoints if the public ones rate-limit. The parity tests need outbound network access for those reads. The in-process Ethereum behavior suite (`TetherToken.test.js`) runs on Hardhat's local network.

## Admin power is the object of study

On both replicas, one privileged key can increase supply. On Ethereum that key can also pause transfers, blacklist, destroy blacklisted balances, set a capped fee, and deprecate the token interface. On Solana that key can mint and freeze. The tests check that other signers cannot do those things. They also record USDT-specific edges (empty ERC-20 return data, allowance reset, blacklist applied to `_from` only, legacy ledger updates after `deprecate`) so integrators can see them on a local chain.

Collateral, oracles, and peg maintenance sit outside this tree. A matching name, symbol, and decimals leaves reserves unrepresented in the code.

## License

The repository license is MIT. See [../LICENSE](../LICENSE). `ETH/contracts/TetherToken.sol` is included as the published contract text required for bytecode parity.
