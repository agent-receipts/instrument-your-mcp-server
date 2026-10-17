// The auditor's side: read the receipt chain and check it.
//
// This is what the signing in step 3 is FOR. Without a verifier, receipts are
// an expensive way to write a log file.
//
// Run with: npm run verify
//
// Then go and break it, which is the point:
//   - edit an amount inside a receipt          → that receipt's signature fails
//   - delete a line from the middle            → the next one's hash link fails
//   - delete the last few lines                → nothing fails (see below)
//   - regenerate the keypair, re-sign the whole
//     chain, overwrite the .pubkey.pem         → nothing fails (see below)

import { readFileSync } from "node:fs";

import { verifyChain } from "@obsigna/sdk-ts/receipt";

import { publicKeyPathFor, readChain } from "./receipts.js";

const RECEIPT_LOG = process.argv[2] ?? "var/receipts.jsonl";

function main(): void {
  let lines: string[];
  let publicKey: string;
  try {
    lines = readFileSync(RECEIPT_LOG, "utf8").split("\n");
    publicKey = readFileSync(publicKeyPathFor(RECEIPT_LOG), "utf8");
  } catch {
    console.error(`No receipt log at ${RECEIPT_LOG} — run the instrumented server first:`);
    console.error("  npm run hammer -- solution/server.ts");
    process.exit(1);
  }

  const receipts = readChain(lines);
  const result = verifyChain(receipts, publicKey);

  console.log(`chain:  ${RECEIPT_LOG}`);
  console.log(`length: ${result.length} receipt(s)`);
  console.log(`status: ${result.status}`);
  console.log(`valid:  ${result.valid}`);

  if (!result.valid) {
    console.log(`\nBROKEN at index ${result.brokenAt}`);
    const broken = result.receipts[result.brokenAt];
    if (broken) {
      console.log(`  receipt:   ${broken.receiptId}`);
      console.log(`  signature: ${broken.signatureValid ? "ok" : "INVALID"}`);
      console.log(`  hash link: ${broken.hashLinkValid ? "ok" : "INVALID"}`);
      console.log(`  sequence:  ${broken.sequenceValid ? "ok" : "INVALID"}`);
    }
    if (result.error) console.log(`  error:     ${result.error}`);
  }

  for (const warning of result.warnings ?? []) {
    console.log(`warning: ${warning}`);
  }

  // Two things a clean "valid: true" does NOT mean. Say both out loud
  // whenever you show someone a green check.
  //
  // 1. Truncation. verifyChain walks the receipts it was given; nothing in
  //    the file says how many there should be. Lopping receipts off the end
  //    leaves a chain that verifies perfectly. Defending against it needs a
  //    witness from outside the file — pass expectedLength or
  //    expectedFinalHash if you have one, require a terminal receipt for
  //    chains that must close, or anchor the head somewhere you don't
  //    control. Below is the shape, using this run's own numbers, which is
  //    circular on purpose: it only becomes a real check when those values
  //    come from somewhere else.
  //
  // 2. Key substitution. We verified against the key the signer left next to
  //    the log. Whoever can rewrite one can rewrite the other. A green check
  //    here means "internally consistent", not "authentic", until the key
  //    comes from somewhere the signer's attacker doesn't control.
  if (result.valid && receipts.length > 0) {
    const strict = verifyChain(receipts, publicKey, { expectedLength: receipts.length });
    console.log(
      `\n(with an out-of-band expectedLength=${receipts.length}: valid=${strict.valid} —` +
        " meaningful only if that number came from outside this file)",
    );
  }

  process.exit(result.valid ? 0 : 1);
}

main();
