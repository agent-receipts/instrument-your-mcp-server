# Instrument your MCP server

![A pink ice cream truck by the water](.github/truck.jpg)
<sub>Photo: Nhi Ly on Unsplash</sub>

Workshop material for "Instrument your MCP server" at Agentic Engineering Day
NZ, Auckland, 21 October 2026.

You'll take an ordinary MCP server, an ice cream truck that will refund
$9,000 against a $9 order if an agent asks, and add controls inside it:
tool annotations, rate limiting, an audit trail, signed receipts, a policy check, and a scan
of what goes back to the model.

## Before the workshop

You need Node.js 22.13 or newer (`node --version`), git, and your usual AI
coding assistant. Then:

```bash
git clone https://github.com/agent-receipts/instrument-your-mcp-server.git
cd instrument-your-mcp-server
npm install
npm run preflight
```

Every `npm run` command in this workshop runs from this folder. Preflight
should end with "You're ready." If it doesn't, [SETUP.md](SETUP.md) has the
details and a troubleshooting table. [REFERENCE.md](REFERENCE.md) has more
on the truck, its tools and `ToolGuard`, if you want to read ahead.

**Optional, for step 5:** if your laptop has 16 GB of memory or more,
install [Ollama](https://ollama.com) and run `ollama pull qwen3:8b` (about
5 GB) before you arrive. You'll be able to watch a local model fall for a
prompt injection on your own machine. Without it, you'll see the same thing
on the presenter's screen.

**Optional, for steps 6 and 7:** Pipelock, and promptfoo fetched ahead of
time. [SETUP.md](SETUP.md) says how. Pairing or watching is fine too.

## During the workshop

A warm-up and five steps, each closing a gap in the truck, then two shorter
ones. Each step is
time-boxed and the room moves on together, finished or not: you're welcome
to write the code by hand, but when time's up, `npm run catchup <n>` and
carry on. If time runs short we may catch the room up through a step
together. Each has a brief:

0. [Tool annotations](steps/0-annotations.md) (warm-up): let a
   client tell the harmless tools from the dangerous ones.
1. [Rate limiting](steps/1-rate-limit.md): stop the discount
   code being brute-forced.
2. [Audit trail](steps/2-audit-trail.md): record every decision,
   denials included, with secrets removed.
3. [Signed receipts](steps/3-receipts.md): make that record
   tamper-evident.
4. [Policy](steps/4-policy.md): refuse the $9,000 refund, the
   unattended free scoop and the text to 12,403 phones.
5. [Poisoned menu](steps/5-poisoned-menu.md): keep a supplier's
   note to AI assistants off the menu the model reads.

Then two shorter, guided steps. They start from the end of step 5 and don't
change the truck much, so there's nothing to catch up to. Each needs a tool
the rest of the workshop doesn't (see [SETUP.md](SETUP.md)); if you don't
have it, pair with someone or watch.

6. [A proxy in front](steps/6-pipelock.md): put Pipelock in front
   of the truck, and join its evidence to yours.
7. [The attacks as tests](steps/7-promptfoo.md): run the attacks
   through a model with promptfoo, and add one of your own.

After each one, `npm run check <n>` tells you whether it's done and, if not,
what's missing. Without Pipelock, `npm run check 6` says `SKIP`, not `FAIL`.

From step 2, `npm run log` shows the server's log as a table, one line per
entry (`npm run log -- --denied` for refusals only). The raw file is still
the one to open and edit for the attacks.

If you fall behind, there are two ways to catch up. Use whichever suits you:

- **`npm run catchup <n>`** puts `src/` at the end of step `n` (0 to 5). It saves
  anything it replaces in `var/catchup-backup/`, and doesn't need git.
- **Branches.** `step-0` to `step-5` hold the same states. Commit or stash
  your work first, then `git switch step-2`. Compare your work with a
  finished step using `git diff step-1 step-2 -- src`.

## Licence

The demo server is Apache-2.0. It uses Obsigna (`@obsigna/sdk-ts`,
Apache-2.0), a reference implementation of the Agent Receipts protocol (MIT).
