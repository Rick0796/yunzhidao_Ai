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

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/library/sections?${params.toString()}`);
  const payload = (await response.json().catch(() => null)) as ScriptSectionResponse | null;

  if (!response.ok || !payload) {
    const detail = (payload as any)?.detail || response.statusText || "素材库读取失败";
    throw new Error(typeof detail === "string" ? detail : "素材库读取失败");
  }

  return payload;
}
