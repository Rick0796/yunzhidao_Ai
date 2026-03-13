import { useMemo, useState } from "react";
import type { ApiSettings } from "../types";
import type { ScriptSectionItem } from "../lib/scriptLibrary";
import { fetchScriptSections } from "../lib/scriptLibrary";
import {
  buildComposeDiagnostics,
  buildComposeReview,
  composeDraftFromSections,
  composeFullText,
  finalizeComposeBlocks,
  dedupeComposeBlocks,
  inferPrimaryDirection,
  insertManualComposeBlock,
  applyComposeSuggestion,
  rematchComposeBlock,
  removeComposeBlock,
  updateComposeBlock,
  type ComposeBlock,
  type ComposeSectionType
} from "../lib/composer";

const DIRECTION_OPTIONS = ["AI趋势", "财富", "认知"] as const;
const INSERT_SECTION_OPTIONS: ComposeSectionType[] = ["A", "B", "C", "D", "F", "G", "H", "I", "J", "K", "L"];
const LARGE_GROUPS = [
  { key: "opening", label: "开场大板块", slots: ["A", "B1", "C1", "D", "B2", "C2"] },
  { key: "middle", label: "中段大板块", slots: ["F", "G", "H", "I", "J"] },
  { key: "closing", label: "承接收口大板块", slots: ["K", "L"] }
] as const;

type MessageTone = "error" | "success" | "info" | "warning";
type BusyAction = "assemble" | "random-a" | "rematch" | "dedupe" | null;

interface NoticeState {
  tone: MessageTone;
  text: string;
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function getMessageToneClass(tone: MessageTone) {
  if (tone === "error") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  if (tone === "success") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "warning") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  return "border-cyan-400/25 bg-cyan-400/10 text-cyan-100";
}

function hasMeaningfulChange(before: ComposeBlock[], after: ComposeBlock[], targetId?: string) {
  if (before.length !== after.length) return true;
  if (!targetId) {
    return before.some((block, index) => block.content !== after[index]?.content || block.materialId !== after[index]?.materialId);
  }
  const left = before.find((block) => block.id === targetId);
  const right = after.find((block) => block.id === targetId);
  if (!left || !right) return before !== after;
  return left.content !== right.content || left.materialId !== right.materialId || left.originalId !== right.originalId;
}

