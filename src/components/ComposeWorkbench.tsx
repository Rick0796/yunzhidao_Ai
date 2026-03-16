import { useMemo, useState } from "react";
import type { ApiSettings } from "../types";
import { fetchComposeCandidates, fetchScriptSections, type ScriptSectionItem } from "../lib/scriptLibrary";
import {
  LARGE_GROUPS,
  SECTION_TITLE_MAP,
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
  type ComposeBlock,
  type ComposeHistoryItem,
  type ComposeSectionType,
  type ComposeSlotKey,
  type DedupeComparisonItem,
} from "../lib/composer";

const DIRECTION_OPTIONS = ["AI趋势", "财富", "认知"] as const;
const INSERT_TYPES: ComposeSectionType[] = ["A", "B", "C", "D", "F", "G", "H", "I", "J", "K", "L"];

type Tone = "info" | "success" | "warning" | "error";
type BusyAction = "assemble" | "random-opening" | "rematch" | "dedupe" | null;

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function toneClass(tone: Tone) {
  if (tone === "success") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "warning") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (tone === "error") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  return "border-cyan-400/25 bg-cyan-400/10 text-cyan-100";
}

function historyFromBlocks(blocks: ComposeBlock[]): ComposeHistoryItem[] {
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

function changedEnough(before: ComposeBlock[], after: ComposeBlock[], targetId?: string) {
  if (before.length !== after.length) return true;
  if (!targetId) {
    return before.some((item, index) => item.content !== after[index]?.content || item.materialId !== after[index]?.materialId);
  }
  const left = before.find((item) => item.id === targetId);
  const right = after.find((item) => item.id === targetId);
  return !left || !right || left.content !== right.content || left.materialId !== right.materialId;
}

function defaultInsertContent(type: ComposeSectionType) {
  if (type === "B") return "接下来的内容你一定要认真听。";
  if (type === "C") return "能看到这里的人，说明你是真的想改变。";
  if (type === "D") return "真正的变化往往不是突然发生，而是等你回头看的时候才发现规则已经换了。";
  if (type === "J") return "所以普通人接下来真正要做的，不是继续硬扛，而是先把自己的效率结构升级。";
  return "";
}

function blockBelongsToLargeGroup(slotKey: string, slots: ComposeSlotKey[]) {
  return slots.includes(slotKey as ComposeSlotKey);
}

const SLOT_LABEL_MAP: Record<string, string> = {
  A: "开头爆点",
  B1: "第一次钩子",
  C1: "第一次动作",
  D: "铺垫承接",
  B2: "第二次钩子",
  C2: "第二次动作",
  F: "趋势判断",
  G: "旧逻辑对比",
  H: "现实案例",
  I: "风险代价",
  J: "解法路径",
  K: "课程承接",
  L: "最终动作",
};

function displaySlotLabel(slotKey: string, fallback = "") {
  return SLOT_LABEL_MAP[slotKey] || fallback || "手动片段";
}

function displayGroupLabel(slotKey: string, isManual = false) {
  if (isManual) return "手动插入";
  if (["A", "B1", "C1", "D", "B2", "C2"].includes(slotKey)) return "开场段";
  if (["F", "G", "H", "I", "J"].includes(slotKey)) return "中段推进";
  return "承接收口";
}


export default function ComposeWorkbench({ settings }: { settings: ApiSettings }) {
  const [theme, setTheme] = useState("");
  const [customOpening, setCustomOpening] = useState("");
  const [primaryDirection, setPrimaryDirection] = useState<string>("AI趋势");
  const [sections, setSections] = useState<ScriptSectionItem[]>([]);
  const [blocks, setBlocks] = useState<ComposeBlock[]>([]);
  const [historyBlocks, setHistoryBlocks] = useState<ComposeHistoryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const [insertType, setInsertType] = useState<ComposeSectionType>("H");
  const [insertContent, setInsertContent] = useState("");
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [busyBlockId, setBusyBlockId] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [comparisons, setComparisons] = useState<DedupeComparisonItem[]>([]);

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
    [blocks, sections, primaryDirection, resolvedTheme, historyBlocks],
  );
  const diagnostics = useMemo(() => buildComposeDiagnostics(resolvedTheme, blocks), [resolvedTheme, blocks]);
  const fullText = useMemo(() => composeFullText(blocks), [blocks]);
  const stableComparisonCount = comparisons.filter((item) => item.verdict === "stable").length;
  const reviewComparisonCount = comparisons.length - stableComparisonCount;

  async function handleCopy(text: string, successText: string) {
    if (!text.trim()) {
      setMessage({ tone: "warning", text: "当前没有可复制的文案。" });
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setMessage({ tone: "success", text: successText });
        return;
      }
      setMessage({ tone: "warning", text: "当前环境不支持一键复制，请手动复制。" });
    } catch (error) {
      setMessage({ tone: "warning", text: error instanceof Error ? error.message : "复制失败，请手动复制。" });
    }
  }

  function jumpToBlock(blockId: string) {
    const element = document.getElementById(`compose-block-${blockId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyBlocks(nextBlocks: ComposeBlock[]) {
    const finalized = finalizeComposeBlocks(resolvedTheme, nextBlocks);
    const validIds = new Set(finalized.map((item) => item.id));
    setBlocks(finalized);
    setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
    if (insertAfterId && !validIds.has(insertAfterId)) {
      setInsertAfterId(null);
    }
  }

  function remember(nextBlocks: ComposeBlock[]) {
    setHistoryBlocks((prev) => [...historyFromBlocks(nextBlocks), ...prev].slice(0, 180));
  }

  async function loadSections(direction = primaryDirection, currentTheme = resolvedTheme || direction) {
    const response = await fetchComposeCandidates("/api", {
      theme: currentTheme,
      primaryDirection: direction,
      limitPerSlot: 18,
    });
    setSections(response.items);
    return response.items;
  }

  async function handleRandomOpening() {
    setBusyAction("random-opening");
    setMessage({ tone: "info", text: "正在随机抽取开头..." });
    try {
      const response = await fetchScriptSections("/api", {
        primaryDirection,
        sectionType: "A",
        limit: 60,
      });
      const pool = response.items.filter((item) => item.content.trim());
      if (!pool.length) {
        setMessage({ tone: "warning", text: "当前方向还没有可用的开头素材。" });
        return;
      }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setCustomOpening(pick.content.trim());
      if (!theme.trim()) setTheme((pick.theme || pick.content).slice(0, 24));
      setMessage({ tone: "success", text: "已随机抽到一个开头。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "随机抽开头失败" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAssemble() {
    if (!resolvedTheme) {
      setMessage({ tone: "error", text: "先输入主题，或者先给一个自定义开头。" });
      return;
    }
    setBusyAction("assemble");
    setMessage({ tone: "info", text: "正在组合整篇文案..." });
    setComparisons([]);
    try {
      const library = await loadSections(primaryDirection, resolvedTheme);
      const draft = composeDraftFromSections({
        theme: resolvedTheme,
        primaryDirection,
        customHook: customOpening,
        sections: library,
        historyBlocks,
      });
      applyBlocks(draft.blocks);
      remember(draft.blocks);
      setSelectedIds([]);
      setIsReviewOpen(true);
      setMessage({ tone: "success", text: "第一版草稿已经组合出来了。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "自动组合失败" });
    } finally {
      setBusyAction(null);
      setBusyBlockId(null);
    }
  }

  async function handleRematch(blockId: string) {
    if (!resolvedTheme) {
      setMessage({ tone: "error", text: "先确定主题或开头，再重匹配当前板块。" });
      return;
    }
    setBusyAction("rematch");
    setBusyBlockId(blockId);
    setMessage({ tone: "info", text: "正在重新匹配当前板块..." });
    try {
      const library = sections.length ? sections : await loadSections(primaryDirection, resolvedTheme);
      const next = rematchComposeBlock({
        blocks,
        targetId: blockId,
        sections: library,
        theme: resolvedTheme,
        primaryDirection,
        historyBlocks,
      });
      if (!changedEnough(blocks, next, blockId)) {
        setMessage({ tone: "warning", text: "当前没有更合适的候选，可以手动插入。" });
        return;
      }
      applyBlocks(next);
      remember(next);
      setMessage({ tone: "success", text: "当前板块已经重新匹配。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "重新匹配失败" });
    } finally {
      setBusyAction(null);
      setBusyBlockId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function handleInsert() {
    if (!insertAfterId || !insertContent.trim()) {
      setMessage({ tone: "warning", text: "先选插入位置，再填写内容。" });
      return;
    }
    const next = insertManualComposeBlock(blocks, insertAfterId, insertType, insertContent);
    applyBlocks(next);
    setInsertAfterId(null);
    setInsertContent("");
    setMessage({ tone: "success", text: "手动插入成功。" });
  }

  async function handleDedupe(blockIds: string[]) {
    if (!blockIds.length) {
      setMessage({ tone: "warning", text: "先选中要去重的板块。" });
      return;
    }
    if (!resolvedTheme) {
      setMessage({ tone: "error", text: "先确定主题后再去重。" });
      return;
    }
    setBusyAction("dedupe");
    setMessage({ tone: "info", text: "正在去重中..." });
    try {
      const result = await dedupeComposeBlocks({ settings, theme: resolvedTheme, blocks, blockIds });
      applyBlocks(result.blocks);
      setComparisons(result.comparisons || []);
      setMessage({
        tone: result.warning ? "warning" : result.changed ? "success" : "info",
        text: result.warning || (result.changed ? "去重完成。" : "这次没有产生新的去重结果。"),
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "去重失败" });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="compose-shell shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur">
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 sm:px-6 text-left"
          onClick={() => setIsHeaderCollapsed((v) => !v)}
        >
          <div>
            <div className="section-eyebrow">文案组合</div>
            <h2 className="mt-1 text-xl font-semibold text-white sm:text-2xl">组合稿工作台</h2>
          </div>
          <span className="compose-toolbar-btn shrink-0">{isHeaderCollapsed ? "展开" : "收起"}</span>
        </button>

        {!isHeaderCollapsed && (
          <div className="border-t border-white/8 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="space-y-3">
                  <p className="text-sm leading-7 text-slate-300 sm:text-[15px]">
                    这版把整稿预览、自动诊断、替换建议和逐块编辑放进同一套界面。桌面端先看右侧预览台，手机端先看结果再改细节，不用再反复翻到底部找整稿。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="compose-chip compose-chip-cyan">自动组装</span>
                  <span className="compose-chip compose-chip-emerald">逐块替换</span>
                  <span className="compose-chip compose-chip-amber">保真去重</span>
                  <span className="compose-chip compose-chip-slate">移动端优先</span>
                </div>
              </div>
              <div className="grid min-w-[240px] gap-3 sm:grid-cols-2 xl:w-[360px]">
                <div className="compose-stat-card">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">当前方向</div>
                  <div className="mt-3 text-lg font-semibold text-white">{primaryDirection}</div>
                </div>
                <div className="compose-stat-card">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">建议方向</div>
                  <div className="mt-3 text-lg font-semibold text-white">{directionSuggestion}</div>
                </div>
                <div className="compose-stat-card">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">已装配片段</div>
                  <div className="mt-3 text-lg font-semibold text-white">{blocks.length} 段</div>
                </div>
                <div className="compose-stat-card">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">整稿长度</div>
                  <div className="mt-3 text-lg font-semibold text-white">{fullText.length || 0} 字</div>
                  <div className="mt-2 text-xs text-slate-400">已选去重 {selectedIds.length} 段</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] xl:items-start min-w-0 overflow-hidden">
        <div className="space-y-5">
          <div className="compose-panel p-5 sm:p-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">主题</label>
              <textarea
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
                rows={3}
                placeholder="例如：未来三年普通人最危险的资产 / AI 会不会取代白领 / 数字资产为什么是未来硬通货"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-300/50 focus:bg-slate-900"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">自定义开头</label>
              <textarea
                value={customOpening}
                onChange={(event) => setCustomOpening(event.target.value)}
                rows={3}
                placeholder="你也可以先给一句开头，例如：别存钱了 / 未来三年不是机会年，是分水岭"
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
                  {DIRECTION_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
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
              <div className={classNames("rounded-2xl border px-4 py-3 text-sm leading-7", toneClass(message.tone))}>
                {message.text}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="compose-stat-card">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">当前主题锚点</div>
                <div className="mt-3 text-sm font-medium leading-6 text-white">{resolvedTheme || "还没输入主题，先把命题钉住。"}</div>
              </div>
              <div className="compose-stat-card">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">开场策略</div>
                <div className="mt-3 text-sm font-medium leading-6 text-white">{customOpening.trim() ? "已给自定义开头，组合时会优先贴着这个开场往下走。" : "还没给开头，系统会先从素材库抽开头再往下组合。"}</div>
              </div>
              <div className="compose-stat-card">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">组合路径</div>
                <div className="mt-3 text-sm font-medium leading-6 text-white">开场抓停 → 中段推进 → 承接收口</div>
              </div>
              <div className="compose-stat-card">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">去重底线</div>
                <div className="mt-3 text-sm font-medium leading-6 text-white">只降重复度，不改爆点，不偷字，字数和句式都尽量贴原文。</div>
              </div>
            </div>
          </div>
        </div>
          <div className="compose-panel p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-white">自动诊断与替换建议</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">先看总评，再决定换哪一块。建议区现在也支持直接复制和一键替换。</div>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewOpen((value) => !value)}
                className="compose-toolbar-btn shrink-0"
              >
                {isReviewOpen ? "收起" : "展开"}
              </button>
            </div>

            {review ? (
              <div className="mt-5 space-y-5">
                <div className="compose-score-card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/80">整稿总评</div>
                      <div className="mt-3 text-5xl font-semibold text-white">{review.overallScore}</div>
                      <div className="mt-3 text-sm text-slate-300">建议 {review.suggestions.length} 条 · 结构提醒 {diagnostics.length} 条</div>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-slate-300">
                      先看这张总评卡，再往下挑需要换的片段，会比一条条盲改省力很多。
                    </div>
                  </div>
                  <div className="compose-progress-track mt-4">
                    <div className="compose-progress-bar" style={{ width: `${review.overallScore}%` }} />
                  </div>
                </div>

                {isReviewOpen ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      {review.metrics.map((metric) => (
                        <div key={metric.key} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                          <div className="flex items-center justify-between gap-3">
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
                          <div className="compose-progress-track mt-3">
                            <div className="compose-progress-bar" style={{ width: `${metric.score}%` }} />
                          </div>
                          <div className="mt-3 text-sm text-slate-200">{metric.summary}</div>
                          <div className="mt-2 text-xs leading-6 text-slate-400">{metric.detail}</div>
                        </div>
                      ))}
                    </div>

                    {diagnostics.length ? (
                      <div className="space-y-3 rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                        <div className="text-sm font-medium text-white">结构提醒</div>
                        {diagnostics.map((item, index) => (
                          <div
                            key={`${item.title}-${index}`}
                            className={classNames(
                              "rounded-2xl border px-4 py-3 text-sm leading-7",
                              item.level === "warning"
                                ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
                                : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
                            )}
                          >
                            <div className="font-medium">{item.title}</div>
                            <div className="mt-1 text-xs text-slate-200/90">{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {review.suggestions.length ? (
                      <div className="space-y-3 rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                        <div className="text-sm font-medium text-white">替换建议</div>
                        {review.suggestions.map((item) => (
                          <div key={item.id} className="rounded-[20px] border border-white/10 bg-slate-900/70 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-medium text-white">{item.title}</div>
                                  <span className="compose-chip compose-chip-slate">{displayGroupLabel(item.slotKey)}</span>
                                </div>
                                <div className="text-xs leading-6 text-slate-400">{item.reason}</div>
                                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs leading-6 text-slate-300">
                                  {item.preview}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 md:max-w-[220px] md:justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(item.candidateContent, "建议文案已复制。")}
                                  className="compose-copy-btn"
                                >
                                  复制建议
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = applyComposeSuggestion(blocks, item);
                                    applyBlocks(next);
                                    remember(next);
                                    setMessage({ tone: "success", text: "建议已经应用到当前草稿。" });
                                  }}
                                  className="compose-toolbar-btn"
                                >
                                  采用这条建议
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-sm leading-7 text-slate-400">
                组合出第一版草稿后，这里会出现总分、结构提醒和替换建议。
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <div className="compose-panel p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">整稿预览台</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">整稿固定放在右侧上方，随时查看、复制，也能直接跳到对应片段。</div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(fullText, "组合整稿已复制。")}
                disabled={!fullText}
                className="compose-copy-btn whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
              >
                复制整稿
              </button>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 mobile-scroll-row">
              {blocks.length ? (
                blocks.map((block, index) => (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => jumpToBlock(block.id)}
                    className="compose-chip compose-chip-slate shrink-0"
                  >
                    {index + 1}. {displaySlotLabel(String(block.slotKey), block.title)}
                  </button>
                ))
              ) : (
                <span className="compose-chip compose-chip-slate">还没有生成片段</span>
              )}
            </div>
            {fullText ? (
              <div className="compose-preview-window mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-100">{fullText}</div>
            ) : (
              <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-sm leading-7 text-slate-400">
                先生成第一版组合稿，这里会把整稿预览固定在上方。
              </div>
            )}
          </div>

          {comparisons.length ? (
            <div className="compose-panel p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">去重前后对比</div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">这里专门检查保真度，避免为了去重把爆点、句式和长度感洗掉。</div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="compose-chip compose-chip-emerald">稳定 {stableComparisonCount}</span>
                  <span className="compose-chip compose-chip-amber">复核 {reviewComparisonCount}</span>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                {comparisons.map((item) => (
                  <div key={item.id} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-white">{item.title}</div>
                        <span className="compose-chip compose-chip-slate">{displayGroupLabel(item.slotKey)}</span>
                        <span className={classNames("compose-chip", item.verdict === "stable" ? "compose-chip-emerald" : "compose-chip-amber")}>
                          {item.verdict === "stable" ? "保真稳定" : "建议复核"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">原文 {item.beforeLength} 字 → 去重后 {item.afterLength} 字</div>
                    </div>
                    <div className="mt-2 text-xs leading-6 text-slate-400">{item.note}</div>
                    <div className="mt-3 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-2xl border border-rose-300/15 bg-rose-300/8 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-medium text-rose-100">原文案</div>
                          <button type="button" onClick={() => handleCopy(item.before, "原文案已复制。")} className="compose-copy-btn">复制</button>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">{item.before}</div>
                      </div>
                      <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/8 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-medium text-emerald-100">去重后</div>
                          <button type="button" onClick={() => handleCopy(item.after, "去重后文案已复制。")} className="compose-copy-btn">复制</button>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">{item.after}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="compose-panel p-5 sm:p-6 xl:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-white">当前组合稿</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">每个片段都标清了所在部分，也都能单独复制、重配、手动插入和去重。</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleDedupe(selectedIds)}
              disabled={busyAction === "dedupe" || !selectedIds.length}
              className="compose-toolbar-btn disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyAction === "dedupe" ? "正在去重中..." : `去重已选 ${selectedIds.length}`.trim()}
            </button>
            {LARGE_GROUPS.map((group) => {
              const groupIds = blocks
                .filter((block) => blockBelongsToLargeGroup(String(block.slotKey), group.slots))
                .map((block) => block.id);
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => handleDedupe(groupIds)}
                  disabled={busyAction === "dedupe" || !groupIds.length}
                  className="compose-copy-btn disabled:cursor-not-allowed disabled:opacity-50"
                >
                  去重{group.title}
                </button>
              );
            })}
          </div>
        </div>

        {blocks.length ? (
          <div className="mt-5 space-y-4">
            {blocks.map((block, index) => (
              <div key={block.id} id={`compose-block-${block.id}`} className="overflow-hidden rounded-[24px] border border-white/10 bg-slate-900/70">
                <div className="h-1.5 w-full bg-gradient-to-r from-cyan-400/35 via-cyan-300/10 to-transparent" />
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="compose-chip compose-chip-slate">片段 {String(index + 1).padStart(2, "0")}</span>
                        <span className="compose-chip compose-chip-cyan">{displaySlotLabel(String(block.slotKey), block.title)}</span>
                        <span className="compose-chip compose-chip-slate">{block.title}</span>
                        {block.isManual ? <span className="compose-chip compose-chip-amber">手动插入</span> : null}
                      </div>
                      <div className="text-xs leading-6 text-slate-400">当前约 {block.content.trim().length} 字</div>
                      {block.bridgeText ? <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/8 px-3 py-2 text-xs leading-6 text-cyan-100/80">系统补桥：{block.bridgeText}</div> : null}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => handleCopy(block.content, "片段文案已复制。")}
                        className="compose-copy-btn"
                      >
                        复制这一段
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSelected(block.id)}
                        className={classNames(
                          "compose-toolbar-btn",
                          selectedIds.includes(block.id) && "border-cyan-300/35 bg-cyan-400/14 text-cyan-50",
                        )}
                      >
                        {selectedIds.includes(block.id) ? "已选去重" : "选中去重"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRematch(block.id)}
                        disabled={busyAction !== null}
                        className="compose-toolbar-btn disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyAction === "rematch" && busyBlockId === block.id ? "正在匹配..." : "重新匹配"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setInsertAfterId(insertAfterId === block.id ? null : block.id);
                          setInsertType("H");
                          setInsertContent(defaultInsertContent("H"));
                        }}
                        className="compose-toolbar-btn"
                      >
                        {insertAfterId === block.id ? "收起插入" : "手动插入"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = removeComposeBlock(blocks, block.id);
                          applyBlocks(next);
                          setMessage({ tone: "info", text: "当前板块已删除。" });
                        }}
                        className="compose-toolbar-btn border-rose-300/20 bg-rose-300/10 text-rose-100 hover:bg-rose-300/20"
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={block.content}
                    onChange={(event) => {
                      const next = blocks.map((item) => (item.id === block.id ? { ...item, content: event.target.value } : item));
                      applyBlocks(next);
                    }}
                    rows={Math.max(4, Math.min(12, Math.ceil(block.content.length / 40)))}
                    className="compose-block-textarea mt-4"
                  />

                  {insertAfterId === block.id ? (
                    <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-4">
                      <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
                        <select
                          value={insertType}
                          onChange={(event) => {
                            const nextType = event.target.value as ComposeSectionType;
                            setInsertType(nextType);
                            setInsertContent(defaultInsertContent(nextType));
                          }}
                          className="compose-block-textarea min-h-[52px] appearance-none"
                        >
                          {INSERT_TYPES.map((item) => (
                            <option key={item} value={item}>
                              {SECTION_TITLE_MAP[item]}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={insertContent}
                          onChange={(event) => setInsertContent(event.target.value)}
                          rows={3}
                          placeholder="输入你要手动插入的板块内容"
                          className="compose-block-textarea min-h-[120px]"
                        />
                        <button
                          type="button"
                          onClick={handleInsert}
                          className="brand-btn self-end"
                        >
                          插入到这里后面
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-5 py-12 text-center text-sm leading-7 text-slate-400">
            先给主题或开头，再点“开始组合”，这里就会生成完整的板块草稿。
          </div>
        )}
      </div>
    </section>
  );
}









