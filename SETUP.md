# Setup for "Instrument your MCP server"

About 10 minutes. Please do this before the workshop: the room's wifi is not
the place to find out npm can't reach the registry.

## You need

- **Node.js 22.13 or newer.** Check with `node --version` before anything
  else. 22.13 is a hard floor: the receipts library uses `node:sqlite`, which
  only works without a flag from that version. If yours is older:
  - **macOS or Windows:** install the LTS from https://nodejs.org/en/download
  - **Linux, or if you'd rather use a version manager:** install nvm
    (https://github.com/nvm-sh/nvm#installing-and-updating), open a new
    terminal, then run `nvm install --lts`
  - Then open a new terminal (or run `source ~/.bashrc`, or your shell's
    equivalent) so `node --version` shows the new version. With nvm, if it
    still shows the old one, run `nvm alias default --lts` and open another.
- **git**.
- **An AI coding assistant**, whichever you normally use. The exercises
  assume you'll have one.

You don't need Pipelock, Docker, or anything else. Part two of the workshop is
run from the front.

## Steps

```bash
git clone https://github.com/agent-receipts/instrument-your-mcp-server.git
cd instrument-your-mcp-server
npm install
npm run preflight
```

`npm run preflight` should end with:

```
ok    Node 22.x.x
ok    dependencies installed
ok    the truck starts and lists its flavours

You're ready.
```

If you upgraded Node after running `npm install`, you don't need to run it
again. This project has no compiled dependencies.

If you'd like a preview, `npm run heist` and `npm run hammer` run the two
attacks the workshop is about against the unprotected server. They only
write logs under `var/`; your code isn't changed.

## If something goes wrong

| What you see | What to do |
|---|---|
| `npm install` prints `EBADENGINE` warnings | Your Node is too old. The install finishes anyway, but the workshop won't run. Upgrade Node (see above), then carry on. |
| `FAIL  Node ...` | Install Node 22.13 or newer, open a new terminal (or `source ~/.bashrc`), check `node --version` shows the new version, and run `npm run preflight` again. |
| `FAIL  Node ...` again, after installing with nvm | nvm kept your previous Node as its default. Run `nvm alias default --lts`, open a new terminal, and check `node --version`. |
| `FAIL  dependencies installed` | Run `npm install` in the repo folder and read its output for errors. If the error mentions `node:sqlite`, your Node is too old. |
| `FAIL  the truck starts ...` | The message under it includes the server's own error output. Before the day, reply to the setup email with it. On the day, show it to one of the facilitators. |
| `npm install` can't reach the registry | You may be behind a proxy or VPN. Try from another network. |
| Certificate errors during `git clone` or `npm install` (`unable to get local issuer certificate`, `self-signed certificate in certificate chain`, `x509: certificate signed by unknown authority`) | Your network inspects TLS traffic, which is common on work laptops (Cloudflare WARP, Zscaler and similar). Ask your IT team for the CA certificate and point Node at it with `NODE_EXTRA_CA_CERTS`, or try from another network. |
| `ExperimentalWarning: SQLite is an experimental feature` | Harmless. Node prints it when the receipts library loads. |

Tested on macOS and Linux (Debian) with Node 22. Windows should work, but
hasn't been tested yet. If you're on Windows, please say how it went.

## Optional: a local model for step 5

Only if your laptop has 16 GB of memory or more. Install
[Ollama](https://ollama.com), then:

```bash
ollama pull qwen3:8b          # about 5 GB; do this before the day
ollama run qwen3:8b "say hi"  # should answer within a minute
```

An interrupted pull carries on where it left off when you run it again,
even if its progress bar starts low. In step 5, `npm run chat` uses this
model; Ollama needs to be running. To use another model you've pulled:
`npm run chat -- --model <name>`.

## Trying the material early

If you're testing the workshop before the day, thank you. After setup:

1. Open `steps/0-annotations.md` and work through it with your AI
   assistant, the way an attendee would.
2. Run `npm run check 1` until it passes.
3. Carry on to the other steps if you have time. `npm run catchup <n>` puts you
   at the end of step `n` if you want to skip ahead. It saves anything it
   replaces in `var/catchup-backup/`.

Useful things to note down: how long each step took, anything in a brief that
was unclear or wrong, and any `npm run check` message that didn't help you
fix the problem.
