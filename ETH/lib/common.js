const fs = require('node:fs');
const path = require('node:path');

/**
 * Tether USD on Ethereum mainnet: 0xdAC17F958D2ee523a2206206994597C13D831ec7
 * Deployed in block 4634748 as TetherToken(100000000000, "Tether USD", "USDT", 6),
 * compiled with solc 0.4.18+commit.9cf6e910, optimizer disabled.
 */
const USDT_SPEC = {
  mainnetAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  initialSupply: 100_000_000_000n, // 100,000 USDT
  name: 'Tether USD',
  symbol: 'USDT',
  decimals: 6n,
};

const LOCAL_CHAIN_ID = 31337n;
const ROOT = path.join(__dirname, '..');
const KEYS_DIR = path.join(ROOT, 'keys');
const DEPLOYMENTS_FILE = path.join(ROOT, 'deployments', 'localhost.json');

/** Load a signer from keys/<name>.json, connected to the given provider. */
function loadWallet(ethers, name, provider) {
  const { privateKey } = JSON.parse(fs.readFileSync(path.join(KEYS_DIR, `${name}.json`), 'utf8'));
  return new ethers.Wallet(privateKey, provider);
}

/** Refuse to run against anything but a local dev chain. */
async function assertLocalChain(provider) {
  const { chainId } = await provider.getNetwork();
  if (chainId !== LOCAL_CHAIN_ID) throw new Error(`refusing to run on chainId ${chainId}: local dev chain only`);
}

function readDeployment() {
  if (!fs.existsSync(DEPLOYMENTS_FILE)) throw new Error('no deployment found, run `npm run deploy` first');
  return JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, 'utf8'));
}

function writeDeployment(data) {
  fs.mkdirSync(path.dirname(DEPLOYMENTS_FILE), { recursive: true });
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(data, null, 2) + '\n');
}

module.exports = { USDT_SPEC, LOCAL_CHAIN_ID, KEYS_DIR, loadWallet, assertLocalChain, readDeployment, writeDeployment };
