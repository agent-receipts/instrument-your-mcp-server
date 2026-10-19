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
  assume you'll have one: each step is time-boxed and the room moves on
  together. Writing it by hand is fine, but plan to catch up when time's up.

That's all you need. Steps 6 and 7 use two more tools; they're optional,
and the section at the end says how to get them.

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
note  Pipelock not installed: needed only for step 6. ...
note  promptfoo not fetched yet (...): needed only for step 7. ...

You're ready.
```

The two lines about steps 6 and 7 say `ok` if you have those tools, and
`note` if you don't. A `note` is fine: see "If you want to do steps 6 and 7
yourself" below.

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

## If you want to do steps 6 and 7 yourself

Optional. Steps 6 and 7 are short, guided steps at the end. If you don't
have these tools, pair with someone who does, or watch: nothing else in the
workshop needs them.

**Step 6: Pipelock** (a proxy that sits in front of an MCP server). You need
version 3.7.0 or newer.

- **macOS:** `brew install luckyPipewrench/tap/pipelock`
- **Linux and Windows:** download the file for your system from
  https://github.com/luckyPipewrench/pipelock/releases/tag/v3.7.0 (for
  example `pipelock_3.7.0_linux_amd64.tar.gz` or
  `pipelock_3.7.0_windows_amd64.zip`; `arm64` for ARM machines). Unpack it
  and put `pipelock` (`pipelock.exe` on Windows) somewhere on your `PATH`.
  Don't build it with `make install`: that needs Go, and builds a different
  edition. We haven't tried step 6 on Windows yet.

Check it with `pipelock version`. You make its signing key during step 6.

**Step 7: promptfoo and a model.**

- A local model: Ollama and `qwen3:1.7b` (about 1.4 GB):
  `ollama pull qwen3:1.7b`. If you already pulled `qwen3:8b` for step 5,
  that works too. To use a hosted model with an API key instead, step 7's
  brief says how.
- promptfoo itself, installed ahead of time into its own folder (about
  300 MB). From this folder, after `npm install`:

  ```bash
  npm run promptfoo:install
  ```

  promptfoo needs Node 22.22 or newer.

  By default promptfoo sends basic usage telemetry and checks for updates.
  Step 7's brief says how to turn both off.

Run `npm run preflight` again afterwards: the two lines for steps 6 and 7
should say `ok`.

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
