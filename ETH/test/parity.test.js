// Proves the replica IS mainnet USDT: identical bytecode and identical constructor state.
// Reads Ethereum mainnet (read-only). Set MAINNET_RPC_URL to use another endpoint.
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { USDT_SPEC } = require('../lib/common');
const { compileExact, stripMetadata, rpc, MAINNET_RPC_URL } = require('../lib/bytecode');

describe('Parity with mainnet USDT (0xdAC1…1ec7)', function () {
  this.timeout(120_000);
  let mainnetCode;

  before(async () => {
    mainnetCode = (await rpc(MAINNET_RPC_URL, 'eth_getCode', [USDT_SPEC.mainnetAddress, 'latest'])).toLowerCase();
    expect(mainnetCode.length).to.be.greaterThan(2, 'mainnet code fetched');
  });

  it('solc 0.4.18 build of contracts/TetherToken.sol is byte-for-byte identical to mainnet executable code', () => {
    const { version, runtime } = compileExact();
    expect(version).to.match(/^0\.4\.18\+commit\.9cf6e910/);
    // Same length, every executable byte identical. Only the trailing 32-byte bzzr0 metadata
    // hash differs: it hashes the original (unpublished) file name/settings, which nobody has
    // reproduced — Sourcify also lists USDT as a partial "match", not "exact_match".
    expect(runtime.length).to.equal(mainnetCode.length);
    expect(stripMetadata(runtime)).to.equal(stripMetadata(mainnetCode));
    expect(stripMetadata(mainnetCode).length).to.equal(mainnetCode.length - 86); // only the trailer was removed
  });

  it('runtime code deployed by Hardhat matches mainnet (modulo source-path metadata)', async () => {
    const token = await (await ethers.getContractFactory('TetherToken'))
      .deploy(USDT_SPEC.initialSupply, USDT_SPEC.name, USDT_SPEC.symbol, USDT_SPEC.decimals);
    const local = await ethers.provider.getCode(await token.getAddress());
    expect(stripMetadata(local)).to.equal(stripMetadata(mainnetCode));
  });

  it('name / symbol / decimals match mainnet storage', async () => {
    const iface = (await ethers.getContractFactory('TetherToken')).interface;
    const read = async (fn) => iface.decodeFunctionResult(fn,
      await rpc(MAINNET_RPC_URL, 'eth_call', [{ to: USDT_SPEC.mainnetAddress, data: iface.encodeFunctionData(fn) }, 'latest']))[0];
    expect(await read('name')).to.equal(USDT_SPEC.name);
    expect(await read('symbol')).to.equal(USDT_SPEC.symbol);
    expect(await read('decimals')).to.equal(USDT_SPEC.decimals);
  });
});
