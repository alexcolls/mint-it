# Ethereum replica

`ETH/` is an npm package named `minter-eth`. It uses Hardhat 2 and solc `0.4.18` (`package.json`, `hardhat.config.js`). The network block in the Hardhat config defines `localhost` only. `lib/common.js` exports `assertLocalChain`, and `scripts/deploy.js` and `scripts/mint.js` call it before sending transactions. Any chain id other than `31337` throws.

## Source and compiler

`contracts/TetherToken.sol` is the published mainnet USDT contract used for bytecode comparison. `lib/bytecode.js` compiles that file with solc-js 0.4.18, optimizer off, source unit name `TetherToken.sol`, and compares the deployed bytecode with `eth_getCode` on `0xdAC17F958D2ee523a2206206994597C13D831ec7`. The comparison strips the swarm `bzzr0` trailer (`a165627a7a72305820` + 32 bytes + `0029`), which changes when the source path differs from Tether's unpublished original.

Constructor arguments, from `USDT_SPEC` in `lib/common.js`:

- `_initialSupply`: `100000000000` (100,000 tokens at 6 decimals)
- name: `Tether USD`
- symbol: `USDT`
- decimals: `6`

The constructor mints that supply to the deployer and emits no `Transfer`.

`contracts/test/UpgradedTokenMock.sol` exists so tests can call `deprecate`. It accepts legacy forwarded calls only from the original token address.

## Scripts

Run these from `ETH/` after `npm install`.

| npm script | What it runs |
|---|---|
| `npm run keys` | `node scripts/create-keys.js` |
| `npm run node` | `hardhat node` |
| `npm run deploy` | `hardhat run scripts/deploy.js --network localhost` |
| `npm run mint` | `hardhat run scripts/mint.js --network localhost` |
| `npm test` | `hardhat test` |

`create-keys.js` writes `keys/owner.json` and `keys/wallet.json` with mode `0600`, and it skips a file that already exists. Deploy loads the owner key, sets its balance with `hardhat_setBalance` (100 ETH on the local node), deploys `TetherToken`, and writes `deployments/localhost.json` with `chainId`, `address`, `owner`, `txHash`, and `blockNumber`.

Mint reads `AMOUNT` (default `1000000`), parses it with 6 decimals, calls `issue`, then `transfer` to the wallet address. That follows the on-chain shape of an issuance: new tokens land on the owner, and a normal transfer moves them to the recipient.

The Hardhat node keeps state in memory. A new `npm run node` drops the contract. Run `deploy` and `mint` again. `local-deployment.test.js` skips itself when port `8545` is down, the chain id is wrong, or the saved address has no code.

## Environment

| Variable | Used by | Default |
|---|---|---|
| `RPC_URL` | Hardhat `localhost` network and the live-deployment test | `http://127.0.0.1:8545` |
| `MAINNET_RPC_URL` | `lib/bytecode.js` parity reads | `https://ethereum-rpc.publicnode.com` |
| `AMOUNT` | `scripts/mint.js` | `1000000` |

## Behaviors worth tracking

These are the outcomes asserted in `test/TetherToken.test.js`. They are properties of this USDT-shaped contract, checked locally.

**Supply.** Only the owner can `issue` or `redeem`. Issuance increases the owner balance. Redemption decreases it. Both use dedicated events (`Issue`, `Redeem`) and skip `Transfer`. Indexers that only watch `Transfer` miss supply changes, including the initial mint and `destroyBlackFunds`.

**Interface.** `transfer`, `transferFrom`, and `approve` have no return data. Integrators that require a boolean need a wrapper such as SafeERC20. Allowances cannot move from one non-zero value to another in a single `approve`. `MAX_UINT` allowances are not decremented.

**Pause.** Transfers stop. Approvals and new issuance continue.

**Blacklist.** The sender (`_from`) is checked. A blacklisted account can receive coins and can set allowances. A blacklisted spender can still pull approved funds. Destruction requires the address to be blacklisted first and is owner-only.

**Fees.** `setParams` rejects basis points of 20 or more and a max fee of 50 USDT or more. A fee-bearing transfer emits two `Transfer` events: one to the owner for the fee, one to the recipient for the remainder.

**Ownership.** Transfer to the zero address is a no-op. A real transfer emits no event. The new owner is the account `issue` credits.

**Deprecation.** Forwarded views hide legacy balances. Legacy `issue` still increases `_totalSupply` and the owner balance on the old contract, while `totalSupply()` reports the successor's supply.

## Tests and network

`npm test` always compiles and runs the in-process spec. The parity file needs HTTPS to mainnet and allows 120 seconds. The local-deployment file also checks that each key file is mode `0600` and that the stored private key and mnemonic derive the stored address. That file reads the key material; keep those tests on a machine where `keys/` is the local research keys.

This package is Hardhat. `lib/` is project source (`common.js`, `bytecode.js`).
