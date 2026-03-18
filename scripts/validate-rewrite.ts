import { generateViralRewriteDrafts } from "../src/lib/viralRewrite";
import { createTaskForMode } from "../src/lib/workbenchHelpers";

function splitParagraphs(text: string) {
  return text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const task = {
    ...createTaskForMode("rewrite"),
    sourceText: [
      "Line one keeps the opening proposition and audience tension.",
      "Line two explains the structure requirement and keeps the middle progression.",
      "Line three closes the idea and warns that the rewrite must not break the structure.",
    ].join("\n\n"),
    userNote: "Keep structure unchanged and keep length close.",
  };

  const settings = {
    useLiveApi: false,
    baseUrl: "/api",
    apiKey: "",
    mainModel: "gemini-2.5-flash",
    batchModel: "gemini-2.5-flash",
    polishModel: "gemini-2.5-flash",
    imageModel: "gemini-2.5-flash",
    requestTimeoutMs: 180000,
  };

  const one = await generateViralRewriteDrafts({ settings, task, count: 1 });
  assert(one.data.items.length === 1, "single rewrite should return 1 item");
  const sourceParagraphs = splitParagraphs(task.sourceText);
  const firstDraftParagraphs = splitParagraphs(one.data.items[0].script);
  assert(firstDraftParagraphs.length === sourceParagraphs.length, "single rewrite should preserve paragraph count");
  const sourceLength = task.sourceText.replace(/\s+/g, "").length;
  const draftLength = one.data.items[0].script.replace(/\s+/g, "").length;
  const ratio = draftLength / Math.max(1, sourceLength);
  assert(ratio >= 0.72 && ratio <= 1.35, `single rewrite length ratio out of range: ${ratio.toFixed(2)}`);

  const batch = await generateViralRewriteDrafts({ settings, task, count: 3, existingScripts: [one.data.items[0].script] });
  assert(batch.data.items.length === 3, "batch rewrite should return 3 items");
  const uniqueScripts = new Set(batch.data.items.map((item) => item.script)).size;
  assert(uniqueScripts === batch.data.items.length, "batch rewrite scripts should be unique");
  batch.data.items.forEach((item, index) => {
    const paragraphs = splitParagraphs(item.script);
    assert(paragraphs.length === sourceParagraphs.length, `draft ${index + 1} should preserve paragraph count`);
    const nextRatio = item.script.replace(/\s+/g, "").length / Math.max(1, sourceLength);
    assert(nextRatio >= 0.72 && nextRatio <= 1.35, `draft ${index + 1} length ratio out of range: ${nextRatio.toFixed(2)}`);
  });

  console.log("rewrite validation passed");
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
