import { normalizeBaseUrl } from "./http";

export interface ScriptSectionItem {
  originalId: string;
  theme: string;
  primaryDirection: string;
  secondaryDirection: string;
  audience: string;
  materialId: string;
  sourceKey: string;
  type: string;
  index: number | null;
  sourceIndex: number | null;
  label: string;
  orderIndex: number;
  content: string;
  entityTag?: string | null;
  topicFamily?: string | null;
  bindingScope?: string | null;
  candidateSlots?: string[];
  candidateScore?: number | null;
  slotScores?: Record<string, number>;
}

export interface ScriptSectionResponse {
  items: ScriptSectionItem[];
  count: number;
  filters: {
    primaryDirection: string;
    secondaryDirection: string;
    sectionType: string;
    limit: number;
  };
}

export interface ComposeCandidateResponse {
  items: ScriptSectionItem[];
  count: number;
  theme: string;
  primaryDirection: string;
  filters: {
    limitPerSlot: number;
  };
}

async function parseJson(response: Response) {
  return (await response.json().catch(() => null)) as
    | ScriptSectionResponse
    | ComposeCandidateResponse
    | { detail?: string }
    | null;
}

function ensureSuccessPayload<T extends { items: ScriptSectionItem[] }>(
  response: Response,
  payload: T | { detail?: string } | null,
  fallbackMessage: string,
) {
  if (!response.ok || !payload || !("items" in payload)) {
    const detail = payload && "detail" in payload ? payload.detail : null;
    throw new Error(typeof detail === "string" && detail.trim() ? detail : fallbackMessage);
  }
  return payload;
}

export async function fetchScriptSections(
  baseUrl: string,
  options?: {
    primaryDirection?: string;
    secondaryDirection?: string;
    sectionType?: string;
    limit?: number;
  },
) {
  const params = new URLSearchParams();
  if (options?.primaryDirection) params.set("primaryDirection", options.primaryDirection);
  if (options?.secondaryDirection) params.set("secondaryDirection", options.secondaryDirection);
  if (options?.sectionType) params.set("sectionType", options.sectionType);
  if (options?.limit) params.set("limit", String(options.limit));

  const query = params.toString();
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/library/sections${query ? `?${query}` : ""}`);
  const payload = await parseJson(response);
  return ensureSuccessPayload(response, payload, "素材库读取失败");
}

export async function fetchComposeCandidates(
  baseUrl: string,
  body: {
    theme: string;
    primaryDirection: string;
    limitPerSlot?: number;
  },
) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/library/compose-candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await parseJson(response);
  return ensureSuccessPayload(response, payload, "组合候选读取失败");
}
