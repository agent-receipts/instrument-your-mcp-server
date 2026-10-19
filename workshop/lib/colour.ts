// Colour for the PASS and FAIL lines, so they stand out in a terminal.
//
// Plain text when output isn't a terminal (piped, or under the tests), when
// NO_COLOR is set, and on a Node too old to have util.styleText: preflight
// has to run there to say the Node is too old.

import * as util from "node:util";

type Style = "green" | "red" | "yellow" | "bold";

export function paint(style: Style | Style[], text: string): string {
  const styleText = (util as { styleText?: (s: Style | Style[], t: string) => string }).styleText;
  if (!styleText || !process.stdout.isTTY || process.env["NO_COLOR"]) return text;
  return styleText(style, text);
}
