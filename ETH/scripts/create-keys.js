// Generates the local keys (idempotent): keys/owner.json (Tether owner/issuer) and
// keys/wallet.json (receives the minted USDT). Files are written with mode 0600.
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const { KEYS_DIR } = require('../lib/common');

fs.mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
for (const name of ['owner', 'wallet']) {
  const file = path.join(KEYS_DIR, `${name}.json`);
  if (fs.existsSync(file)) {
    console.log(`${name}: ${JSON.parse(fs.readFileSync(file, 'utf8')).address} (exists)`);
    continue;
  }
  const w = ethers.Wallet.createRandom();
  const data = { address: w.address, privateKey: w.privateKey, mnemonic: w.mnemonic.phrase };
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(`${name}: ${w.address} (created ${path.relative(process.cwd(), file)})`);
}
