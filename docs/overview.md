# Overview

mint-it is a stablecoin security research workspace. It reproduces the public USDT token surface on two chains and tests the controls around supply and admin power.

The Ethereum package is a Hardhat project that compiles the published `TetherToken` source with solc 0.4.18 and optimizer disabled, then deploys it only to chain id `31337`. The Solana package creates a legacy SPL token mint on devnet with the same decimals and authority layout as mainnet USDT, plus Metaplex metadata.

## Questions in the code

The scripts and tests concentrate on issuer control and on integration hazards that show up when a stablecoin keeps an older token interface.

1. **Mint authority.** On Ethereum, `issue` is `onlyOwner` and increases the owner balance and `_totalSupply`. On Solana, `mintTo` must be signed by the mint authority. Tests reject a signer who lacks that role.
2. **Redeem.** On Ethereum, `redeem` decreases the owner balance and total supply, and it reverts when the owner balance is too small. Holder balances elsewhere stay put. The Solana scripts cover minting.
3. **Pause and freeze.** Ethereum `pause` stops transfers and `transferFrom` while leaving `approve` and `issue` available. Solana freeze, held by the same key as the mint authority, blocks transfers from a frozen token account until thaw.
4. **Blacklist and seizure.** Ethereum can block an address from sending and can `destroyBlackFunds` on a blacklisted balance. The tests record the edges: a blacklisted address can still receive and approve, and a blacklisted spender can still spend an existing allowance.
5. **Fees.** Ethereum `setParams` turns on a transfer fee paid to the owner, inside a hard cap (basis points below 20, max fee below 50 USDT).
6. **Upgrade.** Ethereum `deprecate` points ERC-20 reads and transfers at a successor contract. `issue` and `redeem` continue to update the legacy ledger, so the forwarded `totalSupply` view and the legacy `_totalSupply` can diverge.
7. **Parity.** Ethereum tests compare executable bytecode and the name, symbol, and decimals against mainnet. Solana tests compare the token program, account size, decimals, authority model, and selected metadata fields. Both mainnet calls are reads.

## Threat model

The attacker in the tests is an unprivileged account. The checks are that this account cannot mint, redeem, pause, blacklist, set fees, deprecate, freeze, or move funds without an allowance or a signature from the token owner.

The owner (Ethereum) and the authority (Solana) are fully privileged by design of the token. They can increase supply, and on Ethereum they can pause, blacklist, destroy blacklisted funds, set a capped fee, and redirect the token interface to a new contract. Research questions about that role are questions about the admin key, its handover, and what the token still allows after pause, blacklist, or deprecate.

## Open questions outside the current tree

These topics matter for stablecoin security. The code in this repository studies the token admin surface above. The items below are still unbuilt:

- Collateral, reserves, or attestation of backing
- Oracle prices or peg bands
- A redemption queue, a Solana burn script, or a cross-chain bridge
- An Anchor program, a Foundry project, or a shared root `package.json`

Treat the replicas as instruments for the behaviors listed above. Supply figures in a local or devnet mint are test balances.

## How the packages fit together

`ETH/` and `SOL/` are separate npm projects aimed at the same research target: USDT's public mint and admin model. Each package has its own scripts, tests, and dependencies. Ethereum key files are `{address, privateKey, mnemonic}` objects created by `npm run keys`. Solana key files are JSON secret-key arrays that the scripts expect to find already on disk.

Read [ethereum.md](ethereum.md), [solana.md](solana.md), and [security.md](security.md) for commands, environment variables, and the research boundary.
