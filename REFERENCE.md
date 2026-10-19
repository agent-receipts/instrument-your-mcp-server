# scoop-truck — the workshop's demo MCP server

An ice cream truck as an MCP server, plus the instrumentation the workshop
adds to it. Two things live here:

- **`src/server.ts`** — the truck, **uninstrumented**. A perfectly ordinary
  MCP server someone shipped on a deadline. This is part one's starting point.
- **`src/toolGuard.ts`** — the instrumentation point you call from inside it.

```bash
npm install
npm run server            # the truck, over HTTP on 127.0.0.1 behind a local OAuth server
npm run server:solution   # the instrumented version

npm run heist             # 5 requests a security team would want to know about
npm run hammer            # brute-force the discount code — about a second
npm run verify            # check the receipt chain the instrumented server wrote
npm run log               # the audit log or receipt chain as a table (-- --denied)

npm run walkthrough       # the guard on its own, no server involved
npm run typecheck
```

The truck speaks Streamable HTTP on 127.0.0.1 (port from `PORT` or
`--port`, default 3333), behind a small OAuth server in `src/auth.ts` that
approves every request without asking: fine for a laptop, not for anything
else. The demo scripts start the server themselves on a free port, register
as a new OAuth client, fetch a token with no browser involved, and stop the
server when they finish (`examples/connect.ts`). Each registered client is
its own caller: `callerId()` reads it from the token.

## The tools

| Tool | What it does | Why it's here |
|---|---|---|
| `list_flavors` | descriptions, prices and stock | read-only baseline; one description comes from a supplier's feed and talks to the model |
| `check_inventory` | scoops left of one flavor | read-only baseline |
| `place_order` | takes an order, bills for it | ordinary audited write |
| `apply_discount_code` | tries a `SCOOP-1234` code | rate-limit target — the code is four digits |
| `issue_refund` | refunds money against an order | audit-critical; refunds **any** amount, **repeatedly** |
| `comp_free_scoop` | free scoop on the house | should require human approval |
| `blast_promo_sms` | texts the marketing list | deny-by-default; 12,403 phones, unrecallable |

The last three are deliberately unguarded. `issue_refund` never checks the
amount against what the order was actually worth, which is the "did the agent
refund $9,000 in waffle cones" story in the flesh. Run `npm run hammer`
against `src/server.ts` and it cracks the discount code in about 4,800 guesses
and a couple of seconds, with nothing to stop it. The only trace is
`var/server.log`: one plain-text line per call, every guessed code included.

Each gap maps to exactly one thing part one adds, which is the point:

| Gap | Closed by |
|---|---|
| brute-forcing `apply_discount_code` | rate limiting |
| a $9,000 refund that's one line in a text log, with no decision or outcome | audit trail |
| an audit log the server itself could edit afterwards | signed receipts |
| `blast_promo_sms` being callable at all | policy check (deny-list) |
| `comp_free_scoop` going through unattended | approval callback |
| a supplier's description telling the model to talk like a pirate | response scanning |

All of it goes in **one place** — the `CallToolRequestSchema` handler in
`src/server.ts`. That single choke point is the argument for instrumenting
in-process instead of proxying: you already own it.

## Part one — the exercise ladder

Cheapest to most expensive. Each step is a module you write in `src/` and a
change to the one handler in `src/server.ts`. The briefs are in
[`steps/`](steps/):

```bash
npm run preflight   # before the workshop: Node, npm install, the truck starts
npm run check 1     # is step 1 done? (checks 1 up to the step you give it)
npm run catchup 1   # put src/ at the end of step 1, backing up what it replaces
```

The finished modules are in `solution/`, and the finished server is
`solution/server.ts`:

```bash
git diff --no-index src/server.ts solution/server.ts
```

**Before you start, see what you're defending against:**

```bash
npm run heist      # 5 of 5 requests go through; var/server.log is the only trace
npm run hammer     # discount code cracked in ~4,800 guesses, a couple of seconds
```

### 1. Rate limiting — `solution/rateLimit.ts`

The step every dev already wants, and the one you can demo in ten seconds.
Construct a `ToolGuard` with a budget and call `guardToolCall` before you
dispatch. `npm run hammer -- solution/server.ts` now stops dead at 30.

