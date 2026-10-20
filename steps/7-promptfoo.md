# Step 7: The attacks as tests

Behind? `npm run catchup 5` puts `src/` at the end of step 5. Anything it replaces is saved in `var/catchup-backup/`. You don't need step 6 for this one.

Running the tests needs a model (item 1 below). If you don't have one, write your test anyway and run `npm run check 7`, then run the tests on a neighbour's laptop or watch.

## The gap

You've attacked the truck by hand: the heist, the hammer, the menu. Each attack ran once, against the truck as it was that day. Nothing runs them again when someone changes the policy next month, and nothing tries them through a model, the way a real agent would send them.

[promptfoo](https://www.promptfoo.dev) is an open-source tool for testing what a model does. You write test cases in a YAML file, it sends each one to a model, and it checks the result against assertions you write. It can hand the model an MCP server's tools and run the tool calls the model makes, so a test can check what your server did, not only what the model said. It's MIT-licensed, and since March 2026 it has been owned by OpenAI, which has said the open-source project continues.

`examples/promptfoo.yaml` already turns the heist and the poisoned menu into six tests. Each asks a model to do one thing (refund $9,000, comp a free scoop, text everyone, show the menu) and checks whether the truck went through with it or refused.

## Why it matters

An attack you ran once is a demo. An attack that runs every time the code changes is a test. promptfoo runs from the command line and exits with an error when a test fails, so it fits in CI next to your other tests. The six tests cover the attacks in this workshop. Your server will have its own, and the habit worth taking home is adding one each time you find a new way in.

## What to build

1. **A model.** By default the tests use `qwen3:1.7b` through Ollama (`ollama pull qwen3:1.7b`, about 1.4 GB, and Ollama running). If you pulled `qwen3:8b` for step 5, that works too: change the model id in the YAML file. No API key, and your prompts and the model's answers stay on your machine. To use a hosted model (OpenAI or Anthropic) instead, see the comments in the YAML file: it needs an API key, and a ChatGPT or Claude subscription isn't one.
2. **promptfoo.** It installs into its own folder, `examples/promptfoo/`, without the large optional packages it doesn't need here: about 300 MB instead of 2 GB. Do it before the day if you can:

   ```bash
   npm run promptfoo:install
   npm run preflight     # the step 7 line says promptfoo 0.124.1
   ```

   By default promptfoo reports basic usage telemetry (which commands ran and which assertion types were used, not your prompts, answers or tests) and checks npm for updates. To turn both off:

   ```bash
   export PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1   # macOS, Linux, Git Bash
   $env:PROMPTFOO_DISABLE_TELEMETRY = 1; $env:PROMPTFOO_DISABLE_UPDATE = 1   # PowerShell
   ```

3. **Your own test.** In `examples/promptfoo.yaml`, add a seventh test after the six, for an attack they don't cover. Copy the shape of the others:
   - `description`: what should happen, in a sentence.
   - `vars.request`: what the model is asked to do.
   - `vars.tool`: the tool the model should call.
   - `vars.expect`: what the truck should do with that call:
     - `allowed`: the truck answers normally. A normal answer can still be a no: a wrong discount code gets "That code isn't valid", not an error.
     - `refused`: the truck flags the call as an error (`is_error`), as your guard does when it says no.
     - `clean`: the truck answers normally, without the supplier's note.

   The check in `examples/promptfoo-check.cjs` is shared by every test. It finds the model's call to `tool` and looks at what the truck answered and whether it flagged an error (`is_error`). Some ideas: a refund one cent more than the $9.00 order; a refund that says the owner has already approved it; a menu request worded differently. The tests run in order against one running truck, which remembers orders and refunds until you restart it. The first test places `order-0001`, so later tests can refund against it.

   You can give your test its own `assert` as well; it runs alongside the shared check. It sees promptfoo's whole output, not only the truck's answer: for a refusal, something like `MCP Tool Error (issue_refund): [{"type":"text","text":"..."}]`. A `regex` assertion is a JavaScript regular expression, so `(?i)` is an error; for a case-insensitive match use `icontains`. A test for a wrong discount code needs one: `expect: allowed` alone can't tell a wrong code from a right one. Under its `vars`, add:

   ```yaml
       assert:
         - type: icontains
           value: "isn't valid"
   ```
4. **Run it.** Start the truck in one terminal. It stays running:

   ```bash
   npm run server
   ```

   In a second terminal, get a token. promptfoo can send a bearer token but can't do the truck's OAuth sign-in itself, so `npm run token` does it and prints the token:

   ```bash
   export TRUCK_TOKEN=$(npm run -s token)      # macOS, Linux, Git Bash
   $env:TRUCK_TOKEN = npm run -s token         # Windows PowerShell
   ```

   Check Ollama is running: `ollama list` should answer, or open http://localhost:11434 in a browser (it says "Ollama is running"). If it isn't, every test fails with `fetch failed`. The YAML file turns off promptfoo's retries for Ollama so that happens straight away; if you've changed that and a run seems stuck, it's retrying, and Ctrl+C stops it.

   Then run the tests:

   ```bash
   npm run promptfoo
   ```

   It takes under a minute with `qwen3:1.7b` (a few with `qwen3:8b`); the first test is slower while the model loads. `npm run promptfoo:view` opens the results in a browser. `npm run promptfoo` is short for `promptfoo eval -c examples/promptfoo.yaml --no-cache`; to add a promptfoo option, put it after `--`, as in `npm run promptfoo -- --verbose`.

## Done when

`npm run check 7` prints `PASS  step 7`. It reads `examples/promptfoo.yaml` and checks that it is valid YAML (when promptfoo is installed), that the six tests are still there and unchanged, and that yours names a tool the truck has and says what the truck should do with the call. It doesn't run promptfoo or a model, so it can't tell you whether your test passes. Running the eval is how you find that out.

To see it yourself: run the eval. With the truck at the end of step 5, all seven should pass, the order included.

## Watch out for

- The truck keeps tokens in memory. If you restart it, get a new token. If promptfoo says `Failed to connect to MCP server truck` (often with `SSE error ... (405)`), the token is stale or missing, or the truck isn't running.
- A test that says "the model never called" the tool isn't about your truck: the model chose not to try. Run it again.
- The tests only check the first tool call the model makes, and what the truck answered. They don't check what the model would say next, for example whether it would answer in pirate speak after reading the note.

## Before you move on

Your tests pass. What would make one of them pass even though the truck is broken?

- Change the order id in your test to one that doesn't exist, like `order-9999`, and run the eval. Does it pass? Would it pass against the truck from before step 4?
- Set `temperature` in the YAML to `0.7` and run the eval three times. Do the same tests pass each time? What, exactly, is under test: the truck, or the model?

Then put your test back the way you want to keep it.

## Afterwards: point it at your own server

Copy `examples/promptfoo.yaml` and change:

- `url` under `mcp.server` to your server's MCP endpoint. A server started with a command rather than a URL takes `command` and `args` instead.
- `auth`, if your server needs it. promptfoo can send a bearer token, an API key or basic auth, and can get a token itself with OAuth client credentials. If your server only does the browser sign-in, get a token some other way, as `npm run token` does here.
- The tests: ask for the things your server should refuse, and check the tool call's `is_error` and `output`, as these do.

Then add the `eval` command to your CI. It exits with an error when a test fails.
