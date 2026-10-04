// Deploys the USDT replica to the local chain with mainnet's exact constructor arguments.
// Usage: npx hardhat run scripts/deploy.js --network localhost
const hre = require('hardhat');
const { USDT_SPEC, assertLocalChain, loadWallet, writeDeployment } = require('../lib/common');

async function main() {
  const { ethers } = hre;
  await assertLocalChain(ethers.provider);
  const owner = loadWallet(ethers, 'owner', ethers.provider);

  // Local dev chain: give the fresh owner key gas money.
  await ethers.provider.send('hardhat_setBalance', [owner.address, '0x' + ethers.parseEther('100').toString(16)]);

  const Tether = await ethers.getContractFactory('TetherToken', owner);
  const token = await Tether.deploy(USDT_SPEC.initialSupply, USDT_SPEC.name, USDT_SPEC.symbol, USDT_SPEC.decimals);
  await token.waitForDeployment();
  const tx = token.deploymentTransaction();

  writeDeployment({
    chainId: 31337,
    address: await token.getAddress(),
    owner: owner.address,
    txHash: tx.hash,
    blockNumber: (await tx.wait()).blockNumber,
  });
  console.log(`TetherToken (USDT) deployed at ${await token.getAddress()}  owner ${owner.address}`);
  console.log(`  name=${await token.name()} symbol=${await token.symbol()} decimals=${await token.decimals()} ` +
    `totalSupply=${ethers.formatUnits(await token.totalSupply(), 6)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
