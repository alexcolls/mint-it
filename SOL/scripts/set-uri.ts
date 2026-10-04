// Points the on-chain metadata uri at a hosted JSON (for wallet logos). Usage: pnpm run set-uri -- <url>
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { fetchMetadataFromSeeds, mplTokenMetadata, updateV1 } from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, publicKey, signerIdentity } from '@metaplex-foundation/umi';
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import { RPC_URL, loadKeypair } from '../src/common.ts';

const uri = process.argv[2];
if (!uri) throw new Error('usage: pnpm run set-uri -- <metadata json url>');

const res = await fetch(uri);
if (!res.ok) throw new Error(`${uri} returned HTTP ${res.status}`);
const json = await res.json();
if (!json.image) throw new Error('metadata JSON has no "image" field');

const umi = createUmi(RPC_URL).use(mplTokenMetadata());
const authority = createSignerFromKeypair(umi, fromWeb3JsKeypair(loadKeypair('authority')));
umi.use(signerIdentity(authority));
const mint = publicKey(loadKeypair('mint').publicKey.toBase58());

const current = await fetchMetadataFromSeeds(umi, { mint });
await updateV1(umi, { mint, authority, data: { ...current, uri } }).sendAndConfirm(umi);
console.log(`Metadata uri set to ${uri}\nimage: ${json.image}`);
