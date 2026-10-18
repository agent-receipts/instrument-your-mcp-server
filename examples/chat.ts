// "What's on the truck today?", asked by a small local model.
//
// A minimal agent: one question, the truck's tools, and a model running in
// Ollama on your own machine. It exists for step 5. A coding agent works too,
// but its system prompt is long enough that a laptop takes minutes to read it;
// this one answers in seconds, and prints every tool call so you can see what
// reached the model.
//
//   ollama pull qwen3:8b                     # once
//   npm run chat                             # the uninstrumented truck
//   npm run chat -- solution/server.ts       # the instrumented one
//   npm run chat -- "Any caramel left?"      # ask something else
//   npm run chat -- --model qwen3:14b        # a different model you've pulled
//                                            # (or set OLLAMA_MODEL)

import { textOf, withClient } from "./attacks.js";
import { spawnFromArgv } from "./spawn.js";

const OLLAMA = process.env["OLLAMA_HOST"] ?? "http://localhost:11434";

// --model works the same in every shell; setting an environment variable
// doesn't (bash, fish and PowerShell each want it written differently).
const ARGV = process.argv.slice(2);
const MODEL_FLAG = ARGV.indexOf("--model");
const MODEL = (MODEL_FLAG !== -1 ? ARGV[MODEL_FLAG + 1] : undefined) ?? process.env["OLLAMA_MODEL"] ?? "qwen3:8b";
const OWN_ARGV = MODEL_FLAG === -1 ? ARGV : [...ARGV.slice(0, MODEL_FLAG), ...ARGV.slice(MODEL_FLAG + 2)];
const MAX_TURNS = 5;

interface ToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

async function ask(messages: Message[], tools: unknown[]): Promise<Message> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // think: false skips the model's reasoning pass. It's slower and adds
      // nothing to the demo.
      body: JSON.stringify({ model: MODEL, messages, tools, stream: false, think: false }),
    });
  } catch {
    throw new Error(`can't reach Ollama at ${OLLAMA}. Is "ollama serve" running?`);
  }
  if (res.status === 404) throw new Error(await notInstalled());
  if (!res.ok) throw new Error(`Ollama said ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { message: Message }).message;
}

/** Ollama answers 404 when the model isn't pulled. Say so, and list what is. */
async function notInstalled(): Promise<string> {
  let names: string[] = [];
  try {
    const tags = (await (await fetch(`${OLLAMA}/api/tags`)).json()) as { models?: Array<{ name: string }> };
    names = (tags.models ?? []).map((m) => m.name);
  } catch {
    // Listing is a nicety; the advice below still holds without it.
  }
  const pick = names.length > 0 ? `, or pick one you have: npm run chat -- --model ${names[0]}\n(installed: ${names.join(", ")})` : "";
  return `${MODEL} isn't installed in Ollama. Run "ollama pull ${MODEL}"${pick}`;
}

async function main(): Promise<void> {
  const argv = OWN_ARGV;
  const via = argv.indexOf("--via");
  const own = via === -1 ? argv : argv.slice(0, via);
  const question = own.find((a) => !a.endsWith(".ts") && !a.startsWith("-")) ?? "What's on the truck today?";
  const spawn = spawnFromArgv(argv);
  const started = Date.now();

  console.log(`\n${MODEL} asks ${spawn.label}: ${question}\n`);
  await withClient(spawn, "chat", { quiet: true }, async (client) => {
    const { tools } = await client.listTools();
    const ollamaTools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema },
    }));
    const messages: Message[] = [
      { role: "system", content: "You help customers of an ice cream truck. Use the tools to answer." },
      { role: "user", content: question },
    ];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const reply = await ask(messages, ollamaTools);
      messages.push(reply);
      if (!reply.tool_calls?.length) {
        console.log(reply.content.trim());
        return;
      }
      for (const call of reply.tool_calls) {
        const { name, arguments: args } = call.function;
        console.log(`  calls ${name} ${JSON.stringify(args)}`);
        const result = await client.callTool({ name, arguments: args });
        messages.push({ role: "tool", tool_name: name, content: textOf(result) });
      }
      console.log("");
    }
    console.log(`(gave up after ${MAX_TURNS} rounds of tool calls)`);
  });
  console.log(`\n(${Math.round((Date.now() - started) / 1000)}s)`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
