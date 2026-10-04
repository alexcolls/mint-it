const fs = require('node:fs');
const path = require('node:path');

const SOURCE = path.join(__dirname, '..', 'contracts', 'TetherToken.sol');
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL ?? 'https://ethereum-rpc.publicnode.com';

/**
 * Compiles TetherToken.sol exactly as Tether did (solc-js 0.4.18, optimizer off, source
 * unit named "TetherToken.sol"), so even the trailing metadata hash is reproduced.
 */
function compileExact() {
  const solc = require('solc');
  const input = {
    language: 'Solidity',
    sources: { 'TetherToken.sol': { content: fs.readFileSync(SOURCE, 'utf8') } },
    settings: {
      optimizer: { enabled: false, runs: 200 },
      outputSelection: { '*': { '*': ['evm.deployedBytecode.object'] } },
    },
  };
  const out = JSON.parse(solc.compileStandardWrapper(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e) => e.severity === 'error');
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join('\n'));
  return { version: solc.version(), runtime: '0x' + out.contracts['TetherToken.sol'].TetherToken.evm.deployedBytecode.object };
}

/** Drops the solc 0.4.x swarm metadata trailer (bzzr0 hash), which depends on source paths. */
function stripMetadata(code) {
  return code.toLowerCase().replace(/a165627a7a72305820[0-9a-f]{64}0029$/, '');
}

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

module.exports = { compileExact, stripMetadata, rpc, MAINNET_RPC_URL };