The guard ships `InMemoryRateLimitStore`, which counts and never forgets —
fine in a test, wrong in a server, because a caller who hits the budget is
locked out until you restart. `FixedWindowRateLimitStore` is the smallest
thing that's actually a rate limit. It has a known flaw (a caller can burst
2× the budget across a window boundary) and it's per-process, so two
instances behind a load balancer is two budgets. Both are worth being able
to say out loud.

### 2. Audit trail — `solution/auditLog.ts`

Pass an `auditSink`. Every decision is now written down — **including the
denials**, which is the half people leave out. A log of what succeeded can't
show you an attack that failed.

Pass a `redact` function too. It's applied when an entry is persisted, not
when the decision is made, so policy always evaluates raw arguments. Get that
order backwards and your policy is reasoning about data the tool will never
see.

Everything in this file is true and none of it is provable. It's a text file;
the server can rewrite it. That gap is the next step.

### 3. Signed receipts — `solution/receipts.ts`

Swap the sink. That's the whole change — `ReceiptAuditSink` implements the
same `AuditSink` interface, so the guard never learns its log became
cryptographic. Each entry becomes an Ed25519-signed
[Agent Receipt](https://github.com/agent-receipts/obsigna) (`@obsigna/sdk-ts`),
hash-linked to the one before it.

```bash
npm run heist -- solution/server.ts
npm run verify
```

What it buys: edit a receipt and its signature stops verifying; remove one
from the middle and the next one's `previous_receipt_hash` stops matching.
Both detectable by someone who was never there.

What it doesn't: the **server** signs, so a compromised server can sign
whatever it likes *going forward* — receipts bound what can be changed after
the fact, not what a compromised signer can assert. Obsigna's own threat model
says the same about its daemon. Dropping receipts off the *end* of the chain
is also undetectable from the chain alone.

Key custody: this generates a keypair on startup, which mints a fresh identity
on every cold start — fine for a workshop, wrong everywhere else. In
production the key belongs in KMS: never in plaintext in a public-facing
process, and every sign call lands in CloudTrail as an independent record of
*when* signing happened.

### 4. Policy check — `solution/policy.ts`

Pass a `runtime`. `PolicyRuntime` is a one-method interface — a function
satisfies it.

The deny-list already handles `blast_promo_sms`, because that decision is per
tool *name* and needs no nuance. What a deny-list can't do is tell a $9 refund
from a $9,000 one, because it never sees arguments. That's what the policy
check is for, and it's the entire reason the seam exists.

**Not Cedar, not OPA.** They're real, and if you end up with non-engineers
authoring rules across multiple teams you'll want one. "Cap refunds, deny the
SMS blast" does not need a policy language, and reaching for one here teaches
the wrong lesson. `PolicyRuntime` is also the shape a Cedar `isAuthorized`
call fits, so graduating later is a swap, not a rewrite.

Note the default-allow at the bottom of `policy.ts`. It's a real choice with a
real cost — a tool added next sprint is reachable by every agent the moment it
ships, with nobody having decided that. Default-deny plus an allow-list is the
safer shape.

### 5. Poisoned menu — `solution/responseScan.ts`

Pass a `responseScanner` and a `responsePolicy`, and send back what
`guardToolResponse` returns instead of what `dispatch` produced. `npm run menu`
shows what reaches the model; `npm run chat` asks a local model through Ollama
(`qwen3:8b` by default) and shows what it does with it.

The pineapple-lumps description came from the supplier and tells AI assistants
to answer in pirate speak. A tool's output is input to the model, and the
request-side checks never see it. The scanner is a tripwire: it catches the
phrasings it knows, and a reworded note walks past it. `sanitize` drops the
offending sentence and keeps the menu; `block` hides the whole menu because of
one flavour. The pirate is harmless only because of what it asked for. A
tool-call policy limits what an injection can make the model *do*; nothing
here limits what it makes the model *say* to a person who then acts on it.

## Stacking a proxy on top (part two)

Both demo scripts take `--via`: a proxy command, then `--`, then the server
command. The script starts the server, starts the proxy in front of it (with
`--listen 127.0.0.1:<port> --upstream <server url>` appended), and attacks
the stack instead of the server. The token still comes from the server's own
OAuth endpoints and travels through the proxy as a bearer header:

```bash
npm run heist -- --via pipelock mcp proxy --config stacking/pipelock.yaml -- npx tsx solution/server.ts
```

`stacking/pipelock.yaml` has the setup steps. The point of the exercise is
what the two evidence trails say afterwards:

```bash
npm run verify                          # the server's receipt chain
pipelock verify-receipt --chain stacking/evidence --key ...
```

Both verify. **Neither is a complete account of the session.** The attack the
proxy blocked never reached the server, so it is absent from the server's
chain entirely; and the proxy's chain records that it *forwarded* the
$9,000 refund, which the server then refused. Adding a second layer improves
your defences and fragments your evidence.

Note the two shapes of refusal: the server denies in-band (`isError` on a
normal result), a proxy denies at the transport (the call throws). A client
that only checks `isError` stops dead at the first proxy denial.

### Joining the two chains

With `mediation_envelope.enabled` (already on in `stacking/pipelock.yaml`),
Pipelock writes its own receipt id into MCP `_meta` on every forwarded call.
`solution/server.ts` reads it and records it as the `correlation_id` of its
own receipt, so every server receipt resolves to the proxy receipt for the
same call — and because it sits inside the signed payload, editing the join
key invalidates the signature.

The fragmentation doesn't disappear; it becomes *queryable*. A proxy receipt
with `verdict: block` and no server counterpart is exactly an attack stopped
at the boundary that your server never witnessed — before, that was an
invisible absence from your log. Now you can enumerate it.

The envelope is **unsigned on both MCP transports** — stdio and HTTP alike —
so `rid` is a label, not evidence. Setting `mediation_envelope.sign: true`
does not change that on an MCP link: Pipelock v3.5.0 accepts the setting
without complaint and still sends the envelope in `_meta` with no signature
headers (tested on 3.5.0, over both stdio and HTTP). A control that
is configured, reports success, and does nothing is worth pointing at — it's
the same failure shape as an approval callback stubbed to always approve.

So `mediationCorrelationId()` in `solution/server.ts` reads one field, uses
it only as a join key, and lets every check run as if it weren't there.

## Red-team extension

For anyone who finishes early. Each one attacks a specific design choice in
`toolGuard.ts`, so they fall out of the code for free. The first three work —
they're supposed to.

| Attack | What you should find |
|---|---|
| Edit an amount inside a receipt, re-run `npm run verify` | that receipt's **signature** fails, at a named index |
| Delete a line from the middle of the chain | the next receipt's **hash link** and sequence fail |
| Delete the last N lines | **nothing fails.** Truncation is invisible from the chain alone — that's what `expectedLength` / `expectedFinalHash` / anchoring are for |
| `npm run forge`: re-sign the whole chain with a new key and overwrite `var/receipts.pubkey.pem` | **nothing fails.** A signature proves nothing if the verifier got the key from somewhere the signer's attacker controls |
| Make `callerId()` return a constant, then run two clients | one caller spends everyone's budget, and the audit log can't say who did what |
| Stub `approvalCallback` to always approve | the tool call goes through exactly as before, and the trail now records a human decision that never happened — evidence made worse, not better |
| Make the `PolicyRuntime` throw | the guard fails **closed** (`stage: "error"`), because a check that broke is not a check that passed |
| Reword the supplier's note so it avoids the scanner's phrases | it reaches the model. Pattern-matching injection is a tripwire, not a defence |

Making the policy throw provokes the fail-closed design on purpose. The
middle ones are the more uncomfortable lesson: the instrumentation can be
correct and still not protect you, if you got the key distribution or the
caller identity wrong.

---

# ToolGuard — instrumentation you call from inside your own MCP server

`src/toolGuard.ts` is the interception point for the workshop's part one. It
is **not** a proxy and **not** a wrapper. It has no transport coupling, never
sees a connection, and doesn't know what an MCP session is. It's a class you
construct once and call twice from your server's own `tools/call` handler:

- `guardToolCall(agentId, toolName, params)` — before you dispatch.
- `guardToolResponse(agentId, toolName, result)` — on whatever the tool
  returned, before it goes back to the model.

That's the whole integration surface. Two ordinary async calls in your own
process, which means the change ships through normal PR review, needs no
deployment topology change, no security sign-off for a new network hop, and
is unit-testable with no live server to stand up.

Zero dependencies — `toolGuard.ts` imports nothing, not even an MCP SDK.

## Why not a gateway

The design is ported from AGT's Python `agent_os/mcp_gateway.py`
(`microsoft/agent-governance-toolkit`, commit `359a2332`). AGT calls theirs a
*gateway* because it sits in front of a server it doesn't own. This one sits
inside a server you do own, so it isn't one — hence the different name. No AGT
source was copied and there's no runtime dependency on the toolkit. Background
on why this exists at all: TypeScript's `agent-governance-typescript/src/mcp.ts`
only scans static tool *definitions*; it has no runtime interception point.

The in-server choice is the workshop's core idea. Your server is
the trust anchor. It's PR-reviewed, tested, and deterministic; the agent
calling it is not. Checking and signing *inside* the server witnesses the real
request, rather than taking an untrusted caller's word for what it did.

## What was carried over from AGT's design

- Two checks, not one — request-side and response-side, independently.
- A staged pipeline where every decision carries the stage that produced it
  (`deny_list`, `runtime`, `approval_pending`,
  `rate_limit`, ...), not just a bare allow/deny.
- Fail-closed at each pluggable call site — the policy runtime, the approval
  callback, and the response scanner each get their own try/catch, rather
  than one blanket catch at the top.
- Redaction happens at the point of persisting an audit entry, not at the
  point of deciding — policy evaluation always sees raw params.
- Sanitization doesn't trust itself: after `sanitize()` runs, the guard
  re-scans its own output and fails closed if anything is still there.
- Audit sink and rate-limit store are injected interfaces (`AuditSink`,
  `RateLimitStore`), so the guard doesn't care whether they're in-memory, a
  file, or something real.
- Per-agent state, keyed by agent id, not one global counter.

## Wiring it into your server's handler

With the MCP TypeScript SDK's low-level `Server`, every tool call lands in one
`CallToolRequestSchema` handler. That single choke point is where the guard
goes — you are adding code to a function you already have, not introducing a
new component:

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ToolGuard } from "./toolGuard.js";

