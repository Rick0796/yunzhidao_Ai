import type { BaseProfile, CtaItem, DraftItem, HookItem, MeatItem, SkeletonItem, TaskForm } from "../types";
import { getHookFirstClause, hasHardHookStart, hasSoftHookLead, isAlarmStyleHook, isStrongQuestionHook, getHookLeadScore } from "./hookEngine";
import { buildMockCtas, buildMockDrafts, buildMockHooks, buildMockMeat, buildMockSkeletons, splitSourceParagraphs } from "./mock";
import { normalizeSkeletonStep } from "./skeletons";
import { analyzeTaskStrategy } from "./taskStrategy";

const AI_NOISE_PATTERNS = [
  /^当然可以/,
  /^下面给你/,
  /^以下是/,
  /^根据你的要求/,
  /^脚本如下/,
  /^字幕如下/,
  /^版本\d+/i,
  /^标准版/,
  /^激进版/,
  /^判决版/,
  /^口语版/,
  /^老板版/,
  /^\(.*\)$/,
  /^（.*）$/,
  /^#+\s*/,
  /^[-*]\s*(钩子|骨架|肉|收口|正文|字幕)/
];

const DRAFT_META_PATTERNS = [
  /^(钩子|骨架|收口|标题|正文|字幕|脚本|创作说明|版本)[：:]/,
  /^(第一段|第二段|第三段|第四段|第五段)[：:]/,
  /^(步骤|结构|逻辑|说明)[：:]/,
  /(镜头|旁白|画面|时长|配图|字幕提示)/,
  /(请看|如下|以下|输出|生成|文案分析)/,
  /(任务理解|切入角度|补充素材|这条视频想说什么)/,
  /^(从.+切入，落到.+)/,
  /^(讲透|分析|拆解|总结).{0,20}(这件事|老板|平台|趋势)/
];

const DRAFT_FILLER_PATTERNS = [
  /(?:\u70b9\u8d5e|\u6536\u85cf|\u8f6c\u53d1)/,
  /(?:\u770b\u5b8c|\u63a5\u4e0b\u6765|\u8fd9\u6761\u89c6\u9891)/,
  /(?:\u5c0f\u7231\u5fc3|\u611f\u5174\u8da3|\u7559\u8a00)/,
  /(?:\u8bb0\u5f97|\u5148\u522b|\u8d76\u7d27)/,
  /(?:\u8be6\u7ec6\u5206\u6790|\u5f7b\u5e95\u7ed9\u4f60)/
];

const FACT_PACKAGE_LABEL_PATTERNS = [
  /^[^????\n]{1,18}[:?]\s*/,
  /^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?[:?]?\s*/,
  /^(?:\u5f53\u524d|\u76ee\u524d|\u73b0\u5728|\u6700\u8fd1|\u5df2\u7ecf)[^????\n]{0,24}[:?]?\s*/,
  /^(?:\u5bf9\u7ecf\u8425\u8005\u6765\u8bf4|\u5982\u679c\u4ece\u7ecf\u8425\u8005\u89c6\u89d2)[^????\n]{0,30}[:?]?\s*/,
  /^$/,
  /^$/,
  /^$/,
  /^$/,
  /^$/,
  /^$/,
  /^$/,
  /^$/,
  /^$/,
  /^$/,
  /^$/,
  /^$/
];

const URL_NOISE_PATTERN = /(https?:\/\/\S+|www\.\S+|\/\/\S+)/gi;
const INLINE_REF_PATTERN = /\[\d+\]/g;

const SKELETON_BANNED_STEP_PATTERNS = /(钩子|爆点|开头|收口|互动|CTA|结尾|标题|导流)/i;
const DRAFT_SOFT_PATTERNS = [/说到底/, /真正拉开差距/, /很多老板其实/, /你可以现在还没/, /先别急着划走/];
const HOTSPOT_HARD_BRIDGE_PATTERNS = /(数字IP|数字资产|AI获客|私域|自动化|内容增长|流量增长|企业增长|老板增长|数字人)/;
const HOTSPOT_NATIVE_BUSINESS_PATTERNS = /(AI|人工智能|AI获客|数字IP|数字资产|获客|流量|私域|自动化|内容增长|平台变化|企业增长|老板增长|数字人)/;
const HOOK_OVERREACH_PATTERNS = /(时代已经彻底结束|再不.+就晚了|唯一.+(资产|确定性)|成本逻辑要彻底重构|绝对没生意|一定倒闭)/;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldReplaceEnglishLabel(value: string) {
  return /[A-Za-z]/.test(value) && !/[\u4e00-\u9fa5]/.test(value);
}

