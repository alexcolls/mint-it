// Mints USDT replica to the local wallet (keys/wallet.json). Usage: npm run mint -- <amount>
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { connection, loadKeypair, toBaseUnits } from '../src/common.ts';

const amount = process.argv[2] ?? '1000000';
const authority = loadKeypair('authority');
const mint = loadKeypair('mint').publicKey;
const wallet = loadKeypair('wallet').publicKey;

const ata = await getOrCreateAssociatedTokenAccount(connection, authority, mint, wallet);
const sig = await mintTo(connection, authority, mint, ata.address, authority, toBaseUnits(amount));
const bal = await connection.getTokenAccountBalance(ata.address);
console.log(`Minted ${amount} USDT to ${wallet.toBase58()} (ATA ${ata.address.toBase58()})  tx ${sig}`);
console.log(`Wallet balance: ${bal.value.uiAmountString} USDT`);