export default function ComposeWorkbench({ settings }: { settings: ApiSettings }) {
  const [theme, setTheme] = useState("");
  const [customHook, setCustomHook] = useState("");
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

  const resolvedTheme = (theme.trim() || customHook.trim()).trim();
  const directionSuggestion = useMemo(() => inferPrimaryDirection(resolvedTheme), [resolvedTheme]);
  const fullText = useMemo(() => composeFullText(blocks), [blocks]);
  const review = useMemo(
    () =>
      blocks.length
        ? buildComposeReview({
            theme: resolvedTheme,
            blocks,
            sections,
            primaryDirection
          })
        : null,
    [blocks, sections, resolvedTheme, primaryDirection]
  );

  function applyBlocks(nextBlocks: ComposeBlock[], nextTheme = resolvedTheme) {
    const finalizedBlocks = finalizeComposeBlocks(nextTheme, nextBlocks);
    setBlocks(finalizedBlocks);
    setDiagnostics(buildComposeDiagnostics(nextTheme, finalizedBlocks));
  }

  async function loadSections(direction = primaryDirection) {
    const response = await fetchScriptSections(settings.baseUrl || "/api", {
      primaryDirection: direction,
      limit: 800
    });
    setSections(response.items);
    return response.items;
  }

  async function handleAssemble() {
    const nextTheme = resolvedTheme;
    if (!nextTheme) {
      setMessage({ tone: "error", text: "先输入主题，或者先给一个自定义爆点。" });
      return;
    }

    setBusyAction("assemble");
    setBusyBlockId(null);
    setMessage({ tone: "info", text: "正在自动匹配 A B1 C1 D B2 C2 F G H I J K L..." });

    try {
      const library = await loadSections(primaryDirection);
      const draft = composeDraftFromSections({
        theme: nextTheme,
        primaryDirection,
        customHook,
        sections: library
      });

      setSelectedBlockIds([]);
      applyBlocks(draft.blocks, draft.theme);
      setMessage({
        tone: "success",
        text: "初版已经组出来了。接下来你可以逐块重配、插入、删除，最后再按块去重。"
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "自动组装失败" });
    } finally {
      setBusyAction(null);
      setBusyBlockId(null);
    }
  }

  async function handleRandomA() {
    setBusyAction("random-a");
    setBusyBlockId(null);
    setMessage({ tone: "info", text: "正在随机抽取 A 爆皮..." });

    try {
      const library = sections.length ? sections : await loadSections(primaryDirection);
      const aPool = library.filter((item) => item.type === "A" && item.content.trim());
      if (!aPool.length) {
        setMessage({ tone: "warning", text: "当前方向还没有可用的 A 爆皮素材。" });
        return;
      }

      const pick = aPool[Math.floor(Math.random() * aPool.length)];
      setCustomHook(pick.content.trim());
      if (!theme.trim()) {
        setTheme(pick.theme || pick.content.trim().slice(0, 24));
      }
      setMessage({ tone: "success", text: "已随机抽到一个 A 爆皮，你可以直接继续自动组装。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "随机抽取 A 失败" });
    } finally {
      setBusyAction(null);
      setBusyBlockId(null);
    }
  }

  async function handleRematch(blockId: string) {
    if (!resolvedTheme) {
      setMessage({ tone: "error", text: "先给主题或爆点，再重配当前板块。" });
      return;
    }

    setBusyAction("rematch");
    setBusyBlockId(blockId);
    setMessage({ tone: "info", text: "正在重新匹配当前板块..." });

    try {
      const library = sections.length ? sections : await loadSections(primaryDirection);
      const nextBlocks = rematchComposeBlock({
        blocks,
        targetId: blockId,
        sections: library,
        theme: resolvedTheme,
        primaryDirection
      });

      if (!hasMeaningfulChange(blocks, nextBlocks, blockId)) {
        setMessage({ tone: "warning", text: "当前没有更合适的可替换素材，可以手动插入或先改主题范围。" });
        return;
      }

      applyBlocks(nextBlocks);
      setMessage({ tone: "success", text: "当前板块已完成重配。" });
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
    setMessage({ tone: "success", text: `已在当前位置后插入一个 ${insertType} 板块。` });
  }

  function toggleBlockSelection(blockId: string) {
    setSelectedBlockIds((prev) => (prev.includes(blockId) ? prev.filter((item) => item !== blockId) : [...prev, blockId]));
  }

  function selectLargeGroup(groupKey: (typeof LARGE_GROUPS)[number]["key"]) {
    const group = LARGE_GROUPS.find((item) => item.key === groupKey);
    if (!group) return;
    const slots = group.slots as readonly string[];
    const ids = blocks.filter((block) => slots.includes(String(block.slotKey))).map((block) => block.id);
    setSelectedBlockIds(ids);
  }

  async function handleDedupeSelected() {
    if (!selectedBlockIds.length) {
      setMessage({ tone: "warning", text: "先选中要去重的小板块或大板块。" });
      return;
    }

    setBusyAction("dedupe");
    setBusyBlockId(null);
    setMessage({ tone: "info", text: "正在去重中，请稍等..." });

    try {
      const nextBlocks = await dedupeComposeBlocks({
        settings,
        theme: resolvedTheme || primaryDirection,
        blocks,
        blockIds: selectedBlockIds
      });

      if (!hasMeaningfulChange(blocks, nextBlocks)) {
        setMessage({ tone: "warning", text: "当前选中板块暂时没有发生改写，可以先重配后再去重。" });
        return;
      }

      applyBlocks(nextBlocks);
      setMessage({ tone: "success", text: "选中板块已完成去重，建议再看一遍逻辑诊断。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "板块去重失败" });
    } finally {
      setBusyAction(null);
      setBusyBlockId(null);
    }
  }

  async function handleCopyFinalText() {
    if (!fullText.trim()) return;
    try {
      await navigator.clipboard.writeText(fullText);
      setMessage({ tone: "success", text: "完整文案已复制。" });
    } catch {
      setMessage({ tone: "error", text: "复制失败，请手动复制。" });
    }
  }

  function handleApplySuggestion(suggestionId: string) {
    if (!review) return;
    const suggestion = review.suggestions.find((item) => item.id === suggestionId);
    if (!suggestion) return;
    const nextBlocks = applyComposeSuggestion(blocks, suggestion);
    applyBlocks(nextBlocks);
    setMessage({ tone: "success", text: `${suggestion.title} 已采用，建议再看一遍逻辑体检。` });
  }

  function metricColor(level: "good" | "watch" | "risk") {
    if (level === "good") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
    if (level === "watch") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
    return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="glass-panel rounded-[28px] p-5 sm:p-6 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="section-eyebrow">文案组合</div>
            <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">A / B1 / C1 / D / B2 / C2 结构化组装</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              这里不改你原来的爆款仿写和热点原创，只新增一个“文案组合”工作台。系统会先按固定结构组出一版，再让你逐块重配、插入、删除和去重。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">当前方向：{primaryDirection}</span>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
              主题识别建议：{directionSuggestion}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <label className="field-label">主题</label>
            <textarea
              className="field-textarea min-h-[110px]"
              placeholder="例如：未来三年普通人最危险的资产 / AI 会不会先替代白领 / 数字资产为什么会成为硬通货"
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
            />
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <label className="field-label">自定义 A 爆皮</label>
            <textarea
              className="field-textarea min-h-[110px]"
              placeholder="如果你已经有一个很炸的开头，可以直接填在这里。系统会优先使用你的爆皮，再补足后面的支撑句。"
              value={customHook}
              onChange={(event) => setCustomHook(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {DIRECTION_OPTIONS.map((item) => (
              <button
                key={item}
                type="button"
                className={classNames("tab-chip", primaryDirection === item && "tab-chip-active")}
                onClick={() => setPrimaryDirection(item)}
              >
                {item}
              </button>
            ))}
            <button type="button" className="ghost-btn" onClick={() => setPrimaryDirection(directionSuggestion)}>
              按主题识别方向
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="ghost-btn" onClick={handleRandomA} disabled={busyAction !== null}>
              {busyAction === "random-a" ? "正在抽取中..." : "随机抽 A"}
            </button>
            <button type="button" className="brand-btn" onClick={handleAssemble} disabled={busyAction !== null}>
              {busyAction === "assemble" ? "正在组装中..." : "自动组装文案"}
            </button>
          </div>

          {message ? (
            <div className={classNames("rounded-2xl border px-4 py-3 text-sm", getMessageToneClass(message.tone))}>{message.text}</div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-6">
          <div className="glass-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="section-eyebrow">逻辑检查</div>
                <h2 className="mt-3 text-xl font-semibold text-white">自动诊断与替换建议</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {LARGE_GROUPS.map((group) => (
                  <button key={group.key} type="button" className="ghost-btn" onClick={() => selectLargeGroup(group.key)}>
                    选中{group.label}
                  </button>
                ))}
                <button type="button" className="ghost-btn" onClick={() => setSelectedBlockIds([])}>
                  清空去重选择
                </button>
                <button
                  type="button"
                  className="brand-btn"
                  onClick={handleDedupeSelected}
                  disabled={busyAction !== null || selectedBlockIds.length === 0}
                >
                  {busyAction === "dedupe" ? "正在去重中..." : "去重选中板块"}
                </button>
              </div>
            </div>

            {review ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">整稿逻辑评分</div>
                      <div className="mt-1 text-xs text-slate-400">系统会分别看开场链、中段推进、承接收口和素材分散度。</div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-cyan-100">{review.overallScore}</div>
                      <div className="text-xs text-slate-400">/ 100</div>
                    </div>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" style={{ width: `${review.overallScore}%` }} />
                  </div>
                </div>

                <div className="grid gap-3">
                  {review.metrics.map((metric) => (
                    <div key={metric.key} className={classNames("rounded-2xl border px-4 py-4", metricColor(metric.level))}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">{metric.title}</div>
                        <div className="text-lg font-bold text-white">{metric.score}</div>
                      </div>
                      <div className="mt-2 text-sm leading-6">{metric.summary}</div>
                      <div className="mt-2 text-xs leading-5 text-slate-200">{metric.detail}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">自动建议替换块</div>
                      <div className="mt-1 text-xs text-slate-400">系统会优先找当前最薄、最跳或最像复读的板块，给你一版更顺的候选。</div>
                    </div>
                    <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
                      {review.suggestions.length} 条建议
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {review.suggestions.length ? (
                      review.suggestions.map((suggestion) => (
                        <div key={suggestion.id} className="rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-white">{suggestion.title}</div>
                              <div className="mt-2 text-sm leading-6 text-slate-300">{suggestion.reason}</div>
                              <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-3 text-sm leading-6 text-cyan-100">
                                <span className="font-semibold text-cyan-50">建议候选：</span> {suggestion.preview}
                              </div>
                              <div className="mt-2 text-xs text-slate-500">
                                {suggestion.candidateMaterialId || "手动候选"} {suggestion.candidateOriginalId ? `· 来源 ${suggestion.candidateOriginalId}` : ""}
                              </div>
                            </div>
                            <button type="button" className="brand-btn" onClick={() => handleApplySuggestion(suggestion.id)}>
                              采用这条建议
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300">
                        当前这一版暂时没有明显更优的自动替换建议，说明这套结构已经比较稳了。你可以直接进入逐块去重。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-3">
              {diagnostics.length ? (
                diagnostics.map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className={classNames(
                      "rounded-2xl border px-4 py-4",
                      item.level === "warning" ? "border-amber-400/25 bg-amber-400/10" : "border-cyan-400/20 bg-cyan-400/10"
                    )}
                  >
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-200">{item.detail}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                  先生成一版组合稿，系统才会给出逻辑诊断。
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {blocks.length ? (
              blocks.map((block) => (
                <div
                  key={block.id}
                  className={classNames(
                    "glass-panel rounded-[24px] p-4 sm:p-5",
                    selectedBlockIds.includes(block.id) && "border-cyan-400/30 shadow-[0_0_30px_rgba(0,212,255,0.1)]"
                  )}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="section-eyebrow">{block.title}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{block.materialId || "手动块"}</span>
                        {block.originalId ? (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">来源 {block.originalId}</span>
                        ) : null}
                        {block.isManual ? (
                          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-amber-100">手动插入</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ghost-btn" onClick={() => toggleBlockSelection(block.id)}>
                        {selectedBlockIds.includes(block.id) ? "取消去重" : "选中去重"}
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => handleRematch(block.id)}
                        disabled={busyAction !== null}
                      >
                        {busyAction === "rematch" && busyBlockId === block.id ? "正在重配中..." : "重新匹配"}
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          setInsertAfterId(insertAfterId === block.id ? null : block.id);
                          setInsertType("H");
                          setInsertContent("");
                        }}
                      >
                        插入后段
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => handleRemoveBlock(block.id)}>
                        删除
                      </button>
                    </div>
                  </div>

                  {block.bridgeText ? (
                    <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                      <span className="font-semibold text-cyan-50">自动补桥：</span> {block.bridgeText}
                    </div>
                  ) : null}

                  <textarea
                    className="field-textarea mt-4 min-h-[150px]"
                    value={block.content}
                    onChange={(event) => handleBlockContentChange(block.id, event.target.value)}
                    placeholder={`这里是 ${block.title} 的内容，你可以直接修改。`}
                  />

                  {insertAfterId === block.id ? (
                    <div className="mt-4 rounded-[22px] border border-cyan-400/20 bg-cyan-400/10 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="text-sm font-semibold text-white">在当前板块后手动插入新板块</div>
                        <select
                          className="field-input mt-0 max-w-[220px]"
                          value={insertType}
                          onChange={(event) => setInsertType(event.target.value as ComposeSectionType)}
                        >
                          {INSERT_SECTION_OPTIONS.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        className="field-textarea mt-4 min-h-[120px]"
                        value={insertContent}
                        onChange={(event) => setInsertContent(event.target.value)}
                        placeholder="把你想插入的板块内容直接贴在这里。"
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" className="brand-btn" onClick={handleInsertManualBlock}>
                          确认插入
                        </button>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => {
                            setInsertAfterId(null);
                            setInsertContent("");
                          }}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="glass-panel rounded-[28px] px-5 py-10 text-sm leading-7 text-slate-300">
                先输入主题或爆点，再点“自动组装文案”。系统会先按固定结构组一版，再交给你逐块微调。
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-[28px] p-5 sm:p-6">
            <div className="section-eyebrow">完整文案</div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">组合结果预览</h2>
              <button type="button" className="ghost-btn" onClick={handleCopyFinalText} disabled={!fullText.trim()}>
                复制整篇
              </button>
            </div>
            <textarea
              className="field-textarea mt-5 min-h-[680px]"
              value={fullText}
              readOnly
              placeholder="组合完成后，这里会显示完整文案。"
            />
          </div>

          <div className="glass-panel rounded-[28px] p-5 sm:p-6">
            <div className="section-eyebrow">当前策略</div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300">
                这版优先保证你能“看到 H / K / L、能重配、能去重、能手动插入”，先把组合工作台跑稳定。中段如果还像资料堆，系统会直接在左侧给出诊断提示。
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300">
                当前规则：同一篇组合稿不会整条从同一篇原文抽完；B1/B2、C1/C2 会尽量拉开；如果某块暂时没更好的候选，按钮会明确提示你“没有更合适的可替换素材”。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
