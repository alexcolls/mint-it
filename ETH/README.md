# ETH — Ethereum USDT replica

Local Hardhat package for stablecoin security research. It deploys a copy of mainnet Tether USD (`0xdAC17F958D2ee523a2206206994597C13D831ec7`). The contract tests exercise `issue`, `redeem`, fees, blacklist, pause, and the deprecate path. `npm run mint` calls `issue` and then `transfer`.

Scripts call `assertLocalChain` and refuse every chain id other than `31337`.

Package name: `minter-eth`. Dependencies come from npm (`package-lock.json`).

## Parity with mainnet

| | Mainnet USDT | This replica |
|---|---|---|
| Source | Verified `TetherToken.sol` | `contracts/TetherToken.sol`, the published Sourcify source |
| Compiler | solc 0.4.18+commit.9cf6e910, optimizer off | Same, set in `hardhat.config.js` |
| Runtime bytecode | 11,075 bytes | Executable bytes match mainnet in `test/parity.test.js` |
| Constructor | `(100000000000, "Tether USD", "USDT", 6)` | Same values in `lib/common.js` (`100,000` USDT at 6 decimals) |

The trailing 32-byte bzzr0 metadata hash differs. That hash covers Tether's original file name and settings, and those details stayed unpublished. Sourcify lists this contract as a partial match. `lib/bytecode.js` strips that trailer before the equality check.

## What the tests cover

`test/TetherToken.test.js` runs on Hardhat's in-process network:

- `issue` credits the owner and emits `Issue`. `redeem` burns from the owner balance and emits `Redeem`. Neither emits `Transfer`. Only the owner can call them. `issue(0)` and an overflowing `issue` revert.
- `transfer`, `transferFrom`, and `approve` return empty returndata. The contract predates the boolean return values in the ERC-20 specification.
- Changing a non-zero allowance to another non-zero value reverts. Reset the allowance to `0` first. A `MAX_UINT` allowance stays in place across `transferFrom`.
- `onlyPayloadSize` rejects truncated `transfer` and `transferFrom` calldata (the short-address case). Transfers to the zero address succeed and leave total supply unchanged.
- `pause` blocks `transfer` and `transferFrom`. `approve` and `issue` still succeed. Only the owner can pause or unpause.
- A blacklisted address cannot send and cannot be the `_from` of `transferFrom`. That address can still receive tokens and can still `approve`. A blacklisted spender can still `transferFrom` an allowance, because the check looks at `_from`. `destroyBlackFunds` requires a blacklist entry, then zeroes the balance and burns supply with `DestroyedBlackFunds` and no `Transfer`.
- `setParams` is capped at basis points below 20 and a max fee below 50 USDT. The fee is `value * bps / 10000`, capped by `maximumFee`, and paid to the owner as a second `Transfer`.
- `transferOwnership` to the zero address leaves the owner unchanged and emits no log. A successful handover also emits no log. Afterward, `issue` credits the new owner.
- `deprecate` forwards `balanceOf`, `totalSupply`, `transfer`, `approve`, `transferFrom`, and `allowance` to the upgraded contract. Legacy blacklist and pause still apply before the forward. Legacy `issue` and `redeem` keep writing the pre-deprecation ledger. The stand-in upgrade is `contracts/test/UpgradedTokenMock.sol`.

`test/parity.test.js` reads Ethereum mainnet (`eth_getCode`, `eth_call`) and compares bytecode and `name` / `symbol` / `decimals`. `test/local-deployment.test.js` runs only when `npm run node` is up, a deployment file exists, and the wallet already holds a balance.

## Keys

`npm run keys` writes `keys/owner.json` (issuer, admin, fee recipient) and `keys/wallet.json` (recipient of the minted balance). Each file stores `address`, `privateKey`, and `mnemonic` with mode `0600`. Existing files are left in place. The directory is gitignored.

On deploy, the script funds the owner with test ETH through `hardhat_setBalance`. That call exists only on the Hardhat node.

## Setup and commands

Requirements: Node.js and npm. Install from this directory so `package-lock.json` is the lockfile.

```bash
npm install
npm run keys
npm run node
npm run deploy
AMOUNT=5000 npm run mint
npm test
```

| Script | Command | Role |
|---|---|---|
| `keys` | `node scripts/create-keys.js` | Create the two local key files |
| `node` | `hardhat node` | In-memory chain at `http://127.0.0.1:8545` |
| `deploy` | `hardhat run scripts/deploy.js --network localhost` | Deploy `TetherToken` and write `deployments/localhost.json` |
| `mint` | `hardhat run scripts/mint.js --network localhost` | `issue` the amount, then `transfer` it to the wallet |
| `test` | `hardhat test` | Spec, bytecode parity, and the optional live-node checks |

`AMOUNT` is a human token amount (6 decimals). The default is `1000000`.

Environment:

- `RPC_URL` — Hardhat network URL. Default `http://127.0.0.1:8545`.
- `MAINNET_RPC_URL` — read-only endpoint for parity. Default `https://ethereum-rpc.publicnode.com`.

`deployments/` and `scratch/` are local output and are gitignored. The npm scripts cover key creation, deploy, and mint. Redemption is exercised in the contract tests through `redeem`.

Further notes: [../docs/ethereum.md](../docs/ethereum.md), [../docs/security.md](../docs/security.md), and [../CONTRIBUTING.md](../CONTRIBUTING.md).
