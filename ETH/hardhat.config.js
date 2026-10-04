require('@nomicfoundation/hardhat-toolbox');

// Exactly the compiler + settings Tether used on mainnet
// (0xdAC17F958D2ee523a2206206994597C13D831ec7): solc 0.4.18, optimizer off.
module.exports = {
  solidity: { version: '0.4.18', settings: { optimizer: { enabled: false, runs: 200 } } },
  networks: {
    // `npx hardhat node` — local chain only. Keys come from keys/*.json, never from config.
    localhost: { url: process.env.RPC_URL ?? 'http://127.0.0.1:8545' },
  },
};
