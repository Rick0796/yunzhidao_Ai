import { useMemo, useState } from "react";
import type { ApiSettings } from "../types";
import { fetchComposeCandidates, fetchScriptSections, type ScriptSectionItem } from "../lib/scriptLibrary";
import {
  applyComposeSuggestion,
  buildComposeDiagnostics,
  buildComposeReview,
  composeDraftFromSections,
  composeFullText,
  dedupeComposeBlocks,
  finalizeComposeBlocks,
  inferPrimaryDirection,
  insertManualComposeBlock,
  rematchComposeBlock,
  removeComposeBlock,
  SLOT_BLUEPRINT,
  titleForSlot,
  type ComposeBlock,
  type ComposeHistoryItem,
  type ComposeSectionType,
  type ComposeSlotKey,
  type DedupeResult,
  updateComposeBlock,
} from "../lib/composer";

const DIRECTION_OPTIONS = ["AI趋势", "财富", "认知"] as const;
const INSERT_SECTION_OPTIONS: ComposeSectionType[] = ["A", "B", "C", "D", "F", "G", "H", "I", "J", "K", "L"];
const LARGE_GROUPS: Array<{ key: string; label: string; slots: ComposeSlotKey[] }> = [
  { key: "opening", label: "开场大板块", slots: ["A", "B1", "C1", "D", "B2", "C2"] },
  { key: "middle", label: "中段大板块", slots: ["F", "G", "H", "I", "J"] },
  { key: "closing", label: "承接收口大板块", slots: ["K", "L"] },
];

type MessageTone = "error" | "success" | "info" | "warning";
type BusyAction = "assemble" | "random-opening" | "rematch" | "dedupe" | null;

interface NoticeState {
  tone: MessageTone;
  text: string;
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function getToneClass(tone: MessageTone) {
  if (tone === "error") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  if (tone === "success") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "warning") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  return "border-cyan-400/25 bg-cyan-400/10 text-cyan-100";
}

function buildHistoryItems(blocks: ComposeBlock[]): ComposeHistoryItem[] {
  return blocks
    .filter((block) => block.materialId || block.originalId || block.topicFamily || block.entityTag)
    .map((block) => ({
      materialId: block.materialId,
      originalId: block.originalId,
      topicFamily: block.topicFamily,
      entityTag: block.entityTag,
      slotKey: String(block.slotKey),
    }));
}

function hasMeaningfulChange(before: ComposeBlock[], after: ComposeBlock[], targetId?: string) {
  if (before.length !== after.length) return true;
  if (!targetId) {
    return before.some(
      (block, index) =>
        block.content !== after[index]?.content ||
        block.materialId !== after[index]?.materialId ||
        block.originalId !== after[index]?.originalId,
    );
  }
  const left = before.find((block) => block.id === targetId);
  const right = after.find((block) => block.id === targetId);
  if (!left || !right) return true;
  return (
    left.content !== right.content ||
    left.materialId !== right.materialId ||
    left.originalId !== right.originalId ||
    left.topicFamily !== right.topicFamily
  );
}

function getSectionLabel(type: ComposeSectionType) {
  return titleForSlot(type, type);
}

function blockBelongsToLargeGroup(slotKey: string, slots: ComposeSlotKey[]) {
  return slots.includes(slotKey as ComposeSlotKey);
}

