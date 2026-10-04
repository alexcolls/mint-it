# Ethereum replica

`ETH/` is an npm package named `minter-eth`. It uses Hardhat 2 and solc `0.4.18` (`package.json`, `hardhat.config.js`). Commands and the setup sequence are in [../ETH/README.md](../ETH/README.md).

Part of the reading order in [overview.md](overview.md). Boundaries and key handling are in [security.md](security.md).

## Chain guard

The Hardhat config defines a single network, `localhost`, whose URL is `RPC_URL` or `http://127.0.0.1:8545`. `lib/common.js` exports `assertLocalChain`. `scripts/deploy.js` and `scripts/mint.js` call it before sending transactions. Any chain id other than `31337` throws.

`npm test` compiles and runs the behavior spec on Hardhat's in-process network. `assertLocalChain` runs in `deploy` and `mint`. The live-node checks in `test/local-deployment.test.js` skip themselves when the provider at `RPC_URL` is unreachable, the chain id is wrong, the deployment file is missing, or the saved address has no code.

## Source and compiler

`contracts/TetherToken.sol` is the published mainnet USDT contract used for bytecode comparison. `lib/bytecode.js` compiles that file with solc-js 0.4.18, optimizer off, source unit name `TetherToken.sol`, and compares the deployed bytecode with `eth_getCode` on `0xdAC17F958D2ee523a2206206994597C13D831ec7`. The comparison strips the swarm `bzzr0` trailer (`a165627a7a72305820` + 32 bytes + `0029`), which changes when the source path differs from Tether's unpublished original. Each parity RPC call aborts after 20 seconds.

Constructor arguments, from `USDT_SPEC` in `lib/common.js`:

- `_initialSupply`: `100000000000` (100,000 tokens at 6 decimals)
- name: `Tether USD`
- symbol: `USDT`
- decimals: `6`

The constructor mints that supply to the deployer and emits no `Transfer`.

`contracts/test/UpgradedTokenMock.sol` exists so tests can call `deprecate`. It accepts legacy forwarded calls only from the original token address.

## Environment

| Variable | Used by | Default |
|---|---|---|
| `RPC_URL` | Hardhat `localhost` network and the live-deployment test | `http://127.0.0.1:8545` |
| `MAINNET_RPC_URL` | `lib/bytecode.js` parity reads | `https://ethereum-rpc.publicnode.com` |
| `AMOUNT` | `scripts/mint.js` | `1000000` |

## Scripts

Run these from `ETH/` after `npm install`. The command table is in [../ETH/README.md](../ETH/README.md).

`create-keys.js` creates `keys/` with mode `0700` and writes `keys/owner.json` and `keys/wallet.json` with mode `0600`. It skips a file that already exists. Each file stores `address`, `privateKey`, and `mnemonic`.

Deploy loads the owner key, sets its balance with `hardhat_setBalance` (100 ETH on the local node), deploys `TetherToken`, and writes `deployments/localhost.json` with `chainId`, `address`, `owner`, `txHash`, and `blockNumber`.

Mint reads `AMOUNT` (default `1000000`), parses it with 6 decimals, calls `issue`, then `transfer` to the wallet address. That follows the on-chain shape of an issuance: new tokens land on the owner, and a normal transfer moves them to the recipient. `redeem` is exercised in `test/TetherToken.test.js`, where it burns from the owner balance.

The Hardhat node keeps state in memory. A new `npm run node` drops the contract. Run `deploy` and `mint` again.

## Behaviors the contract tests assert

These are the outcomes in `test/TetherToken.test.js`. They are properties of this USDT-shaped contract, checked on Hardhat's in-process network.

### Supply

Only the owner can `issue` or `redeem`. Issuance increases the owner balance. Redemption decreases it. Both use dedicated events (`Issue`, `Redeem`) and skip `Transfer`. Indexers that only watch `Transfer` miss supply changes, including the initial mint and `destroyBlackFunds`. `issue(0)` and an overflowing `issue` revert.

### Interface

`transfer`, `transferFrom`, and `approve` have no return data. Integrators that require a boolean need a wrapper such as SafeERC20. Allowances cannot move from one non-zero value to another in a single `approve`. `MAX_UINT` allowances stay in place across `transferFrom`. `onlyPayloadSize` rejects truncated `transfer` and `transferFrom` calldata. Transfers to the zero address succeed and leave total supply unchanged.

### Pause

Transfers stop. Approvals and new issuance continue. A second `pause` while paused reverts, and `unpause` while running reverts. Both are owner-only.

### Blacklist

The sender (`_from`) is checked. A blacklisted account can receive coins and can set allowances. A blacklisted spender can still pull approved funds. Destruction requires the address to be blacklisted first, is owner-only, and emits `DestroyedBlackFunds` with no `Transfer`.

### Fees

`setParams` rejects basis points of 20 or more and a max fee argument of 50 or more. The contract stores `maximumFee` as that argument times `10**decimals`, so the stored fee cap stays below 50 USDT. The fee is `value * bps / 10000`, capped by `maximumFee`, and paid to the owner. A fee-bearing transfer emits two `Transfer` events: one to the owner for the fee, one to the recipient for the remainder.

### Ownership

Transfer to the zero address is a no-op and emits no log. A successful handover also emits no log. Afterward, `issue` credits the new owner.

### Deprecation

Forwarded views hide legacy balances. `balanceOf`, `totalSupply`, `transfer`, `approve`, `transferFrom`, and `allowance` go to the successor. Legacy blacklist and pause still apply before the forward. Legacy `issue` and `redeem` keep writing the pre-deprecation ledger, so `totalSupply()` can report the successor's supply while `_totalSupply` on the old contract moves.

## Tests and network

| File | When it runs | What it needs |
|---|---|---|
| `test/TetherToken.test.js` | Every `npm test` | In-process Hardhat network |
| `test/parity.test.js` | Every `npm test` | HTTPS to mainnet. Timeout 120 seconds. Reads `eth_getCode` and `eth_call` for name, symbol, and decimals |
| `test/local-deployment.test.js` | When the skip conditions above are clear | Timeout 60 seconds. Also checks key file mode `0600`, that each private key and mnemonic derives the stored address, that deployed code matches mainnet after the metadata strip, and that the wallet balance is above zero |

The local-deployment file reads the key material. Run it on a machine where `keys/` holds the local research keys. If the node is up and the deployment file points at code, a missing key file fails the suite at that point.

This package is Hardhat. `lib/` is project source (`common.js`, `bytecode.js`).
