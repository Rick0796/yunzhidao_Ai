import { useMemo, useState } from "react";
import type { ApiSettings } from "../types";
import type { ScriptSectionItem } from "../lib/scriptLibrary";
import { fetchScriptSections } from "../lib/scriptLibrary";
import {
  buildComposeDiagnostics,
  composeDraftFromSections,
  composeFullText,
  dedupeComposeBlocks,
  inferPrimaryDirection,
  insertManualComposeBlock,
  rematchComposeBlock,
  removeComposeBlock,
  updateComposeBlock,
  type ComposeBlock,
  type ComposeSectionType
} from "../lib/composer";

const DIRECTION_OPTIONS = ["AI趋势", "财富", "认知"] as const;
const INSERT_SECTION_OPTIONS: ComposeSectionType[] = ["A", "B", "C", "D", "F", "G", "H", "I", "J", "K", "L"];
const LARGE_GROUPS = [
  { key: "opening", label: "开场组", slots: ["A", "B1", "C1", "D", "B2", "C2"] },
  { key: "middle", label: "中段组", slots: ["F", "G", "H", "I", "J"] },
  { key: "close", label: "收口组", slots: ["K", "L"] }
] as const;

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function getMessageToneClass(tone: "error" | "success" | "info") {
  if (tone === "error") {
    return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  }
  if (tone === "success") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  }
  return "border-cyan-400/25 bg-cyan-400/10 text-cyan-100";
}