export default function ComposeWorkbench({ settings }: { settings: ApiSettings }) {
  const [theme, setTheme] = useState("");
  const [customOpening, setCustomOpening] = useState("");
  const [primaryDirection, setPrimaryDirection] = useState<string>("AI趋势");
  const [sections, setSections] = useState<ScriptSectionItem[]>([]);
  const [blocks, setBlocks] = useState<ComposeBlock[]>([]);
  const [diagnostics, setDiagnostics] = useState<Array<{ level: "info" | "warning"; title: string; detail: string }>>([]);
  const [message, setMessage] = useState<NoticeState | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const [insertType, setInsertType] = useState<ComposeSectionType>("H");
  const [insertContent, setInsertContent] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [busyBlockId, setBusyBlockId] = useState<string | null>(null);
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false);
  const [historyBlocks, setHistoryBlocks] = useState<ComposeHistoryItem[]>([]);

  const resolvedTheme = (theme.trim() || customOpening.trim()).trim();
  const directionSuggestion = useMemo(() => inferPrimaryDirection(resolvedTheme || primaryDirection), [resolvedTheme, primaryDirection]);
  const review = useMemo(
    () =>
      blocks.length
        ? buildComposeReview({
            theme: resolvedTheme,
            blocks,
            sections,
            primaryDirection,
            historyBlocks,
          })
        : null,
    [blocks, sections, resolvedTheme, primaryDirection, historyBlocks],
  );
  const fullText = useMemo(() => composeFullText(blocks), [blocks]);

  function applyBlocks(nextBlocks: ComposeBlock[], nextTheme = resolvedTheme) {
    const finalized = finalizeComposeBlocks(nextTheme, nextBlocks);
    setBlocks(finalized);
    setDiagnostics(buildComposeDiagnostics(nextTheme, finalized));
  }

  function rememberBlocks(nextBlocks: ComposeBlock[]) {
    setHistoryBlocks((prev) => [...buildHistoryItems(nextBlocks), ...prev].slice(0, 180));
  }

  async function loadComposeSections(direction = primaryDirection, currentTheme = resolvedTheme || direction) {
    const response = await fetchComposeCandidates(settings.baseUrl || "/api", {
      theme: currentTheme,
      primaryDirection: direction,
      limitPerSlot: 18,
    });
    setSections(response.items);
    return response.items;
  }

  async function handleRandomOpening() {
    setBusyAction("random-opening");
    setBusyBlockId(null);
    setMessage({ tone: "info", text: "正在随机抽开头..." });

    try {
      const response = await fetchScriptSections(settings.baseUrl || "/api", {
        primaryDirection,
        sectionType: "A",
        limit: 60,
      });
      const historyAIds = new Set(historyBlocks.filter((item) => item.slotKey === "A").map((item) => item.materialId).filter(Boolean));
      const pool = response.items.filter((item) => item.content.trim());
      const freshPool = pool.filter((item) => !historyAIds.has(item.materialId));
      const finalPool = freshPool.length ? freshPool : pool;
      if (!finalPool.length) {
        setMessage({ tone: "warning", text: "当前方向还没有可用的开头素材。" });
        return;
      }
      const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
      setCustomOpening(pick.content.trim());
      if (!theme.trim()) setTheme((pick.theme || pick.content).slice(0, 24));
      setMessage({ tone: "success", text: "已随机抽到一个开头，你可以直接继续自动组合。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "随机抽开头失败" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAssemble() {
    const nextTheme = resolvedTheme;
    if (!nextTheme) {
      setMessage({ tone: "error", text: "先输入主题，或者先给一个自定义开头。" });
      return;
    }

    setBusyAction("assemble");
    setBusyBlockId(null);
    setMessage({ tone: "info", text: "正在自动匹配开头、两轮钩子动作、中段推进和收口..." });

    try {
      const library = await loadComposeSections(primaryDirection, nextTheme);
      const draft = composeDraftFromSections({
        theme: nextTheme,
        primaryDirection,
        customHook: customOpening,
        sections: library,
        historyBlocks,
      });

      setSelectedBlockIds([]);
      applyBlocks(draft.blocks, nextTheme);
      rememberBlocks(draft.blocks);
      setIsReviewPanelOpen(true);
      setMessage({ tone: "success", text: "初稿已经组合出来了。你可以逐块重匹配、插入、删除，最后再去重。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "自动组合失败" });
    } finally {
      setBusyAction(null);
      setBusyBlockId(null);
    }
  }

  async function handleRematch(blockId: string) {
    if (!resolvedTheme) {
      setMessage({ tone: "error", text: "先给主题或开头，再重匹配当前板块。" });
      return;
    }

    setBusyAction("rematch");
    setBusyBlockId(blockId);
    setMessage({ tone: "info", text: "正在重新匹配当前板块..." });

    try {
      const library = sections.length ? sections : await loadComposeSections(primaryDirection, resolvedTheme);
      const nextBlocks = rematchComposeBlock({
        blocks,
        targetId: blockId,
        sections: library,
        theme: resolvedTheme,
        primaryDirection,
        historyBlocks,
      });

      if (!hasMeaningfulChange(blocks, nextBlocks, blockId)) {
        setMessage({ tone: "warning", text: "当前没有更合适的候选，可以手动插入或换个主题方向再试。" });
        return;
      }

      applyBlocks(nextBlocks);
      rememberBlocks(nextBlocks);
      setMessage({ tone: "success", text: "当前板块已经重新匹配。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "重新匹配失败" });
    } finally {
      setBusyAction(null);
      setBusyBlockId(null);
    }
  }

  function handleBlockContentChange(blockId: string, value: string) {
    applyBlocks(updateComposeBlock(blocks, blockId, value));
  }

  function handleRemoveBlock(blockId: string) {
    const nextBlocks = removeComposeBlock(blocks, blockId);
    applyBlocks(nextBlocks);
    setSelectedBlockIds((prev) => prev.filter((item) => item !== blockId));
    if (insertAfterId === blockId) {
      setInsertAfterId(null);
      setInsertContent("");
    }
    setMessage({ tone: "info", text: "当前板块已删除。" });
  }

  function handleInsertManualBlock() {
    if (!insertAfterId || !insertContent.trim()) {
      setMessage({ tone: "warning", text: "先选插入位置，再填要插入的内容。" });
      return;
    }

    const nextBlocks = insertManualComposeBlock(blocks, insertAfterId, insertType, insertContent);
    applyBlocks(nextBlocks);
    setInsertAfterId(null);
    setInsertContent("");
    setMessage({ tone: "success", text: "手动插入成功。" });
  }

  function toggleBlockSelection(blockId: string) {
    setSelectedBlockIds((prev) => (prev.includes(blockId) ? prev.filter((item) => item !== blockId) : [...prev, blockId]));
  }

  async function handleDedupeSelection(blockIds: string[]) {
    if (!blockIds.length) {
      setMessage({ tone: "warning", text: "先选中要去重的板块。" });
      return;
    }
    if (!resolvedTheme) {
      setMessage({ tone: "error", text: "先确定主题后再去重。" });
      return;
    }

    setBusyAction("dedupe");
    setBusyBlockId(null);
    setMessage({ tone: "info", text: "正在去重中..." });

    try {
      const result: DedupeResult = await dedupeComposeBlocks({
        settings,
        theme: resolvedTheme,
        blocks,
        blockIds,
      });
      applyBlocks(result.blocks);
      if (result.changed) {
        setMessage({ tone: result.warning ? "warning" : "success", text: result.warning || "选中板块已完成去重。" });
      } else {
        setMessage({ tone: result.warning ? "warning" : "info", text: result.warning || "这次没有产生新的去重结果。" });
      }
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "去重失败" });
    } finally {
      setBusyAction(null);
    }
  }

  function applySuggestionAndRefresh(index: number) {
    if (!review?.suggestions[index]) return;
    const nextBlocks = applyComposeSuggestion(blocks, review.suggestions[index]);
    applyBlocks(nextBlocks);
    rememberBlocks(nextBlocks);
    setMessage({ tone: "success", text: "建议已经应用到当前草稿。" });
  }

  const selectedCount = selectedBlockIds.length;

  return (
    <section className="space-y-5">
      <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="text-sm font-semibold tracking-[0.3em] text-cyan-200/80">文案组合</div>
            <h2 className="text-2xl font-semibold text-white">结构化组合工作台</h2>
            <p className="text-sm leading-7 text-slate-300">
              我们先定主题或先给一个开头，再按固定结构自动组装。后面每个小板块都能单独换、单独删、单独插入，最后再按小板块或大板块去重。
            </p>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs text-slate-400">当前方向</div>
              <div className="mt-1 font-medium text-white">{primaryDirection}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs text-slate-400">建议方向</div>
              <div className="mt-1 font-medium text-white">{directionSuggestion}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 backdrop-blur">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">主题</label>
              <textarea
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
                rows={3}
                placeholder="例如：未来三年普通人最危险的资产 / AI会不会取代白领 / 数字资产为什么是未来硬通货"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-300/50 focus:bg-slate-900"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">自定义开头</label>
              <textarea
                value={customOpening}
                onChange={(event) => setCustomOpening(event.target.value)}
                rows={3}
                placeholder="你也可以先给一句开头，比如：别存钱了 / 未来三年不是机会年，是分水岭"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-300/50 focus:bg-slate-900"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">主方向</label>
                <select
                  value={primaryDirection}
                  onChange={(event) => setPrimaryDirection(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50"
                >
                  {DIRECTION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <button
                  type="button"
                  onClick={handleRandomOpening}
                  disabled={busyAction !== null}
                  className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-5 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === "random-opening" ? "正在抽取..." : "随机抽开头"}
                </button>
                <button
                  type="button"
                  onClick={handleAssemble}
                  disabled={busyAction !== null}
                  className="rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === "assemble" ? "正在组合..." : "开始组合"}
                </button>
              </div>
            </div>

            {message ? (
              <div className={classNames("rounded-2xl border px-4 py-3 text-sm leading-7", getToneClass(message.tone))}>{message.text}</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">自动诊断与替换建议</div>
              <div className="mt-1 text-xs text-slate-400">先看总分和建议，再决定换哪一块会更省力。</div>
            </div>
            <button
              type="button"
              onClick={() => setIsReviewPanelOpen((value) => !value)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              {isReviewPanelOpen ? "收起" : "展开"}
            </button>
          </div>

          {review ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/8 p-4">
                <div className="text-xs text-cyan-100/80">整稿总分</div>
                <div className="mt-1 text-3xl font-semibold text-white">{review.overallScore}</div>
                <div className="mt-2 text-xs text-slate-300">建议数：{review.suggestions.length} / 诊断数：{diagnostics.length}</div>
              </div>

              {isReviewPanelOpen ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    {review.metrics.map((metric) => (
                      <div key={metric.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-white">{metric.title}</div>
                          <div
                            className={classNames(
                              "rounded-full px-2.5 py-1 text-xs font-medium",
                              metric.level === "good"
                                ? "bg-emerald-400/15 text-emerald-100"
                                : metric.level === "watch"
                                  ? "bg-amber-400/15 text-amber-100"
                                  : "bg-rose-400/15 text-rose-100",
                            )}
                          >
                            {metric.score}
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-slate-200">{metric.summary}</div>
                        <div className="mt-2 text-xs leading-6 text-slate-400">{metric.detail}</div>
                      </div>
                    ))}
                  </div>

                  {review.suggestions.length ? (
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-medium text-white">替换建议</div>
                      {review.suggestions.map((suggestion, index) => (
                        <div key={suggestion.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-white">{suggestion.title}</div>
                              <div className="text-xs leading-6 text-slate-400">{suggestion.reason}</div>
                              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-6 text-slate-300">
                                {suggestion.preview}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => applySuggestionAndRefresh(index)}
                              className="rounded-full bg-cyan-400/15 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/25"
                            >
                              采用这条建议
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {diagnostics.length ? (
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-medium text-white">诊断提示</div>
                      {diagnostics.map((item, index) => (
                        <div
                          key={`${item.title}-${index}`}
                          className={classNames(
                            "rounded-2xl border px-4 py-3 text-sm leading-7",
                            item.level === "warning"
                              ? "border-amber-300/20 bg-amber-300/10 text-amber-50"
                              : "border-cyan-300/20 bg-cyan-300/10 text-cyan-50",
                          )}
                        >
                          <div className="font-medium">{item.title}</div>
                          <div className="mt-1 text-xs text-current/85">{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-10 text-sm leading-7 text-slate-400">
              组合出第一版草稿后，这里会显示整稿评分、诊断提示和替换建议。
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">当前组合稿</div>
            <div className="mt-1 text-xs text-slate-400">每个小板块都可以单独编辑、重匹配、删除或插入。</div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleDedupeSelection(selectedBlockIds)}
              disabled={busyAction === "dedupe" || !selectedCount}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === "dedupe" ? "正在去重中..." : `去重已选 ${selectedCount || ""}`.trim()}
            </button>
            {LARGE_GROUPS.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() =>
                  handleDedupeSelection(
                    blocks.filter((block) => blockBelongsToLargeGroup(String(block.slotKey), group.slots)).map((block) => block.id),
                  )
                }
                disabled={busyAction === "dedupe" || !blocks.some((block) => blockBelongsToLargeGroup(String(block.slotKey), group.slots))}
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                去重{group.label}
              </button>
            ))}
          </div>
        </div>

        {blocks.length ? (
          <div className="mt-5 space-y-4">
            {blocks.map((block) => {
              const isSelected = selectedBlockIds.includes(block.id);
              const isBusy = busyAction === "rematch" && busyBlockId === block.id;
              const insertOpen = insertAfterId === block.id;

              return (
                <div key={block.id} className="rounded-[24px] border border-white/10 bg-slate-900/70 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleBlockSelection(block.id)}
                          className={classNames(
                            "rounded-full px-3 py-1.5 text-xs font-medium transition",
                            isSelected ? "bg-cyan-400 text-slate-950" : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                          )}
                        >
                          {isSelected ? "已选中" : "选中"}
                        </button>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">{block.title}</span>
                        {block.isManual ? (
                          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">手动插入</span>
                        ) : null}
                        {block.materialId ? (
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-slate-400">{block.materialId}</span>
                        ) : null}
                      </div>
                      {block.bridgeText ? <div className="text-xs leading-6 text-cyan-100/70">系统补桥：{block.bridgeText}</div> : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleRematch(block.id)}
                        disabled={busyAction !== null}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy ? "正在匹配..." : "重新匹配"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setInsertAfterId((value) => (value === block.id ? null : block.id));
                          setInsertContent("");
                        }}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10"
                      >
                        {insertOpen ? "收起插入" : "手动插入"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveBlock(block.id)}
                        className="rounded-full border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-xs font-medium text-rose-100 transition hover:bg-rose-300/20"
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={block.content}
                    onChange={(event) => handleBlockContentChange(block.id, event.target.value)}
                    rows={Math.max(4, Math.min(12, Math.ceil(block.content.length / 40)))}
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-300/50"
                  />

                  {insertOpen ? (
                    <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-4">
                      <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
                        <select
                          value={insertType}
                          onChange={(event) => setInsertType(event.target.value as ComposeSectionType)}
                          className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50"
                        >
                          {INSERT_SECTION_OPTIONS.map((item) => (
                            <option key={item} value={item}>
                              {getSectionLabel(item)}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={insertContent}
                          onChange={(event) => setInsertContent(event.target.value)}
                          rows={3}
                          placeholder="输入你要手动插入的板块内容"
                          className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm leading-7 text-white outline-none focus:border-cyan-300/50"
                        />
                        <button
                          type="button"
                          onClick={handleInsertManualBlock}
                          className="self-end rounded-full bg-cyan-400/15 px-4 py-3 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/25"
                        >
                          插入到这里后面
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/5 px-5 py-12 text-center text-sm leading-7 text-slate-400">
            先给主题或开头，再点击“开始组合”，这里就会生成完整的板块草稿。
          </div>
        )}
      </div>

      <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">整稿预览</div>
            <div className="mt-1 text-xs text-slate-400">这里是最终输出前的整篇预览，桥接语也会一起显示。</div>
          </div>
          <div className="text-xs text-slate-400">当前板块数：{blocks.length}</div>
        </div>
        <textarea
          value={fullText}
          readOnly
          rows={Math.max(12, Math.min(30, Math.ceil(Math.max(fullText.length, 1) / 36)))}
          className="mt-4 w-full rounded-[24px] border border-white/10 bg-slate-950/80 px-5 py-4 text-sm leading-8 text-slate-100 outline-none"
        />
      </div>
    </section>
  );
}
