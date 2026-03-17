export function normalizeBaseUrl(baseUrl: string) {
  const trimmed = (baseUrl || "/api").trim().replace(/\/+$/, "");
  if (!trimmed) return "/api";

  // Internal workbench requests must hit our backend proxy, not Gemini upstream URLs.
  if (trimmed === "/api" || /^api$/i.test(trimmed) || /\/api$/i.test(trimmed)) return "/api";
  if (/^\/?v\d+(?:beta\d*)?(?:\/.*)?$/i.test(trimmed)) return "/api";
  if (/^https?:\/\/[^\s]+\/v\d+(?:beta\d*)?(?:\/.*)?$/i.test(trimmed)) return "/api";
  if (/generativelanguage\.googleapis\.com/i.test(trimmed)) return "/api";

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
