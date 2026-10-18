# Extra: the attacks as promptfoo tests

Optional. Nothing in the steps or checks needs it. Try it if you finish a step early, or take it home.

## What promptfoo is

[promptfoo](https://www.promptfoo.dev) is an open-source tool for testing what a model does. You write test cases in a YAML file, it sends each one to a model, and it checks the answers against assertions you write. It can hand the model an MCP server's tools and run the tool calls the model makes, so a test can check what your server did, not only what the model said. It runs from the command line, which makes it easy to put in CI.

`examples/promptfoo.yaml` turns the heist and the poisoned menu into six tests. Each asks a model to do one thing (refund $9,000, comp a free scoop, text everyone, show the menu) and checks whether the truck went through with it or refused.

## Before you start

- **A model.** By default it uses `qwen3:8b` through Ollama, as in step 5 (`ollama pull qwen3:8b`, and Ollama running). No API key, and nothing leaves your machine. To use a hosted model instead, see the comments in the YAML file.
- **promptfoo.** You don't install it into the project; `npx` fetches it the first time. It's large: about 2 GB of disk, and over a minute on a fast connection. On shared Wi-Fi it can take much longer, so fetch it before the day if you can:

  ```bash
  npx promptfoo@0.124.1 --version
  ```

## Run it

1. Start the truck in one terminal. It stays running:

   ```bash
   npm run server
   ```

2. In a second terminal, get a token. promptfoo can send a bearer token but can't do the truck's OAuth sign-in itself, so `npm run token` does it and prints the token:

   ```bash
   export TRUCK_TOKEN=$(npm run -s token)      # macOS, Linux, Git Bash
   $env:TRUCK_TOKEN = npm run -s token         # Windows PowerShell
   ```

   The truck keeps tokens in memory. If you restart it, get a new token. If promptfoo says `Failed to connect to MCP server truck` (often with `SSE error ... (405)`), the token is stale or missing, or the truck isn't running.

3. Run the tests:

   ```bash
   npx promptfoo@0.124.1 eval -c examples/promptfoo.yaml --no-cache
   ```

   It takes a minute or two with `qwen3:8b`; the first test is slower while the model loads. `npx promptfoo@0.124.1 view` opens the results in a browser.

## What to look for

- On `main`, or before you've done step 4, the attack tests fail: the refunds, the free scoop and the text all went through, and the menu came back with the supplier's note. Each failure says what the truck answered.
- Once your truck is at the end of step 5 (or `git switch step-5`, then restart the server and get a new token), all six should pass. The order should still go through.
- A test that says "the model never called" the tool isn't about your truck: the model chose not to try. Run it again.

The tests only check the first tool call the model makes and what the truck answered. They don't check what the model would say next, for example whether it would answer in pirate speak after reading the note.

## Point it at your own server

Copy `examples/promptfoo.yaml` and change:

- `url` under `mcp.server` to your server's MCP endpoint. A server started with a command rather than a URL takes `command` and `args` instead.
- `auth`, if your server needs it. promptfoo can send a bearer token, an API key or basic auth, and can get a token itself with OAuth client credentials. If your server only does the browser sign-in, get a token some other way, as `npm run token` does here.
- The tests: ask for the things your server should refuse, and check the tool call's `is_error` and `output`, as these do.

Then add the `eval` command to your CI. It exits with an error when a test fails.
