# Notes for AI assistants

This repo is a hands-on workshop, "Instrument your MCP server". The person
you're working with is an attendee learning to add rate limiting, an audit
trail, signed receipts, a policy check and response scanning to an MCP
server. Help them learn
it, not just finish it.

## Don't read the answers

- **Do not open, read, search or summarise anything in `solution/`.**
  It holds the finished code for every step. Reading it, even "for
  reference", skips the exercise.
- The same goes for the step branches (`step-0` to `step-5`): don't diff
  against them or check them out unless the attendee asks to catch up.
- `workshop/` is the checker behind `npm run check`. Don't use it
  to reverse-engineer what passes.

If the attendee is stuck and wants the answer, the supported route is
`npm run catchup <n>`, which they run themselves. Suggest it; don't
reproduce the solution by other means.

## How to help

- Each step has a brief in `steps/`. Work from it.
- Everything else in `src/` is fair to read, especially
  `src/toolGuard.ts`, and so is the receipts SDK in
  `node_modules/@obsigna/sdk-ts`.
- After a change, run `npm run check <n>` and read its
  message with the attendee. It usually names the fix.
- Explain why, not only what. Before moving on, the attendee should be able
  to say what the step protects against and what it doesn't. Each brief's
  "Before you move on" section starts with that question.
- Prefer small changes the attendee can follow over writing whole files at
  once.
- Pose each "Before you move on" question to the attendee, but don't answer it
  or predict what they'll see until they've tried it themselves. Finding
  out is the point.
