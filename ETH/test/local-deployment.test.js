// Verifies the live deployment on `npm run node` (localhost:8545). Skipped if it isn't running.
const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('chai');
const { ethers } = require('ethers');
const { USDT_SPEC, LOCAL_CHAIN_ID, KEYS_DIR, readDeployment } = require('../lib/common');
const { stripMetadata, rpc, MAINNET_RPC_URL } = require('../lib/bytecode');

describe('Local deployment (localhost:8545)', function () {
  this.timeout(60_000);
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL ?? 'http://127.0.0.1:8545', undefined, { staticNetwork: true });
  let deployment, token, keys;

  before(async function () {
    try {
      if ((await provider.getNetwork()).chainId !== LOCAL_CHAIN_ID) return this.skip();
      deployment = readDeployment();
      if ((await provider.getCode(deployment.address)) === '0x') return this.skip(); // node restarted
    } catch { return this.skip(); }
    keys = Object.fromEntries(['owner', 'wallet'].map((n) =>
      [n, JSON.parse(fs.readFileSync(path.join(KEYS_DIR, `${n}.json`), 'utf8'))]));
    const abi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'artifacts/contracts/TetherToken.sol/TetherToken.json'))).abi;
    token = new ethers.Contract(deployment.address, abi, provider);
  });

  it('key files are private (0600) and each private key derives its stored address', () => {
    for (const name of ['owner', 'wallet']) {
      expect(fs.statSync(path.join(KEYS_DIR, `${name}.json`)).mode & 0o777).to.equal(0o600);
      expect(new ethers.Wallet(keys[name].privateKey).address).to.equal(keys[name].address);
      expect(ethers.Wallet.fromPhrase(keys[name].mnemonic).address).to.equal(keys[name].address);
    }
  });

  it('deployed code matches mainnet USDT', async () => {
    const [local, mainnet] = await Promise.all([
      provider.getCode(deployment.address), rpc(MAINNET_RPC_URL, 'eth_getCode', [USDT_SPEC.mainnetAddress, 'latest']),
    ]);
    expect(stripMetadata(local)).to.equal(stripMetadata(mainnet));
  });

  it('token is owned by keys/owner.json and the local wallet holds minted USDT', async () => {
    expect(await token.owner()).to.equal(keys.owner.address);
    expect(await token.symbol()).to.equal('USDT');
    expect(await token.decimals()).to.equal(6n);
    expect(await token.balanceOf(keys.wallet.address)).to.be.greaterThan(0n);
    expect(await token.isBlackListed(keys.wallet.address)).to.equal(false);
  });
});
