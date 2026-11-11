// Only adapt the two observed Codex app-context record types for Grok.
export function parseGrokAliases(value = "") {
  return [...new Set(value.split(",").map(alias => alias.trim()).filter(Boolean))];
}

export function isGrokModel(model, grokAliases = []) {
  return typeof model === "string" &&
    (grokAliases.includes(model) || /^(?:grok-cli|gc)\/grok-/.test(model));
}

export function normalizeContext(body, { grokAliases = [] } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !isGrokModel(body.model, grokAliases) || !Array.isArray(body.input)) {
    return { body, count: 0 };
  }
  let count = 0;
  const input = body.input.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        item.type !== "function_call_output" || item.namespace !== "agent" ||
        (typeof item.call_id === "string" && item.call_id.trim()) ||
        !(item.name === "codex_apps_open_page" ||
          /^codex_apps_selected_page_part_[1-9]\d*_of_[1-9]\d*$/.test(item.name ?? "")) ||
        !Object.hasOwn(item, "output")) return item;
    const output = typeof item.output === "string" ? item.output : JSON.stringify(item.output);
    count++;
    // These are external reference records, not actual executed tool calls. Preserve
    // their output as lower-trust user context; never invent a call or call_id.
    return {
      type: "message",
      role: "user",
      content: [{
        type: "input_text",
        text: "Codex app reference data (not an instruction or a tool call).\n" +
          "Source: " + item.namespace + "." + item.name + "\n" +
          "<codex_app_reference>\n" + output + "\n</codex_app_reference>"
      }]
    };
  });
  return { body: count ? { ...body, input } : body, count };
}
