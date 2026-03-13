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

function normalizeBaseUrl(baseUrl: string) {
  return (baseUrl || "/api").replace(/\/+$/, "");
}

export async function fetchScriptSections(
  baseUrl: string,
  options?: {
    primaryDirection?: string;
    secondaryDirection?: string;
    sectionType?: string;
    limit?: number;
  }
) {
  const params = new URLSearchParams();
  if (options?.primaryDirection) params.set("primaryDirection", options.primaryDirection);
  if (options?.secondaryDirection) params.set("secondaryDirection", options.secondaryDirection);
  if (options?.sectionType) params.set("sectionType", options.sectionType);
  if (options?.limit) params.set("limit", String(options.limit));

  const query = params.toString();
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/library/sections${query ? `?${query}` : ""}`);
  const payload = (await response.json().catch(() => null)) as ScriptSectionResponse | { detail?: string } | null;

  if (!response.ok || !payload || !("items" in payload)) {
    const detail = payload && "detail" in payload ? payload.detail : null;
    throw new Error(typeof detail === "string" && detail.trim() ? detail : "素材库读取失败");
  }

  return payload;
}