export default function ComposeWorkbench({ settings }: { settings: ApiSettings }) {
  const [theme, setTheme] = useState("");
  const [customHook, setCustomHook] = useState("");
  const [primaryDirection, setPrimaryDirection] = useState<string>("AI趋势");
  const [sections, setSections] = useState<ScriptSectionItem[]>([]);
  const [blocks, setBlocks] = useState<ComposeBlock[]>([]);
  const [diagnostics, setDiagnostics] = useState<Array<{ level: "info" | "warning"; title: string; detail: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const [insertType, setInsertType] = useState<ComposeSectionType>("H");
  const [insertContent, setInsertContent] = useState("");

  const resolvedTheme = (theme.trim() || customHook.trim()).trim();
  const directionSuggestion = useMemo(() => inferPrimaryDirection(resolvedTheme), [resolvedTheme]);
  const fullText = useMemo(() => composeFullText(blocks), [blocks]);

  function applyBlocks(nextBlocks: ComposeBlock[], nextTheme = resolvedTheme) {
    setBlocks(nextBlocks);
    setDiagnostics(buildComposeDiagnostics(nextTheme, nextBlocks));
  }

  async function loadSections(direction = primaryDirection) {
    const response = await fetchScriptSections(settings.baseUrl || "/api", {
      primaryDirection: direction,
      limit: 500
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

    setLoading(true);
    setMessage({ tone: "info", text: "正在匹配板块并检查中段承接..." });
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
      setMessage({ tone: "success", text: "文案组合初稿已生成，可以逐块替换、插入或去重。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "文案组合生成失败" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRandomA() {
    setLoading(true);
    setMessage({ tone: "info", text: "正在抽取可用的 A 爆皮..." });
    try {
      const library = sections.length > 0 ? sections : await loadSections(primaryDirection);
      const aPool = library.filter((item) => item.type === "A" && item.content.trim());
      if (!aPool.length) {
        setMessage({ tone: "error", text: "当前方向还没有可用的 A 爆皮素材。" });
        return;
      }
      const pick = aPool[Math.floor(Math.random() * aPool.length)];
      setCustomHook(pick.content.trim());
      if (!theme.trim()) {
        setTheme(pick.theme || pick.content.trim().slice(0, 24));
      }
      setMessage({ tone: "success", text: "已随机抽取一条 A 爆皮，你可以直接继续自动组装。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "随机抽取 A 失败" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRematch(blockId: string) {
    if (!resolvedTheme) return;
    setLoading(true);
    setMessage({ tone: "info", text: "正在重新匹配当前板块..." });
    try {
      const library = sections.length > 0 ? sections : await loadSections(primaryDirection);
      const nextBlocks = rematchComposeBlock({
        blocks,
        targetId: blockId,
        sections: library,
        theme: resolvedTheme,
        primaryDirection
      });
      applyBlocks(nextBlocks);
      setMessage({ tone: "success", text: "当前板块已重新匹配。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "重新匹配失败" });
    } finally {
      setLoading(false);
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
  }

  function handleInsertManualBlock() {
    if (!insertAfterId || !insertContent.trim()) return;
    const nextBlocks = insertManualComposeBlock(blocks, insertAfterId, insertType, insertContent);
    applyBlocks(nextBlocks);
    setInsertAfterId(null);
    setInsertContent("");
    setMessage({ tone: "success", text: `已在当前位置后插入 ${insertType} 板块。` });
  }

  function toggleBlockSelection(blockId: string) {
    setSelectedBlockIds((prev) => (prev.includes(blockId) ? prev.filter((item) => item !== blockId) : [...prev, blockId]));
  }

  function selectLargeGroup(groupKey: (typeof LARGE_GROUPS)[number]["key"]) {
    const group = LARGE_GROUPS.find((item) => item.key === groupKey);
    if (!group) return;
    const groupSlots = group.slots as readonly string[];
    const ids = blocks.filter((block) => groupSlots.includes(String(block.slotKey))).map((block) => block.id);
    setSelectedBlockIds((prev) => Array.from(new Set([...prev, ...ids])));
  }

  async function handleDedupeSelected() {
    if (!selectedBlockIds.length) {
      setMessage({ tone: "error", text: "先选中需要去重的小板块或大板块。" });
      return;
    }
    setLoading(true);
    setMessage({ tone: "info", text: "正在按所选板块调用 Gemini 进行去重..." });
    try {
      const nextBlocks = await dedupeComposeBlocks({
        settings,
        theme: resolvedTheme || primaryDirection,
        blocks,
        blockIds: selectedBlockIds
      });
      applyBlocks(nextBlocks);
      setMessage({ tone: "success", text: "选中板块已完成去重，建议再看一遍逻辑诊断。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "板块去重失败" });
    } finally {
      setLoading(false);
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="glass-panel rounded-[28px] p-5 sm:p-6 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="section-eyebrow">文案组合</div>
            <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">A-B-C-D 结构化组合工作台</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              这里不走原来的爆款仿写和热点原创逻辑。我们直接按素材库做小板块组合，先自动匹配，再逐块替换、插入、诊断和去重，重点把中段说服链拼顺。
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
            <label className="field-label">自定义爆点 / A 爆皮</label>
            <textarea
              className="field-textarea min-h-[110px]"
              placeholder="如果你已经有一句很爆的开头，可以直接填在这里。系统会优先用你的开头，再往后补壳。"
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
            <button type="button" className="ghost-btn" onClick={handleRandomA} disabled={loading}>
              随机抽 A 爆皮
            </button>
            <button type="button" className="brand-btn" onClick={handleAssemble} disabled={loading}>
              {loading ? "正在组装..." : "自动组装文案"}
            </button>
          </div>

          {message ? <div className={classNames("rounded-2xl border px-4 py-3 text-sm", getMessageToneClass(message.tone))}>{message.text}</div> : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-6">
          <div className="glass-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="section-eyebrow">逻辑检查</div>
                <h2 className="mt-3 text-xl font-semibold text-white">自动诊断</h2>
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
                <button type="button" className="brand-btn" onClick={handleDedupeSelected} disabled={loading || selectedBlockIds.length === 0}>
                  去重选中板块
                </button>
              </div>
            </div>

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
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                          {block.materialId || "手动块"}
                        </span>
                        {block.originalId ? (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">来源 {block.originalId}</span>
                        ) : null}
                        {block.isManual ? <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-amber-100">手动插入</span> : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ghost-btn" onClick={() => toggleBlockSelection(block.id)}>
                        {selectedBlockIds.includes(block.id) ? "取消去重" : "选中去重"}
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => handleRematch(block.id)} disabled={loading}>
                        重新匹配
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

                  <textarea
                    className="field-textarea mt-4 min-h-[150px]"
                    value={block.content}
                    onChange={(event) => handleBlockContentChange(block.id, event.target.value)}
                    placeholder={`这里是 ${block.title} 的内容，你可以直接改。`}
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
                先输入主题或自定义爆点，再点击“自动组装文案”。系统会先按 A B1 C1 D B2 C2 F G H I J K L 这条链组一版，再让你逐块调整。
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
                这版先优先保证结构可控和中段诊断可见，不让 F/G/H/I/J 随便堆成资料串。真正的中段优化、按大板块改写和更强的逻辑补桥，我们下一步可以继续精修。
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300">
                当前规则：同一篇组合稿不会整条从同一原文抽完；B1/B2、C1/C2 都是独立小板块；你可以逐块替换和插入，不需要重开整篇。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