export function stripAiNoise(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !AI_NOISE_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripStructureTags(text: string) {
  return text.replace(/【[^】]+】/g, "").trim();
}

function isDraftMetaLine(line: string) {
  return DRAFT_META_PATTERNS.some((pattern) => pattern.test(line.trim()));
}

function splitIntoSentences(text: string) {
  return (text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSentenceKey(text: string) {
  return text.replace(/[\u201c\u201d"'`]/g, "").replace(/[\uFF0C\u3002\uFF01\uFF1F!?\uFF1B;\u3001\s]/g, "").trim();
}

function stripFactPackageLabel(text: string) {
  let next = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of FACT_PACKAGE_LABEL_PATTERNS) {
      const replaced = next.replace(pattern, "").trim();
      if (replaced !== next) {
        next = replaced;
        changed = true;
      }
    }
  }
  return next;
}

function collapseRepeatedFragments(text: string) {
  let next = text.trim();
  let previous = "";

  while (previous !== next) {
    previous = next;
    next = next
      .replace(/([\u4e00-\u9fa5A-Za-z]{2,10})\1+/g, "$1")
      .replace(/(\u8282\u76ee\u4e2d)((?:\u300a[^\u300b]{1,24}\u300b)?)\u8282\u76ee\u4e2d/g, "$1$2")
      .replace(/(\u81ea\u5df1\u7684)\u81ea\u5df1\u7684/g, "$1")
      .replace(/([\uFF0C\u3002\uFF01\uFF1F\uFF1B\u3001])\1+/g, "$1");
  }

  return next.trim();
}

function cleanGeneratedSentence(text: string) {
  let next = text.trim();
  if (!next) return "";

  next = next.replace(URL_NOISE_PATTERN, "").replace(INLINE_REF_PATTERN, "");
  next = stripFactPackageLabel(next);
  next = collapseRepeatedFragments(next);
  next = next.replace(/\s+/g, "");
  next = next.replace(/^[\uFF1A:????]+/, "").replace(/[\uFF1A:???]+$/g, "");
  next = next.replace(/^(?:\u53e6\u5916|\u6b64\u5916|\u8fd8\u6709\u4e00\u70b9|\u518d\u8bf4\u56de\u6765)[??]/, "");
  next = next.trim();

  return next;
}

function looksLikeSearchNoiseSentence(text: string) {
  const raw = text.trim();
  const next = cleanGeneratedSentence(raw);
  const key = normalizeSentenceKey(next);

  if (!key) return true;
  if (/(https?:\/\/|www\.|\/\/)/i.test(raw)) return true;
  if (/^[^????\n]{1,12}[:?]/.test(raw)) return true;
  if (/^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?[:?]/.test(raw)) return true;
  if (/^(?:\u5f53\u524d|\u76ee\u524d|\u73b0\u5728|\u6700\u8fd1|\u5df2\u7ecf|\u8fd9\u6761|\u5b83\u7ee7\u7eed|\u5bf9\u7ecf\u8425\u8005|\u5982\u679c\u4ece\u7ecf\u8425\u8005\u89c6\u89d2)/.test(raw)) {
    return true;
  }

  return false;
}

function looksLikeQuestionPromptSentence(text: string) {
  const next = cleanGeneratedSentence(text);
  if (!next) return false;
  if (/[\uFF1F?]/.test(text)) return true;
  return next.length <= 30 && /^(?:\u5982\u4f55|\u4e3a\u4ec0\u4e48|\u4ec0\u4e48\u662f|\u600e\u4e48|AI\u4f1a\u4e0d\u4f1a|AI\u4f1a\u66ff\u4ee3|\u4f7f\u7528AI|\u54ea\u4e9b\u98ce\u9669|\u5230\u5e95\u4f1a\u4e0d\u4f1a|\u5230\u5e95\u80fd\u4e0d\u80fd)/.test(next);
}

function isHookOrCtaEcho(text: string, hook: HookItem, cta: CtaItem) {
  const key = normalizeSentenceKey(cleanGeneratedSentence(text));
  const hookKey = normalizeSentenceKey(cleanGeneratedSentence(hook.text));
  const ctaKey = normalizeSentenceKey(cleanGeneratedSentence(cta.text));
  if (!key) return false;
  if (hookKey && (key === hookKey || (key.length >= 10 && hookKey.includes(key)))) return true;
  if (ctaKey && (key === ctaKey || (key.length >= 10 && ctaKey.includes(key)))) return true;
  return false;
}

function longestCommonPrefix(left: string, right: string) {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return left.slice(0, index);
}

function splitLongSentence(sentence: string) {
  const trimmed = cleanGeneratedSentence(sentence);
  if (trimmed.length <= 34) {
    return [trimmed];
  }

  const ending = trimmed.match(/[\u3002\uFF01\uFF1F!?]$/)?.[0] ?? "";
  const core = trimmed.replace(/[\u3002\uFF01\uFF1F!?]$/, "");
  const parts = core
    .split(/[\uFF0C\u3001\uFF1B]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return [trimmed];
  }

  const compressed = parts.reduce<string[]>((result, part) => {
    const previous = result[result.length - 1];
    if (!previous) {
      result.push(part);
      return result;
    }

    const previousKey = normalizeSentenceKey(previous);
    const currentKey = normalizeSentenceKey(part);
    const prefix = longestCommonPrefix(previousKey, currentKey);

    if (prefix.length >= 8) {
      if (currentKey.length >= previousKey.length) {
        result[result.length - 1] = part;
      }
      return result;
    }

    result.push(part);
    return result;
  }, []);

  return compressed.map((part, index) => (index === compressed.length - 1 ? `${part}${ending || "?"}` : `${part}?`));
}

function looksLikeCtaSentence(text: string) {
  return /(评论区|留言|留个|留下|打个|想学|想要|看主页|主页|关键词|点赞|收藏|转发|关注)/.test(text);
}

function looksLikeFillerSentence(text: string) {
  return DRAFT_FILLER_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeDanglingFragment(text: string) {
  const next = cleanGeneratedSentence(text);
  if (!next) return false;
  if (next.length <= 10) return true;
  if (/^(?:从|到|而是|包括|经营|以及|比如|尤其是|甚至|再到|像是|可持续的|新的|真正的|这种|这个)/.test(next) && next.length <= 18) {
    return true;
  }
  if (!/[是会能要让把用做跑讲拆看]/.test(next) && next.length <= 14) {
    return true;
  }
  return false;
}

function isNearDuplicateSentence(left: string, right: string) {
  const leftKey = normalizeSentenceKey(left);
  const rightKey = normalizeSentenceKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  return Math.min(leftKey.length, rightKey.length) >= 10 && (leftKey.includes(rightKey) || rightKey.includes(leftKey));
}

function mergeBrokenSentences(sentences: string[]) {
  const merged: string[] = [];
  let pending = "";

  for (const raw of sentences) {
    let sentence = cleanGeneratedSentence(raw);
    if (!sentence) continue;

    if (pending) {
      sentence = `${pending.replace(/[\uFF0C\u3002\uFF01\uFF1F!?\uFF1B:]+$/g, "")}${sentence}`;
      pending = "";
    }

    if (looksLikeFillerSentence(sentence) || looksLikeCtaSentence(sentence)) {
      continue;
    }

    const sentenceKey = normalizeSentenceKey(sentence);
    if (!sentenceKey) continue;

    if (/^(?:\u800c\u662f|\u4f46\u662f|\u7136\u540e|\u6240\u4ee5|\u5e76\u4e14|\u7ed3\u679c|\u95ee\u9898\u662f|\u751a\u81f3|\u56e0\u4e3a)/.test(sentence) && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1].replace(/[\u3002\uFF01\uFF1F!?]$/g, "\uFF0C")}${sentence}`;
      continue;
    }

    if ((sentenceKey.length <= 4 || looksLikeDanglingFragment(sentence)) && merged.length > 0) {
      pending = sentence;
      continue;
    }

    merged.push(collapseRepeatedFragments(sentence));
  }

  if (pending && merged.length > 0) {
    merged[merged.length - 1] = collapseRepeatedFragments(`${merged[merged.length - 1].replace(/[\u3002\uFF01\uFF1F!?]$/g, "\uFF0C")}${pending}`);
  }

  return merged.map((item) => collapseRepeatedFragments(item));
}

function dedupeSentences(sentences: string[]) {
  const next: string[] = [];
  for (const sentence of sentences) {
    if (next.some((existing) => isNearDuplicateSentence(existing, sentence))) {
      continue;
    }
    next.push(sentence);
  }
  return next;
}

function dedupeParagraphs(paragraphs: string[]) {
  const next: string[] = [];
  for (const paragraph of paragraphs) {
    const cleaned = collapseRepeatedFragments(cleanGeneratedSentence(paragraph));
    const key = normalizeSentenceKey(cleaned);
    if (!key) continue;
    if (next.some((existing) => isNearDuplicateSentence(existing, cleaned))) {
      continue;
    }
    next.push(cleaned);
  }
  return next;
}

function toSentence(text: string) {
  const next = cleanGeneratedSentence(text).replace(/[，；;]+$/g, "").trim();
  if (!next) return "";
  return /[。！？!?]$/.test(next) ? next : `${next}。`;
}

function buildHotspotFactPool(task: TaskForm, hook: HookItem) {
  const hookLead = normalizeSentenceKey(getHookFirstClause(hook.text));
  return dedupeSentences(
    mergeBrokenSentences(
      splitIntoSentences(stripAiNoise(stripStructureTags(task.sourceText || "")))
        .map((item) => cleanGeneratedSentence(item))
        .filter((item) => item && !looksLikeSearchNoiseSentence(item) && !looksLikeQuestionPromptSentence(item))
        .filter((item) => {
          const key = normalizeSentenceKey(item);
          if (!key) return false;
          if (hookLead && (key === hookLead || key.includes(hookLead))) return false;
          return item.length >= 10;
        })
    )
  );
}

function buildHotspotRepairDraft(task: TaskForm, hook: HookItem, meat: MeatItem | null, cta: CtaItem) {
  const strategy = analyzeTaskStrategy(task);
  const facts = buildHotspotFactPool(task, hook);
  const eventFact = facts[0] || cleanGeneratedSentence(task.sourceText || "");
  const secondFact = facts[1] || "";
  const thirdFact = facts[2] || "";

  const eventParagraph = [eventFact, secondFact]
    .map((item) => toSentence(item))
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  const bridgeParagraph =
    strategy.hotspotType === "risk_regulation"
      ? "这说明，AI已经不是能不能碰的问题，而是该怎么用、边界在哪的问题。"
      : strategy.hotspotType === "platform_change"
        ? "这说明，真正变化的不是热度，而是平台入口、分发规则和获客动作。"
        : strategy.hotspotType === "external_shock"
          ? "这说明，真正该警惕的不是热闹，而是外部变量已经开始直接改写经营成本和客户决策。"
          : "这说明，真正的变化已经从热闹，走到了具体经营动作。";

  const riskParagraph =
    strategy.hotspotType === "risk_regulation"
      ? "很多老板现在一提AI，先想到的是省人、提效、降成本。但这次释放的信号很明确：算法不能没有边界，效率也不能牺牲公平。只盯效率、不看规则，后面踩的就不是小坑，而是经营红线。"
      : strategy.hotspotType === "platform_change"
        ? "很多老板还在沿着老入口做动作，问题不是不努力，而是入口一换，原来的获客链路会先失效。你如果不跟着规则和分发逻辑一起改，后面流量再多也接不住。"
        : strategy.hotspotType === "external_shock"
          ? "很多老板看到这种新闻只会觉得离自己很远，但外部变量一旦开打，先传导到的就是成本、预期、订单和现金流。真正危险的，是你还在拿旧办法硬扛新波动。"
          : "很多老板看到热点只会跟着感叹，但真正拉开差距的，是谁能把事件背后的变化拆成自己的经营动作。";

  const mappingCore = cleanGeneratedSentence(task.hotspotAngle || "");
  const mappingParagraph = [mappingCore, meat?.serviceText || meat?.bridgeText || meat?.text || thirdFact]
    .map((item) => toSentence(item))
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  const paragraphs = [
    hook.text,
    eventParagraph,
    bridgeParagraph,
    riskParagraph,
    mappingParagraph,
    cta.text
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  return paragraphs.join("\n\n");
}

function stripLeadingMetaLabel(line: string, skeleton?: SkeletonItem) {
  let next = stripStructureTags(line).trim();
  const labels = [
    ...(skeleton?.steps.map((step) => step.name) ?? []),
    "钩子",
    "开头",
    "正文",
    "字幕",
    "脚本",
    "文案",
    "第一句",
    "第二句",
    "第三句",
    "第四句",
    "收口",
    "结尾",
    "CTA"
  ];

  let changed = true;
  while (changed) {
    changed = false;
    next = next.replace(/^(第[一二三四五六七八九十\d]+段|段落\d+|步骤[一二三四五六七八九十\d]+)[：:\s-]*/i, "").trim();

    for (const label of labels) {
      const pattern = new RegExp(`^${escapeRegExp(label)}[：:\\s-]*`, "i");
      if (pattern.test(next)) {
        next = next.replace(pattern, "").trim();
        changed = true;
      }
    }
  }

  return next;
}

function buildBodyParagraphs(text: string, skeleton: SkeletonItem, desiredCount: number) {
  const sentencePool = dedupeSentences(
    mergeBrokenSentences(
      splitIntoSentences(text)
        .flatMap((sentence) => splitLongSentence(stripLeadingMetaLabel(sentence, skeleton)))
        .map((item) => cleanGeneratedSentence(item))
        .filter((item) => item && !isDraftMetaLine(item) && !looksLikeSearchNoiseSentence(item) && !looksLikeQuestionPromptSentence(item))
    )
  );

  if (sentencePool.length === 0) {
    return [];
  }

  const targetCount = Math.max(2, Math.min(desiredCount, sentencePool.length));
  const chunkSize = Math.max(1, Math.ceil(sentencePool.length / targetCount));
  const groups = Array.from({ length: targetCount }, (_, index) => sentencePool.slice(index * chunkSize, (index + 1) * chunkSize));

  return dedupeParagraphs(groups.map((group) => group.join("").trim()).filter(Boolean));
}

function normalizeDraftScriptContent(script: string, skeleton: SkeletonItem, hook: HookItem, cta: CtaItem, desiredCount: number) {
  const stripped = stripStructureTags(stripAiNoise(script || ""))
    .split(/\n+/)
    .flatMap((line) => splitIntoSentences(line))
    .map((line) => cleanGeneratedSentence(stripLeadingMetaLabel(line, skeleton)))
    .filter((line) => line && !isDraftMetaLine(line) && !looksLikeSearchNoiseSentence(line) && !looksLikeQuestionPromptSentence(line))
    .filter((line) => !isHookOrCtaEcho(line, hook, cta))
    .join("\n");

  const bodyParagraphs = buildBodyParagraphs(stripped, skeleton, desiredCount);
  const scriptText = [hook.text, ...bodyParagraphs, cta.text]
    .map((part) => collapseRepeatedFragments(part.trim()))
    .filter(Boolean)
    .join("\n\n");

  return {
    bodyParagraphs,
    script: scriptText
  };
}

export function toPlainScript(script: string) {
  const mergedLines = dedupeSentences(
    mergeBrokenSentences(
      stripAiNoise(stripStructureTags(script))
        .split(/\n+/)
        .flatMap((item) => splitIntoSentences(item))
        .map((item) => cleanGeneratedSentence(item))
        .filter((item) => item && !looksLikeSearchNoiseSentence(item))
    )
  );

  return dedupeParagraphs(mergedLines).join("\n\n");
}

export function toDigitalHumanScript(script: string) {
  return toPlainScript(script)
    .replace(/([\u3002\uFF01\uFF1F])/g, "$1\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function hasMetaInstruction(text: string) {
  return DRAFT_META_PATTERNS.some((pattern) => pattern.test(text));
}

function hasLowVariety(text: string) {
  const sentences = splitIntoSentences(text).map((item) => item.replace(/[，。！？!?、\s]/g, ""));
  if (sentences.length < 3) {
    return false;
  }
  return new Set(sentences).size / sentences.length < 0.72;
}

function hasBrokenParagraphShape(paragraphs: string[]) {
  return paragraphs.some((paragraph) => {
    const plain = cleanGeneratedSentence(paragraph);
    if (!plain) return false;
    const punctuationCount = (plain.match(/[，。！？!?；;]/g) || []).length;
    if (plain.length > 22 && punctuationCount === 0) return true;
    if (plain.length > 42 && punctuationCount <= 1) return true;
    return false;
  });
}

function isWeakDraft(text: string, bodyParagraphs: string[], task?: TaskForm) {
  const plain = toPlainScript(text);
  const bodyText = bodyParagraphs.join("");
  const sourceText = task?.sourceText || task?.userNote || "";
  const sourcePlain = sourceText ? toPlainScript(sourceText) : "";
  const sourceParagraphCount = task?.entryType === "viral" ? splitSourceParagraphs(sourceText).length : 0;
  const lengthRatio = sourcePlain ? plain.length / Math.max(1, sourcePlain.length) : 1;

  return (
    bodyParagraphs.length < 3 ||
    bodyText.length < 60 ||
    hasBrokenParagraphShape(bodyParagraphs) ||
    DRAFT_SOFT_PATTERNS.some((pattern) => pattern.test(plain)) ||
    hasMetaInstruction(plain) ||
    hasLowVariety(plain) ||
    (task?.entryType === "viral" && (lengthRatio < 0.8 || lengthRatio > 1.2 || Math.abs(bodyParagraphs.length - sourceParagraphCount) > 1))
  );
}

export function formatSkeletonPreview(name: string, steps: string[]) {
  return steps.length ? `${name} · ${steps.join(" → ")}` : name;
}

function polishHookText(text: string) {
  return text
    .replace(/单日巨震(\d+%)/g, "24小时暴跌$1")
    .replace(/单日大跌(\d+%)/g, "24小时暴跌$1")
    .replace(/一天跌掉(\d+%)/g, "24小时暴跌$1")
    .replace(/闪崩/g, "高位暴跌")
    .replace(/高位高位暴跌/g, "高位暴跌")
    .replace(/([。！？])\1+/g, "$1")
    .trim();
}

function sourceHasNativeBusinessAnchor(task: TaskForm) {
  const source = task.entryType === "topic" ? `${task.topicGoal || ""} ${task.sourceText || ""}` : task.sourceText || "";
  return HOTSPOT_NATIVE_BUSINESS_PATTERNS.test(source);
}

function isHardBridgeHook(text: string, task: TaskForm) {
  return task.entryType === "hotspot" && !sourceHasNativeBusinessAnchor(task) && HOTSPOT_HARD_BRIDGE_PATTERNS.test(text);
}

function getHookQualityScore(text: string, task: TaskForm) {
  const firstClause = getHookFirstClause(text);
  let score = getHookLeadScore(text);
  const sourceLead = normalizeSentenceKey(getHookFirstClause(task.sourceText || task.userNote || ""));

  if (isHardBridgeHook(text, task)) score -= 42;
  if (HOOK_OVERREACH_PATTERNS.test(text)) score -= 20;
  if (task.entryType === "hotspot" && /(24小时|刚刚|这两天|今天|暴跌|暴涨|被处理|换人|油价|国际油价)/.test(firstClause)) score += 8;
  if (task.entryType === "hotspot" && /逻辑|确定性|资产/.test(firstClause) && !/油价|AI|平台|腾讯|微信|抖音|小红书/.test(firstClause)) score -= 10;

  if (task.entryType === "viral" && sourceLead) {
    const currentLead = normalizeSentenceKey(firstClause);
    if (currentLead === sourceLead) score += 18;
    else if (currentLead && (currentLead.includes(sourceLead) || sourceLead.includes(currentLead))) score += 10;
    else score -= 14;
  }

  return score;
}

export function normalizeHookResults(items: HookItem[], task: TaskForm) {
  const fallback = buildMockHooks(task);
  const cleaned = items
    .map<HookItem | null>((item, index) => {
      const text = polishHookText(stripAiNoise(stripStructureTags(item.text)).replace(/[“”"']/g, "").trim());
      if (!text) {
        return null;
      }

      const fallbackItem = fallback[index % fallback.length];
      return {
        ...item,
        text,
        type: !item.type.trim() || shouldReplaceEnglishLabel(item.type) ? fallbackItem.type : item.type
      };
    })
    .filter((item): item is HookItem => item !== null);

  const usable = cleaned.filter((item) => !hasSoftHookLead(item.text) && getHookQualityScore(item.text, task) >= 20 && !isHardBridgeHook(item.text, task));
  const strong = usable.filter((item) => isAlarmStyleHook(item.text) || hasHardHookStart(item.text) || isStrongQuestionHook(item.text));
  const scored = [...cleaned]
    .filter((item) => !isHardBridgeHook(item.text, task))
    .sort((left, right) => getHookQualityScore(right.text, task) - getHookQualityScore(left.text, task))
    .filter((item, index, list) => list.findIndex((candidate) => candidate.text === item.text) === index);
  const merged = [...strong, ...usable, ...scored]
    .sort((left, right) => getHookQualityScore(right.text, task) - getHookQualityScore(left.text, task))
    .filter((item, index, list) => list.findIndex((candidate) => candidate.text === item.text) === index);

  const nextItems = [...merged];
  for (const candidate of fallback) {
    if (nextItems.length >= 3) break;
    if (!isHardBridgeHook(candidate.text, task) && !nextItems.some((item) => item.text === candidate.text)) {
      nextItems.push(candidate);
    }
  }

  return nextItems.length > 0 ? nextItems.slice(0, 3) : fallback.slice(0, 3);
}

export function normalizeSkeletonResults(items: SkeletonItem[], task: TaskForm) {
  const fallback = buildMockSkeletons(task);
  const maxSteps = task.entryType === "viral" ? 8 : 6;
  const minSteps = task.entryType === "viral" ? 4 : 4;

  const cleaned = items
    .map((item, index) => {
      const fallbackItem = fallback[index % fallback.length];
      const steps = (item.steps ?? [])
        .map((step, stepIndex) => {
          const name = stripLeadingMetaLabel(step.name || "", undefined).slice(0, 12);
          if (!name || shouldReplaceEnglishLabel(name) || SKELETON_BANNED_STEP_PATTERNS.test(name)) {
            return null;
          }

          return normalizeSkeletonStep(
            {
              ...step,
              name,
              purpose:
                stripAiNoise(step.purpose || "") ||
                fallbackItem.steps[Math.min(stepIndex, fallbackItem.steps.length - 1)]?.purpose ||
                "承接正文推进",
              targetWords: Number.isFinite(step.targetWords) ? Math.max(30, Math.min(120, step.targetWords)) : 55,
              segmentTask: stripAiNoise(step.segmentTask || ""),
              bridgeToNext: stripAiNoise(step.bridgeToNext || "")
            },
            fallbackItem.steps[Math.min(stepIndex, fallbackItem.steps.length - 1)]
          );
        })
        .filter((step): step is SkeletonItem["steps"][number] => Boolean(step))
        .slice(0, maxSteps);

      return {
        ...item,
        id: item.id || fallbackItem.id,
        name: stripLeadingMetaLabel(item.name || "", undefined).slice(0, 16) || fallbackItem.name,
        scenario: stripAiNoise(item.scenario || "") || fallbackItem.scenario,
        summary: stripAiNoise(item.summary || "") || fallbackItem.summary,
        steps: steps.length >= minSteps ? steps : fallbackItem.steps
      };
    })
    .filter((item, index, list) => {
      const signature = `${item.name}-${item.steps.map((step) => step.name).join("|")}`;
      return list.findIndex((candidate) => `${candidate.name}-${candidate.steps.map((step) => step.name).join("|")}` === signature) === index;
    });

  const nextItems =
    task.entryType === "viral"
      ? [fallback[0], ...cleaned].filter((item, index, list) => {
          const signature = `${item.name}-${item.steps.map((step) => step.name).join("|")}`;
          return list.findIndex((candidate) => `${candidate.name}-${candidate.steps.map((step) => step.name).join("|")}` === signature) === index;
        })
      : [...cleaned];
  for (const candidate of task.entryType === "viral" ? fallback.slice(1) : fallback) {
    if (nextItems.length >= 4) break;
    if (!nextItems.some((item) => item.name === candidate.name)) {
      nextItems.push(candidate);
    }
  }

  return nextItems.slice(0, 4);
}

export function normalizeMeatResults(items: MeatItem[], task: TaskForm, profile: BaseProfile) {
  const fallback = buildMockMeat(task, profile);
  if (task.businessMode === "none") {
    return [];
  }

  const cleaned = items
    .map<MeatItem | null>((item, index) => {
      const fallbackItem = fallback[index % fallback.length];
      const cleanedLines = splitIntoSentences(
        stripAiNoise(stripStructureTags(item.text || ""))
          .replace(/^(业务植入|轻肉|强肉)[：:]/, "")
          .trim()
      )
        .map((line) => cleanGeneratedSentence(line))
        .filter(Boolean);
      const bridgeText = cleanGeneratedSentence(stripAiNoise(stripStructureTags(item.bridgeText || ""))) || cleanedLines[0] || fallbackItem.bridgeText || "";
      const serviceText = cleanGeneratedSentence(stripAiNoise(stripStructureTags(item.serviceText || ""))) || cleanedLines[1] || fallbackItem.serviceText || "";
      const actionPrepText = cleanGeneratedSentence(stripAiNoise(stripStructureTags(item.actionPrepText || ""))) || cleanedLines[2] || fallbackItem.actionPrepText || "";
      const text = [bridgeText, serviceText, actionPrepText].filter(Boolean).join("\n");

      if (!text && !fallbackItem.text) {
        return null;
      }

      return {
        ...item,
        type: stripAiNoise(item.type || "") || fallbackItem.type,
        text: text || fallbackItem.text,
        bridgeText: bridgeText || fallbackItem.bridgeText || "",
        serviceText: serviceText || fallbackItem.serviceText || "",
        actionPrepText: actionPrepText || fallbackItem.actionPrepText || "",
        intensity: item.intensity || fallbackItem.intensity,
        smoothnessScore: Number.isFinite(item.smoothnessScore) ? Math.max(60, Math.min(98, item.smoothnessScore)) : fallbackItem.smoothnessScore
      };
    })
    .filter((item): item is MeatItem => item !== null)
    .filter((item) => !hasMetaInstruction(item.text))
    .slice(0, 4);

  return cleaned.length > 0 ? cleaned : fallback;
}

export function normalizeCtaResults(items: CtaItem[], task: TaskForm, profile: BaseProfile) {
  const fallback = buildMockCtas(task, profile);
  const cleaned = items
    .map((item, index) => {
      const fallbackItem = fallback[index % fallback.length];
      const text = stripAiNoise(stripStructureTags(item.text || "")).trim();

      if (!text || text.length > 42 || !/(评论区|留言|留个|留下|打)/.test(text)) {
        return null;
      }

      return {
        ...item,
        type: stripAiNoise(item.type || "") || fallbackItem.type,
        text,
        scenario: stripAiNoise(item.scenario || "") || fallbackItem.scenario
      };
    })
    .filter((item): item is CtaItem => Boolean(item))
    .filter((item, index, list) => list.findIndex((candidate) => candidate.text === item.text) === index);

  const nextItems = [...cleaned];
  for (const candidate of fallback) {
    if (nextItems.length >= 5) break;
    if (!nextItems.some((item) => item.text === candidate.text)) {
      nextItems.push(candidate);
    }
  }

  return nextItems.slice(0, 5);
}

export function normalizeDraftResults(
  items: DraftItem[],
  {
    task,
    profile,
    hook,
    skeleton,
    meat,
    cta
  }: {
    task: TaskForm;
    profile: BaseProfile;
    hook: HookItem;
    skeleton: SkeletonItem;
    meat: MeatItem | null;
    cta: CtaItem;
  }
) {
  const fallback = buildMockDrafts(task, profile, hook, skeleton, meat, cta);
  const desiredCount = task.entryType === "viral" ? Math.max(4, Math.min(skeleton.steps.length, 8)) : Math.max(4, Math.min(skeleton.steps.length + 1, 6));

  const normalizedFallback = fallback.map((item) => {
    const normalized = normalizeDraftScriptContent(item.script || "", skeleton, hook, cta, desiredCount);
    const nextScript = normalized.script || [hook.text, cta.text].join("\n\n");
    return {
      ...item,
      coverLine: hook.text,
      script: nextScript,
      subtitleScript: toDigitalHumanScript(nextScript),
      selectedHookId: hook.id,
      selectedSkeletonId: skeleton.id,
      selectedMeatId: meat?.id ?? null,
      selectedCtaId: cta.id
    };
  });

  const cleaned = items.map((item, index) => {
    const fallbackItem = normalizedFallback[index % normalizedFallback.length];
    const normalized = normalizeDraftScriptContent(item.script || "", skeleton, hook, cta, desiredCount);
    const bodyParagraphs = normalized.bodyParagraphs;
    const nextScript = normalized.script;

    if (isWeakDraft(nextScript, bodyParagraphs, task)) {
      if (task.entryType === "hotspot") {
        const repairedScript = buildHotspotRepairDraft(task, hook, meat, cta);
        return {
          ...fallbackItem,
          ...item,
          id: item.id || fallbackItem.id,
          versionName: item.versionName || fallbackItem.versionName,
          title: stripAiNoise(item.title || "") || fallbackItem.title,
          coverLine: hook.text,
          script: repairedScript,
          subtitleScript: toDigitalHumanScript(repairedScript),
          selectedHookId: hook.id,
          selectedSkeletonId: skeleton.id,
          selectedMeatId: meat?.id ?? null,
          selectedCtaId: cta.id,
          platformFit: item.platformFit || fallbackItem.platformFit
        };
      }
      return fallbackItem;
    }

    return {
      ...fallbackItem,
      ...item,
      id: item.id || fallbackItem.id,
      versionName: item.versionName || fallbackItem.versionName,
      title: stripAiNoise(item.title || "") || fallbackItem.title,
      coverLine: hook.text,
      script: nextScript,
      subtitleScript: toDigitalHumanScript(nextScript),
      selectedHookId: hook.id,
      selectedSkeletonId: skeleton.id,
      selectedMeatId: meat?.id ?? null,
      selectedCtaId: cta.id,
      platformFit: item.platformFit || fallbackItem.platformFit
    };
  });

  const merged = [...cleaned];
  for (const candidate of normalizedFallback) {
    if (merged.length >= 5) break;
    if (!merged.some((item) => item.versionName === candidate.versionName)) {
      merged.push(candidate);
    }
  }

  return merged.slice(0, 5);
}
