import type { ApiSettings } from "../types";
import type { ComposeBlock, DedupeComparisonItem, DedupeResult } from "./composerTypes";
import { normalizeBaseUrl } from "./http";

function errorMessageFromPayload(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message.trim() || fallback;
  }
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  const warning = (payload as { warning?: unknown }).warning;
  if (typeof warning === "string" && warning.trim()) return warning.trim();
  return fallback;
}

function normalizeReturnedBlock(original: ComposeBlock, candidate: unknown): ComposeBlock {
  if (!candidate || typeof candidate !== "object") {
    return original;
  }

  const item = candidate as Partial<ComposeBlock>;
  const nextId = typeof item.id === "string" ? item.id.trim() : "";
  const nextContent = typeof item.content === "string" ? item.content.trim() : "";
  if (!nextId || nextId !== original.id || !nextContent) {
    return original;
  }

  return {
    ...original,
    ...item,
    id: original.id,
    slotKey: typeof item.slotKey === "string" && item.slotKey.trim() ? item.slotKey : original.slotKey,
    sectionType: typeof item.sectionType === "string" && item.sectionType.trim() ? item.sectionType : original.sectionType,
    title: typeof item.title === "string" && item.title.trim() ? item.title : original.title,
    content: nextContent,
  };
}

function normalizeComparisons(value: unknown): DedupeComparisonItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is DedupeComparisonItem => {
      if (!item || typeof item !== "object") return false;
      const typed = item as Partial<DedupeComparisonItem>;
      return (
        typeof typed.id === "string" &&
        typeof typed.slotKey === "string" &&
        typeof typed.title === "string" &&
        typeof typed.before === "string" &&
        typeof typed.after === "string" &&
        typeof typed.note === "string" &&
        (typed.verdict === "stable" || typed.verdict === "watch") &&
        typeof typed.beforeLength === "number" &&
        typeof typed.afterLength === "number" &&
        typeof typed.lengthDelta === "number" &&
        typeof typed.similarityScore === "number"
      );
    })
    .map((item) => ({
      ...item,
      before: item.before.trim(),
      after: item.after.trim(),
      note: item.note.trim(),
    }))
    .filter((item) => item.before && item.after);
}

export async function dedupeComposeBlocks(options: {
  settings: ApiSettings;
  theme: string;
  blocks: ComposeBlock[];
  blockIds: string[];
}): Promise<DedupeResult> {
  const targetBlocks = options.blocks.filter((item) => options.blockIds.includes(item.id) && item.content.trim());
  if (!targetBlocks.length) {
    return { blocks: options.blocks, changed: false, warning: "\u6ca1\u6709\u9009\u4e2d\u53ef\u53bb\u91cd\u7684\u677f\u5757\u3002", comparisons: [] };
  }

  const baseUrl = normalizeBaseUrl(options.settings.baseUrl || "/api");

  try {
    const response = await fetch(`${baseUrl}/library/compose-dedupe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        theme: options.theme,
        blocks: options.blocks,
        blockIds: options.blockIds,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          blocks?: unknown;
          changed?: unknown;
          warning?: unknown;
          comparisons?: unknown;
          error?: { message?: string };
          detail?: string;
        }
      | null;

    if (!response.ok) {
      throw new Error(errorMessageFromPayload(payload, "\u53bb\u91cd\u6267\u884c\u5931\u8d25"));
    }

    const returnedBlocks = Array.isArray(payload?.blocks) ? payload?.blocks : [];
    const blockMap = new Map<string, unknown>();
    for (const item of returnedBlocks) {
      if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
        blockMap.set((item as { id: string }).id, item);
      }
    }

    const nextBlocks = options.blocks.map((block) => normalizeReturnedBlock(block, blockMap.get(block.id)));
    const comparisons = normalizeComparisons(payload?.comparisons);
    const warning = typeof payload?.warning === "string" && payload.warning.trim() ? payload.warning.trim() : null;

    return {
      blocks: nextBlocks,
      changed: Boolean(payload?.changed),
      warning,
      comparisons,
    };
  } catch (error) {
    return {
      blocks: options.blocks,
      changed: false,
      warning: error instanceof Error ? error.message : "\u53bb\u91cd\u6267\u884c\u5931\u8d25",
      comparisons: [],
    };
  }
}
