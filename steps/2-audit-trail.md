# Step 2: Audit trail

Behind? `npm run catchup 1` puts `src/` at the end of step 1. Anything it replaces is saved in `var/catchup-backup/`.

## The gap

The hammer is stopped now, and `var/server.log` has a line for every call. But it isn't an audit trail. It records what was asked, never what the server decided or what happened. It doesn't show that the hammer was stopped. And it keeps every argument as given, so it's a list of guesses at a live discount code.

## What to build

1. In `src/auditLog.ts`, write `JsonlAuditSink`. It implements `AuditSink` from `src/toolGuard.ts`:
   - `constructor(path)` creates the folder for `path` if it doesn't exist.
   - `record(entry)` appends `JSON.stringify(entry)` and a newline to the file.
2. In the same file, write `redactShopParams(params)`. It returns a new object: a copy of `params` with `code`, `phone`, `email` and `card_number` replaced by `"[redacted]"` if they're there. Everything else stays.
   - `params` is always a flat object, so there's nothing nested to look inside.
   - Don't change `params` itself. The same object goes on to the tool, so changing it would send `[redacted]` to the shop instead of the real values.
   - Only `code` turns up in this truck's tools. The other three are there because a real server would have them, and the check tests all four.
3. In `src/server.ts`, add two options to the guard:

   ```ts
   auditSink: new JsonlAuditSink("var/audit.jsonl"),
   redact: redactShopParams,
   ```

4. Record the response side too, not only the request. After a successful `dispatch`, call `await guard.guardToolResponse(agentId, name, text)`. In the `ShopError` branch, call it with `` `error: ${err.message}` ``. The guard writes a second entry for each call: whether the response was allowed, and, from step 5, any threats it found. It doesn't record the tool's output itself.

## Done when

`npm run check 2` prints `PASS  step 2`. It tests your sink and `redactShopParams` directly, then runs the hammer and reads your log for denials and for discount codes in plain text.

To see it yourself: `npm run hammer`, then open `var/audit.jsonl`. The denials should be there, and no discount codes.

## Watch out for

`record` returns `void`. Write synchronously (`appendFileSync`). An asynchronous write lets the tool call carry on before the entry is saved, and a crash in between loses the entry you most wanted.

## Before you move on

Could someone reading `var/audit.jsonl` tell that the truck was attacked? Could they prove to someone else that nobody changed it?

- Run the hammer again and look at `var/server.log`. You redacted the audit trail; what's still in the app log? What would you do about it on a real server?
- Open `var/audit.jsonl` and change one denial's `"allowed": false` to `true`. Would anyone reading the file notice? That's step 3. (Do this one yourself in an editor: an AI assistant may refuse to edit an audit log, even a throwaway one.)