const guard = new ToolGuard({
  runtime: myPolicy,                    // your pluggable check
  deniedTools: ["blast_promo_sms"],
  sensitiveTools: ["comp_free_scoop"],  // → approval callback
  rateLimit: 5,
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const agentId = callerIdFor(request);   // however you identify the caller

  // Gate 1 — before anything executes.
  const decision = await guard.guardToolCall(agentId, name, args);
  if (!decision.allowed) {
    return {
      content: [{ type: "text", text: `Denied (${decision.stage}): ${decision.reason}` }],
      isError: true,
    };
  }

  const result = await dispatch(name, args);   // your existing tool logic

  // Gate 2 — before the result reaches the model.
  const checked = await guard.guardToolResponse(agentId, name, result);
  if (!checked.allowed) {
    return {
      content: [{ type: "text", text: `Response withheld: ${checked.reason}` }],
      isError: true,
    };
  }
  return { content: [{ type: "text", text: checked.content ?? "" }] };
});
```

Note what `agentId` is doing: rate limits and audit entries are per-caller, so
you need *some* identity for whoever is calling. How you get it is your
server's business — a session property, an API key, a header on the HTTP
transport. Handing every caller the same id is a real (and common) instrumenting
mistake, and it's one of the red-team exercises.

### Where the pluggable parts go

| Constructor option | You supply | Workshop step |
|---|---|---|
| `rateLimit` / `rateLimitStore` | a budget, and where counts live | rate limiting |
| `auditSink` | where entries are persisted | audit trail |
| `runtime` | a `PolicyRuntime` — any function that returns allow/deny | policy check |
| `approvalCallback` | what "ask a human" means for you | sensitive tools |
| `redact` | how to strip secrets before they hit the audit log | audit trail |
| `responseScanner` / `responsePolicy` | what counts as a threat in a tool result, and whether to strip or block it | poisoned menu (step 5) |

`PolicyRuntime` is deliberately a one-method interface. A deny-list or a
pattern match satisfies it in a dozen lines. If you later outgrow that,
it's also the shape a Cedar `isAuthorized` call fits — both are
"principal/action/resource/context in, allow/deny out" — but nothing here
needs a policy language to be useful.

## Running the walkthrough

```bash
npm install
npm run walkthrough
```

`examples/guard-walkthrough.ts` exercises the guard on its own — no MCP
server, no transport. It wires a toy `PolicyRuntime` and `ResponseScanner`
and walks the request-side stages (deny-list, policy denial, approval, rate
limit) and the response-side ones (a clean response, a credential leak the
toy sanitizer leaves in, caught by the rescan after sanitizing, and a
prompt-injection tag it does remove).

This file is also the template for testing the guard in your own repo: it's
plain function calls with injected fakes, no process to mock.
