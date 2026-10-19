# Step 6: A proxy in front

Behind? `npm run catchup 5` puts `src/` at the end of step 5. Anything it replaces is saved in `var/catchup-backup/`.

This step needs Pipelock installed (item 1 below). If you don't have it, pair with someone who does, or watch. `npm run check 6` will say `SKIP`, and step 7 doesn't need Pipelock.

## The gap

Everything so far is inside your server. Plenty of teams put a proxy in front of their MCP servers instead, or as well. [Pipelock](https://github.com/luckyPipewrench/pipelock) is one: it sits between the client and the server, reads each call on the way through, and keeps its own signed receipts. Put it in front of your truck and you have two layers and two evidence trails. Nothing yet says how they fit together.

## Why it matters

A proxy and your server see different things. The proxy reads the text of a call, so it can spot a credential or an instruction hidden in it. It doesn't know your business, so a text to 12,403 phones looks like any other call. Your server knows the business, but never sees what the proxy stopped. When someone asks what happened in a session, you need both records, and a way to line them up.

## What to build

You don't change the truck, unless item 3 says so. You put Pipelock in front of it and read what each layer wrote down. Run everything from this folder.

1. Install Pipelock 3.7.0 or newer, and check it with `pipelock version`.
   - **macOS:** `brew install luckyPipewrench/tap/pipelock`
   - **Linux and Windows:** download the file for your system from the [3.7.0 release](https://github.com/luckyPipewrench/pipelock/releases/tag/v3.7.0) (for example `pipelock_3.7.0_linux_amd64.tar.gz` or `pipelock_3.7.0_windows_amd64.zip`; `arm64` for ARM machines). Unpack it and put `pipelock` (`pipelock.exe` on Windows) somewhere on your `PATH`. Don't build it with `make install`: that needs Go, and builds a different edition.
2. Give Pipelock a signing key of its own:

   ```bash
   pipelock keygen scoop-mediator --keystore stacking/plhome
   ```

   The key is made on your machine and stays there. `stacking/pipelock.yaml` points at it, and `.gitignore` keeps it out of git. Don't commit it.
3. Check that your server records Pipelock's id for each call. Pipelock writes the id of its own receipt into the request's `_meta`, and your server copies it into its receipt as the correlation id. That is what lets the two chains be joined. Search `src/server.ts` for `com.pipelock/mediation`. If it's there (it is if you used `npm run catchup 4` or `5`), go to item 4. If not, add this function:

   ```ts
   function mediationCorrelationId(params: Record<string, unknown>): string | undefined {
     const meta = params["_meta"];
     if (!meta || typeof meta !== "object") return undefined;
     const envelope = (meta as Record<string, unknown>)["com.pipelock/mediation"];
     if (!envelope || typeof envelope !== "object") return undefined;
     const rid = (envelope as Record<string, unknown>)["rid"];
     return typeof rid === "string" && rid.length > 0 ? rid : undefined;
   }
   ```

   Then, in the handler, work out `const correlationId = mediationCorrelationId(request.params as unknown as Record<string, unknown>);` and pass `correlationId` as the last argument to every `guardToolCall` and `guardToolResponse` call. Nothing signs this id on its way to your server, so anyone can put anything there. Use it as a label to join on, and for nothing else.
4. Run the probe through Pipelock in front of your truck:

   ```bash
   npm run probe -- --via pipelock mcp proxy --config stacking/pipelock.yaml -- npx tsx src/server.ts
   ```

   After `--via` comes the proxy command, then `--`, then the server. The script starts both and talks to the proxy. The probe makes two calls: an ordinary order with an instruction and an AWS-style key hidden in the customer's name, and the SMS blast. Which layer stops each one?
5. Run the heist through the same stack:

   ```bash
   npm run heist -- --via pipelock mcp proxy --config stacking/pipelock.yaml -- npx tsx src/server.ts
   ```

   Compare it with the end of step 5. Who refused each request?
6. Straight after the heist, verify both chains:

   ```bash
   npm run verify
   pipelock verify-receipt --chain stacking/evidence --key stacking/plhome/agents/scoop-mediator/id_ed25519.pub
   ```

   Pipelock ends with `VALID PREFIX, END UNPROVEN` and exits with code 3. That's expected: nothing anchors the end of its chain, and it says so. Read its `Limit:` lines.
7. Join them:

   ```bash
   npm run join
   ```

   Each row is one call Pipelock saw, next to what your server recorded for the same call. Then run the probe again (item 4), and `npm run join` once more.

## Done when

`npm run check 6` prints `PASS  step 6`. It runs the probe through Pipelock in front of `src/server.ts`, and checks three things: Pipelock blocked the hidden instruction, your server refused the SMS blast, and the join finds your server's receipt for Pipelock's record of that call.

Without Pipelock it prints `SKIP  step 6`. That's fine if you paired or watched.

## Watch out for

- The two layers refuse in different ways. Your server refuses inside a normal answer (`isError`). A proxy refuses at the transport, and the call throws. A client that only checks `isError` stops dead at the first proxy refusal.
- Your server starts a new receipt chain each time it starts. Pipelock keeps every run in `stacking/evidence`. `npm run join` pairs your server's chain with Pipelock's latest run. To start again from nothing, delete `stacking/evidence`.
- Windows: Pipelock publishes Windows builds, but we haven't tried this step on Windows. If it doesn't work, pair with someone.

## Before you move on

Both chains verify, and they disagree about the $9,000 refund. Which would you hand an auditor, and what does the join let you show that neither can on its own?

- Run the probe, then `npm run log`. Is the order with the hidden key in your server's chain? Which record would you search to find out it happened?
- Run the hammer through the stack: `npm run hammer -- --via pipelock mcp proxy --config stacking/pipelock.yaml -- npx tsx src/server.ts`. Who stops the brute force, Pipelock or your server? Would Pipelock alone have stopped it?
