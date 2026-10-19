// Step 5: the menu reaches the client without the supplier's injected note.
// Blocking the menu and stripping the note both pass; which one is better is
// a debrief question, not a check.

import { textOf, withClient } from "../../examples/attacks.js";
import { Shop } from "../../src/shop.js";
import { dispatch } from "../../src/tools.js";
import type { ResponseScanner } from "../../src/toolGuard.js";
import { importFrom, serverSpawn } from "../lib/paths.js";
import { ATTACK, describe, fail, notWrittenYet, pass, type CheckResult } from "./result.js";

type Module = { PromptInjectionScanner: new () => ResponseScanner };

export async function checkStep5(): Promise<CheckResult> {
  try {
    const { PromptInjectionScanner } = await importFrom<Module>("src/responseScan.ts");
    const scanner = new PromptInjectionScanner();
    const shop = new Shop();

    const menu = dispatch(shop, "list_flavors", {});
    if ((await scanner.scan(menu, "list_flavors")).safe) {
      return fail("your scanner says the menu is safe. Read the pineapple-lumps description in src/shop.ts");
    }
    // Judge the text, not the tool: the same note from another tool is still
    // an injection, and an ordinary menu line from list_flavors isn't.
    if ((await scanner.scan(menu, "check_inventory")).safe) {
      return fail("your scanner says the same menu text is safe when it comes from another tool. Decide from the content, not the tool name");
    }
    const plain = "Today on the truck:\n- vanilla: $4.50/scoop (180 scoops left)\n  Plain and creamy.";
    if (!(await scanner.scan(plain, "list_flavors")).safe) {
      return fail("your scanner flagged a menu with no note in it. Decide from the content, not the tool name");
    }
    const order = dispatch(shop, "place_order", { customer: "Aroha", flavor: "vanilla", scoops: 2 });
    if (!(await scanner.scan(order, "place_order")).safe) {
      return fail(`your scanner flagged an ordinary order confirmation ("${order}"). It should only catch text that instructs the model`);
    }
  } catch (err: unknown) {
    return notWrittenYet(err, "src/responseScan.ts") ?? fail(`src/responseScan.ts threw: ${describe(err)}`);
  }

  let text: string;
  let isError: boolean;
  try {
    ({ text, isError } = await withClient(serverSpawn(), "check", ATTACK, async (client) => {
      const result = await client.callTool({ name: "list_flavors", arguments: {} });
      return { text: textOf(result), isError: result.isError === true };
    }));
  } catch (err: unknown) {
    return fail(`src/server.ts didn't answer list_flavors: ${describe(err)}`);
  }

  if (/pirate/i.test(text)) {
    return fail(
      "the supplier's note still reaches the client. Give the guard your scanner (responseScanner), " +
        "and send back what guardToolResponse returns, not the text dispatch produced",
    );
  }
  if (isError) return pass("the menu was withheld (block). The note never reached the model, and neither did the menu");
  if (!text.includes("vanilla")) return fail(`the menu came back without its flavours: "${text}"`);
  // Only a menu that has run together fails here, not other changes to
  // spacing: two prices on one line means two flavours on one line.
  if (text.split(/\r?\n/).some((line) => (line.match(/\$\d+\.\d\d\/scoop/g) ?? []).length > 1)) {
    return fail(
      "the menu came back with its flavours run together on one line. Your sanitizer took out the line breaks " +
        "as well as the note. Take out only the offending sentences, and leave the rest of the text as it was",
    );
  }
  return pass("the supplier's note was stripped (sanitize); the rest of the menu came through");
}
