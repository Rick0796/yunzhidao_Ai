import type { ApiSettings } from "../types";
import type { ComposeBlock, DedupeResult } from "./composerTypes";

function normalizeBaseUrl(baseUrl: string) {
  return (baseUrl || "/api").replace(/\/+$/, "");
}

function normalizeModelContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
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

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonBlock(text: string) {
  const codeFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch?.[1]) return codeFenceMatch[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return text.slice(firstBrace, lastBrace + 1);

  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) return text.slice(firstBracket, lastBracket + 1);

  return text.trim();
}

function extractItemsFromLooseJson(text: string) {
  const items: Array<{ id: string; content: string }> = [];
  const regex = /"id"\s*:\s*"([^"]+)"[\s\S]*?"content"\s*:\s*"([\s\S]*?)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const id = match[1]?.trim();
    const content = match[2]?.replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
    if (id && content) items.push({ id, content });
  }
  return items;
}

function normalizeRewriteItems(parsed: unknown): Array<{ id: string; content: string }> {
  if (Array.isArray(parsed)) {
    return parsed
      .filter(
        (item): item is { id: string; content: string } =>
          !!item &&
          typeof item === "object" &&
          "id" in item &&
          "content" in item &&
          typeof (item as { id?: unknown }).id === "string" &&
          typeof (item as { content?: unknown }).content === "string",
      )
      .map((item) => ({ id: item.id.trim(), content: item.content.trim() }))
      .filter((item) => item.id && item.content);
  }

  if (parsed && typeof parsed === "object" && "items" in parsed) {
    const items = (parsed as { items?: unknown }).items;
    return normalizeRewriteItems(items);
  }

  return [];
}

async function callChatCompletion(baseUrl: string, settings: ApiSettings, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string }; detail?: string }
    | null;

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      (typeof payload?.detail === "string" ? payload.detail : "") ||
      "去重调用失败";
    throw new Error(message);
  }

  return normalizeModelContent(payload?.choices?.[0]?.message?.content).trim();
}

function buildDedupeRules(blocks: ComposeBlock[]) {
  return blocks.map((block) => {
    if (block.sectionType === "A") return `${block.id}: 保持爆点强度，前半句必须继续抓人。`;
    if (block.sectionType === "K" || block.sectionType === "L") {
      return `${block.id}: 只能保留免费线直播/训练营路径，动作方式不能改。`;
    }
    if (block.sectionType === "B" || block.sectionType === "C") {
      return `${block.id}: 保留憋单和筛选功能，不要改成别的结构位。`;
    }
    return `${block.id}: 保留核心命题、事实、数字和逻辑走向，只降低表达重复度。`;
  });
}

async function repairDedupeJson(options: {
  settings: ApiSettings;
  baseUrl: string;
  malformedContent: string;
  targetBlocks: ComposeBlock[];
}) {
  try {
    const repairedContent = await callChatCompletion(options.baseUrl, options.settings, {
      model: options.settings.mainModel || options.settings.polishModel || "gemini-3-flash",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            '你是 JSON 修复助手。你会把给定内容严格整理成合法 JSON，对外只输出 {"items":[{"id":"...","content":"..."}]}。不要解释，不要多余文字。',
        },
        {
          role: "user",
          content: [
            "把下面这段去重结果修复成合法 JSON。",
            "必须保留每个 id，content 不能为空。",
            `目标 id：${options.targetBlocks.map((item) => item.id).join(", ")}`,
            options.malformedContent,
          ].join("\n"),
        },
      ],
    });
    return safeJsonParse(repairedContent) ?? safeJsonParse(extractJsonBlock(repairedContent));
  } catch {
    return null;
  }
}

async function dedupeSingleBlock(options: {
  settings: ApiSettings;
  baseUrl: string;
  theme: string;
  block: ComposeBlock;
}) {
  try {
    return await callChatCompletion(options.baseUrl, options.settings, {
      model: options.settings.mainModel || options.settings.polishModel || "gemini-3-flash",
      temperature: 0.45,
      messages: [
        {
          role: "system",
          content:
            "你是短视频文案分块去重助手。只重写这一段，保留核心命题、事实、数字和动作路径，不要解释，不要 JSON，只输出重写后的正文。",
        },
        {
          role: "user",
          content: [`主题：${options.theme}`, `板块：${options.block.sectionType}`, `原文：${options.block.content}`].join("\n"),
        },
      ],
    });
  } catch {
    return null;
  }
}

export async function dedupeComposeBlocks(options: {
  settings: ApiSettings;
  theme: string;
  blocks: ComposeBlock[];
  blockIds: string[];
}): Promise<DedupeResult> {
  const targetBlocks = options.blocks.filter((item) => options.blockIds.includes(item.id) && item.content.trim());
  if (!targetBlocks.length) {
    return { blocks: options.blocks, changed: false, warning: "没有选中可去重的板块。" };
  }

  const baseUrl = normalizeBaseUrl(options.settings.baseUrl || "/api");

  try {
    const content = await callChatCompletion(baseUrl, options.settings, {
      model: options.settings.mainModel || options.settings.polishModel || "gemini-3-flash",
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是短视频文案分块去重助手。你的任务是只降低表达重复度，不改变板块类型、核心命题、动作路径和事实信息。A段必须继续爆，K/L里的动作指令不能改，只能换说法。只输出 JSON。",
        },
        {
          role: "user",
          content: [
            `主题：${options.theme}`,
            "请按原顺序重写以下板块。",
            "要求：",
            "1. 每个板块分别重写。",
            "2. 保留原逻辑、原结论、原事实，不要洗软爆点。",
            '3. 输出格式：{"items":[{"id":"原id","content":"重写后内容"}]}',
            ...buildDedupeRules(targetBlocks),
            JSON.stringify({
              items: targetBlocks.map((item) => ({
                id: item.id,
                slotKey: item.slotKey,
                sectionType: item.sectionType,
                content: item.content,
              })),
            }),
          ].join("\n"),
        },
      ],
    });

    let parsed = safeJsonParse(content) ?? safeJsonParse(extractJsonBlock(content));
    if (!parsed) {
      const looseItems = extractItemsFromLooseJson(content);
      parsed = looseItems.length ? looseItems : null;
    }
    if (!parsed) {
      parsed = await repairDedupeJson({
        settings: options.settings,
        baseUrl,
        malformedContent: content,
        targetBlocks,
      });
    }

    const items = normalizeRewriteItems(parsed);
    if (!items.length) {
      const fallbackBlocks = [...options.blocks];
      let changed = false;
      for (const target of targetBlocks) {
        const rewritten = await dedupeSingleBlock({
          settings: options.settings,
          baseUrl,
          theme: options.theme,
          block: target,
        });
        if (!rewritten || !rewritten.trim()) continue;
        const index = fallbackBlocks.findIndex((item) => item.id === target.id);
        if (index >= 0) {
          fallbackBlocks[index] = { ...fallbackBlocks[index], content: rewritten.trim() };
          changed = true;
        }
      }

      return {
        blocks: fallbackBlocks,
        changed,
        warning: changed ? "批量去重返回异常，已自动切换为逐段去重。" : "去重结果异常，已保留原文。",
      };
    }

    const nextBlocks = options.blocks.map((block) => {
      const matched = items.find((item) => item.id === block.id);
      if (!matched || !matched.content.trim()) return block;
      return { ...block, content: matched.content.trim() };
    });

    return { blocks: nextBlocks, changed: true };
  } catch (error) {
    return {
      blocks: options.blocks,
      changed: false,
      warning: error instanceof Error ? error.message : "去重失败，已保留原文。",
    };
  }
}
