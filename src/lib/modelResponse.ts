export function extractJsonBlock(text: string) {
  const codeFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch?.[1]) {
    return codeFenceMatch[1].trim();
  }

  const trimmed = text.trim();

  // Detect whether this looks like an array or object response
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");

  // If array starts before object (or no object), extract array first
  if (firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace)) {
    const lastBracket = trimmed.lastIndexOf("]");
    if (lastBracket > firstBracket) {
      return trimmed.slice(firstBracket, lastBracket + 1);
    }
  }

  if (firstBrace >= 0) {
    const lastBrace = trimmed.lastIndexOf("}");
    if (lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }
  }

  return trimmed;
}

export function normalizeMessageContent(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }

        return "";
      })
      .join("");
  }

  return "";
}

export function safeJsonParse<T>(text: string) {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
