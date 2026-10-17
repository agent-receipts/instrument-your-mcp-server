// The attacker's tool for step 3's last exercise.
//
// Someone with access to the server rewrites history: they re-sign every
// receipt in var/receipts.jsonl with a brand-new key, and overwrite the public
// key that sits next to the log. Every signature and hash link is genuine, so
//
//   npm run forge
//   npm run verify
//
// comes back valid. The question is what that clean result actually proved.
//
// The one thing that does change is the issuer: each receipt now names the
// forger's did:key. An auditor who had kept the real one somewhere the
// attacker can't reach (a key registry, their own config) would see it at
// once. One who trusts the key file next to the log never will.

import { createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { didFromPublicKey } from "@obsigna/sdk-ts";
import { generateKeyPair, hashReceipt, signReceipt, type AgentReceipt } from "@obsigna/sdk-ts/receipt";

import { publicKeyPathFor, readChain } from "../solution/receipts.js";

const RECEIPT_LOG = process.argv[2] ?? "var/receipts.jsonl";

type Unsigned = Parameters<typeof signReceipt>[0];

function didOf(publicKeyPem: string): string {
  const jwk = createPublicKey(publicKeyPem).export({ format: "jwk" });
  return didFromPublicKey(new Uint8Array(Buffer.from(jwk.x ?? "", "base64url")));
}

function main(): void {
  let receipts: AgentReceipt[];
  try {
    receipts = readChain(readFileSync(RECEIPT_LOG, "utf8").split("\n"));
  } catch {
    console.error(`No receipt log at ${RECEIPT_LOG}. Run npm run heist first.`);
    process.exit(1);
  }
  const oldDid = (receipts[0] as unknown as { issuer?: { id?: string } } | undefined)?.issuer?.id ?? "(none)";

  const keys = generateKeyPair();
  const did = didOf(keys.publicKey);
  const verificationMethod = `${did}#${did.slice("did:key:".length)}`;

  let previous: string | null = null;
  const forged = receipts.map((receipt) => {
    const { proof: _proof, ...rest } = receipt as unknown as Record<string, unknown>;
    const body = rest as { issuer: Record<string, unknown>; credentialSubject: { chain: Record<string, unknown> } };
    body.issuer = { ...body.issuer, id: did };
    body.credentialSubject.chain = { ...body.credentialSubject.chain, previous_receipt_hash: previous };
    const signed = signReceipt(body as unknown as Unsigned, keys.privateKey, verificationMethod);
    previous = hashReceipt(signed);
    return signed;
  });

  writeFileSync(RECEIPT_LOG, forged.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  writeFileSync(publicKeyPathFor(RECEIPT_LOG), keys.publicKey, "utf8");

  console.log(`Re-signed ${forged.length} receipt(s) in ${RECEIPT_LOG} with a new key,`);
  console.log(`and replaced ${publicKeyPathFor(RECEIPT_LOG)}.`);
  console.log(`  issuer before: ${oldDid}`);
  console.log(`  issuer now:    ${did}`);
  console.log("\nNow run: npm run verify");
}

main();
