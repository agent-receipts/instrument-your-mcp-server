# Step 5: Poisoned menu

Behind? `npm run catchup 4` puts `src/` at the end of step 4. Anything it replaces is saved in `var/catchup-backup/`.

## The gap

Run `npm run menu`. This month's seasonal flavour, `pineapple-lumps`, comes straight from the supplier's product feed, and nobody on the truck reads the text. Its description tells AI assistants to answer in pirate speak from now on. Everything a tool returns is input to the model, and so far the guard only checks what comes in.

The scanner you'll write is a tripwire, not a defence: before this step ends you'll write a note that gets past it. Its job here is to make the response side checked and recorded at all. Off-the-shelf detection libraries don't change that much: tried against this truck, two of them missed the supplier's note and every rewording of it.

If you have [Ollama](https://ollama.com) and `ollama pull qwen3:8b`, `npm run chat` asks a small local model the same question (another model you've pulled: `npm run chat -- --model <name>`). Watch what it does with the note.

## What to build

1. In `src/responseScan.ts`, write `PromptInjectionScanner`. It implements `ResponseScanner` from `src/toolGuard.ts`:
   - `scan(content, toolName)` returns `{ safe, threats }`. Flag text that tries to instruct the model: talking to "AI assistants", "from now on", "ignore previous instructions" and the like. Each threat is `{ category: "prompt_injection", description }`.
   - `sanitize(content, toolName)` returns `{ sanitized, removed }`: the content with the offending sentences taken out. The guard scans the result again and blocks it if anything is left.
   - Ordinary output, like an order confirmation, must not be flagged.
2. In `src/server.ts`, change the guard's options:

   ```ts
   responseScanner: new PromptInjectionScanner(), // replaces null
   responsePolicy: "sanitize", // or "block"
   ```

3. In the handler, you already call `guardToolResponse` after `dispatch`. Use what it returns: if `allowed` is false, return its `reason` with `isError: true`. Otherwise send back its `content`, not the text from `dispatch`.

## Done when

`npm run check 5` prints `PASS  step 5`. It tests your scanner on the menu and on an order confirmation, then asks your server for the menu and makes sure the supplier's note didn't come back.

To see it yourself: `npm run menu`, or `npm run chat`. The pineapple lumps should still be there, without the note.

## Before you move on

Your scanner caught this one, and it will miss the next. When it does, which earlier step limits what the model can be made to do, and what does nothing limit?

- Edit the description in `src/shop.ts` so it asks for the same thing in different words, avoiding the phrases your scanner looks for. Run `npm run menu`. Did it get through?
- Set `responsePolicy` to `"block"` and run `npm run menu`. What does a customer asking for the menu see now?
- Run `npm run menu`, then find the `list_flavors` result at the end of `var/receipts.jsonl`. Does anything in it say a sentence was removed?

Then put the description back: `git checkout src/shop.ts`.
