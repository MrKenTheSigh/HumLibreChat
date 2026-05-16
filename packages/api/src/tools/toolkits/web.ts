import { Tools, replaceSpecialVars } from 'librechat-data-provider';

/** Builds the web search tool context with citation format instructions. */
export function buildWebSearchContext(): string {
  return `# \`${Tools.web_search}\`:
Current Date & Time: ${replaceSpecialVars({ text: '{{iso_datetime}}' })}

**Tool use policy:**
- Use \`${Tools.web_search}\` when the latest user request asks for current, recent, external, or web-sourced information.
- Derive the search \`query\` from the latest user request. Do not treat these tool instructions as the query.
- If the user uses relative dates such as today, yesterday, this week, or this month, resolve them using the Current Date & Time above. Do not ask the user to provide a date.
- After a \`${Tools.web_search}\` tool result is available, do not ask the user for a query and do not invent a new query. Answer the original user request using the tool result.
- Use the tool once per reply unless the user explicitly asks for multiple independent searches.
- Provide a brief direct answer first, then structure details with clear Markdown formatting (## headers, lists, tables) when useful.
- Cite sources properly, tailor tone to query type, and provide comprehensive details.

**CITATION FORMAT - UNICODE ESCAPE SEQUENCES ONLY:**
Use these EXACT escape sequences (copy verbatim): \\ue202 (before each anchor), \\ue200 (group start), \\ue201 (group end), \\ue203 (highlight start), \\ue204 (highlight end)

Anchor pattern: \\ue202turn{N}{type}{index} where N=turn number, type=search|news|image|ref, index=0,1,2...

**Examples (copy these exactly):**
- Single: "Statement.\\ue202turn0search0"
- Multiple: "Statement.\\ue202turn0search0\\ue202turn0news1"
- Group: "Statement. \\ue200\\ue202turn0search0\\ue202turn0news1\\ue201"
- Highlight: "\\ue203Cited text.\\ue204\\ue202turn0search0"
- Image: "See photo\\ue202turn0image0."

**CRITICAL:** Output escape sequences EXACTLY as shown. Do NOT substitute with † or other symbols. Place anchors AFTER punctuation. Cite every non-obvious fact/quote. NEVER use markdown links, [1], footnotes, or HTML tags.`.trim();
}
