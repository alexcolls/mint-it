// Mints USDT to keys/wallet.json the way Tether does: owner issue()s into its own
// balance, then transfers to the recipient. Usage: AMOUNT=5000 pnpm run mint
const hre = require('hardhat');
const { assertLocalChain, loadWallet, readDeployment } = require('../lib/common');

async function main() {
  const { ethers } = hre;
  await assertLocalChain(ethers.provider);
  const amount = ethers.parseUnits(process.env.AMOUNT ?? '1000000', 6);
  const owner = loadWallet(ethers, 'owner', ethers.provider);
  const wallet = loadWallet(ethers, 'wallet', ethers.provider);
  const token = await ethers.getContractAt('TetherToken', readDeployment().address, owner);

  const issueTx = await token.issue(amount);
  await issueTx.wait();
  const transferTx = await token.transfer(wallet.address, amount);
  await transferTx.wait();

  console.log(`Issued + transferred ${ethers.formatUnits(amount, 6)} USDT to ${wallet.address}`);
  console.log(`  issue tx ${issueTx.hash}\n  transfer tx ${transferTx.hash}`);
  console.log(`Wallet balance: ${ethers.formatUnits(await token.balanceOf(wallet.address), 6)} USDT`);
  console.log(`Total supply:   ${ethers.formatUnits(await token.totalSupply(), 6)} USDT`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
