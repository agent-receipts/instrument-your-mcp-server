# Step 3: Signed receipts

Behind? `npm run catchup 2` puts `src/` at the end of step 2. Anything it replaces is saved in `var/catchup-backup/`.

## The gap

The audit log is a text file. The server can rewrite it, and so can anyone with access to the machine. Everything in it is true, and none of it can be proven.

## Why it matters

An audit trail anyone can edit is only as trustworthy as everyone with access to the machine. When a record is disputed, by a customer, an auditor or a court, you need to show it hasn't changed since it was written. Signed, linked receipts make a change detectable, which a text file can't.

If someone is on your server, haven't you lost already? Not entirely. Deleting or editing logs to cover tracks is a usual next step, and the person with access may be an insider rather than an outsider. But if the signing key sits on the same machine, they can re-sign the lot: the attacks at the end of this step show that, and what it takes to stop it.

## What to build

In `src/receipts.ts`, write `ReceiptAuditSink`, using `@obsigna/sdk-ts`. It implements the same `AuditSink` interface as step 2, so the server change is one line.

- `constructor(path)`:
  - create the folder, and start a new, empty file (a new key means a new chain)
  - generate an Ed25519 key pair
  - write the public key to `publicKeyPathFor(path)`, which is already in the file. `npm run verify` looks for it there.
- `record(entry)`: turn the entry into a receipt, sign it, and append it to the file as one line of JSON. Each receipt is numbered and linked to the hash of the one before it.
- What goes in the receipt:
  - issuer: this server, as a `did:key` made from the public key
  - principal: the caller, `agent:${entry.agentId}`
  - action:
    - `type`: `"tool_call"` for a request entry, `"tool_result"` for a response
    - `tool_name`: `entry.toolName`
    - `risk_level` (required): how much harm the tool can do. For example `"low"` for `list_flavors` and `check_inventory`, `"high"` for `issue_refund` and `comp_free_scoop`, `"critical"` for `blast_promo_sms`, and `"medium"` for the rest.
    - `parameters_hash`: a hash of the (already redacted) parameters, never the parameters themselves. `sha256` from `@obsigna/sdk-ts/receipt` works, on `JSON.stringify(entry.parameters)` or a canonical form.
  - outcome: success if `entry.allowed`, otherwise failure with `entry.reason` as the error
  - chain:
    - `sequence`: 1 for the first receipt, then 2, 3 and so on
    - `previous_receipt_hash`: `null` for the first, then `hashReceipt()` of the receipt before
    - `chain_id`: a random UUID made in the constructor (`randomUUID()` from `node:crypto`)
  - `correlationId` (optional): `entry.correlationId`, only when it's set. Nothing sets it until step 6, where it joins your receipts to a proxy's records.
- In `src/server.ts`, swap the sink: `auditSink: new ReceiptAuditSink("var/receipts.jsonl")`. This replaces `JsonlAuditSink`, so `var/audit.jsonl` stops being written; you can remove its import.

Imports: `didFromPublicKey` comes from `@obsigna/sdk-ts`. `createReceipt`, `signReceipt`, `hashReceipt`, `generateKeyPair` and `sha256` come from `@obsigna/sdk-ts/receipt`.

`signReceipt`'s third argument is the verification method, the key's id within the DID. For a `did:key` it's the DID, a `#`, then the DID again without its `did:key:` prefix: `` `${did}#${did.slice("did:key:".length)}` ``.

Where to look: the SDK's types in `node_modules/@obsigna/sdk-ts` (start with `createReceipt`, `signReceipt`, `hashReceipt`, `generateKeyPair` and `didFromPublicKey`), and the source at https://github.com/agent-receipts/obsigna. Your AI assistant can read both.

## Done when

`npm run check 3` prints `PASS  step 3`. It signs a small test chain with your sink and checks that the issuer matches the key, the parameters are hashed, and a second run gets a new key and a new file. Then it runs the heist and verifies the chain your server wrote.

To see it yourself: `npm run heist`, then `npm run verify`. `npm run log` shows the chain as a table.

## Watch out for

- The chain's sequence starts at 1, not 0.
- Receipts are canonicalised (RFC 8785) before signing, and `undefined` isn't valid JSON. Leave an optional field out rather than setting it to `undefined`, for example `...(entry.parameters ? { parameters_hash: ... } : {})`.
- `didFromPublicKey` wants the raw 32 key bytes, not the PEM text that `generateKeyPair()` gives you. To get them: `createPublicKey(pem).export({ format: "jwk" }).x` is the key in base64url, and `new Uint8Array(Buffer.from(x, "base64url"))` turns it into the bytes. (`createPublicKey` is from `node:crypto`.)

## Before you move on

What does `npm run verify` passing actually prove, and who could still produce a chain that passes?

- Run `npm run heist`, then delete one line from the middle of `var/receipts.jsonl` and run `npm run verify`. Now run `npm run heist` again for a fresh chain, delete the last three lines instead, and verify again. Why does one fail and the other pass? (Don't run `npm run check` in between: it replaces the file.)
- Play the attacker: `npm run heist` for a fresh chain, then `npm run forge`, which re-signs every receipt with a brand-new key and replaces `var/receipts.pubkey.pem`. Run `npm run verify`. What does a clean result actually prove? `forge` prints the issuer before and after: who could notice that change, and what would they need to have kept?
