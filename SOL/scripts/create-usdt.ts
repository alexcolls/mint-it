// Creates the USDT replica mint + Metaplex metadata on devnet.
import { SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMint2Instruction, getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createMetadataAccountV3, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, none, publicKey, signerIdentity } from '@metaplex-foundation/umi';
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import { RPC_URL, USDT_SPEC, connection, loadKeypair } from '../src/common.ts';

const authority = loadKeypair('authority');
const mint = loadKeypair('mint');

if (await connection.getAccountInfo(mint.publicKey)) {
  console.log(`Mint ${mint.publicKey.toBase58()} already exists, skipping creation.`);
  process.exit(0);
}

// 1. Mint account: legacy SPL Token, 6 decimals, mint authority == freeze authority.
const lamports = await getMinimumBalanceForRentExemptMint(connection);
const tx = new Transaction().add(
  SystemProgram.createAccount({
    fromPubkey: authority.publicKey,
    newAccountPubkey: mint.publicKey,
    space: MINT_SIZE,
    lamports,
    programId: TOKEN_PROGRAM_ID,
  }),
  createInitializeMint2Instruction(
    mint.publicKey, USDT_SPEC.decimals, authority.publicKey, authority.publicKey, TOKEN_PROGRAM_ID,
  ),
);
const sig = await sendAndConfirmTransaction(connection, tx, [authority, mint]);
console.log(`Mint created: ${mint.publicKey.toBase58()}  tx ${sig}`);

// 2. Metaplex metadata, same fields as mainnet USDT.
const umi = createUmi(RPC_URL).use(mplTokenMetadata());
const umiAuthority = createSignerFromKeypair(umi, fromWeb3JsKeypair(authority));
umi.use(signerIdentity(umiAuthority));
const res = await createMetadataAccountV3(umi, {
  mint: publicKey(mint.publicKey.toBase58()),
  mintAuthority: umiAuthority,
  updateAuthority: umiAuthority.publicKey,
  data: {
    name: USDT_SPEC.name,
    symbol: USDT_SPEC.symbol,
    uri: USDT_SPEC.uri,
    sellerFeeBasisPoints: USDT_SPEC.sellerFeeBasisPoints,
    creators: none(),
    collection: none(),
    uses: none(),
  },
  isMutable: USDT_SPEC.isMutable,
  collectionDetails: none(),
}).sendAndConfirm(umi);
console.log('Metadata created, tx', (await import('bs58')).default.encode(res.signature));
