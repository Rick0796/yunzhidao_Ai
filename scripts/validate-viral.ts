import { buildMockCtas, buildMockDrafts, buildMockHooks, buildMockMeat, buildMockSkeletons, defaultBaseProfile, splitSourceParagraphs } from "../src/lib/mock";
import { normalizeDraftResults } from "../src/lib/normalize";
import type { DraftItem, TaskForm } from "../src/types";

declare const process: { exit(code?: number): void };

type SampleCase = {
  name: string;
  requiredTokens: string[];
  task: TaskForm;
};

const sampleCases: SampleCase[] = [
  {
    name: "长文三点式",
    requiredTokens: ["2026年", "90%", "第一天", "第二天", "第三天", "第四天", "AI时代"],
    task: {
      entryType: "viral",
      entryTypeChosen: true,
      sourceText:
        "3月14日到3月17日，这四天或许会有一些特别的惊喜悄悄来到你家。我观察了许久，才决定把这句话说给你听。当然，如果你选择离开，我完全尊重，但请收下这份祝福。最近你可能会遇到两件好事，一是生活中冒出些温暖的小确幸，二是一个意想不到的惊喜，可能正悄悄向你靠近。接下这份好运，你接下来的路或许会越走越顺。对了，认识周老师，这段时间你觉得怎么样？如果觉得有收获，不妨点亮右边的小爱心，支持一下大数据，把你推送到这里，绝非偶然，你很可能就是那个一直在寻找机会的行动派。记得关注我下面的内容很重要，随时可能消失。今天我只说一个核心，2026年普通人翻身的最高效路径就是AI。最快的赚钱方法就是学会驾驭AI，别再把AI只当做聊天机器人了，未来会用AI工具和不会用的人，收入将是天壤之别。想象一下，如果未来三个月掌握AI就能帮你实现收入跃迁。你愿不愿意全身心投入去学习他？他会是你性价比最高的员工。24小时在线随叫随到，但问题是90%的人根本不知道如何正确向他下达指令，大多数人只把它当高级搜索引擎，甚至不知道该问什么，写了又删，删了又写，趁你还没划走，只要给这条视频点个小红心，留下AI时代，我就把这套能落地的AI系统直接分享给你。为了让普通人真正抓住这波AI浪潮，周老师特别开启了为期四天的AI财富实战训练营。我们不空谈道理，只教你能立刻上手的实战方法，第一天带你认清趋势，找准最适合普通人的AI赚钱赛道。第二天教你用AI批量生产内容获取流量，节省90%的时间。第三天手把手教你打造专属的AI智能助手，让他为你赚钱。第四天，教你将个人经验、声音形象全面数字化，沉淀为你的终身资产。四天课程体系完整，实战为主，简单易懂，哪怕是零基础，你也能轻松跟上。只要你学懂八成用处，六成就足以超越身边90%的人。听我一句劝，未来三年是AI彻底改写普通人命运的三年。你犹豫一天，就落后别人一天。AI的进化不会等你，财富的浪潮更不会。你现在看到的正是下一次财富分配的起点，风已经来了，你要么乘风起飞，要么被风甩在身后。现在就点击周老师的头像，发送私信，我要看直播，即可获取训练营的直播入口。周老师在直播间等你，让我们一起跟上时代，抓住这波AI财富。",
      userNote: "只做轻微去重，不要改核心意思。",
      hotspotAngle: "",
      topicGoal: "",
      storyConclusion: "",
      businessMode: "light",
      businessModeChosen: true,
      ctaMode: "keyword",
      ctaModeChosen: true
    }
  },
  {
    name: "连续判断句",
    requiredTokens: ["2026年", "普通人", "AI"],
    task: {
      entryType: "viral",
      entryTypeChosen: true,
      sourceText:
        "2026年，普通人要翻身，真正高效的路径只有一个，就是AI。别再把AI当成聊天机器人了。未来会用AI的人，和不会用AI的人，收入一定是天壤之别。你现在慢一步，后面就会慢一大截。",
      userNote: "轻改表达，别改爆点。",
      hotspotAngle: "",
      topicGoal: "",
      storyConclusion: "",
      businessMode: "none",
      businessModeChosen: true,
      ctaMode: "comment",
      ctaModeChosen: true
    }
  },
  {
    name: "结尾动作句",
    requiredTokens: ["小红心", "AI时代"],
    task: {
      entryType: "viral",
      entryTypeChosen: true,
      sourceText:
        "很多人都以为AI离自己很远，其实真正危险的，是你现在还把它当成热闹。再过一段时间，你就会发现，真正先被淘汰掉的，不是懒人，而是还在用老办法干活的人。趁现在还没划走，只要给这条视频点个小红心，留下AI时代，我就把这套能落地的AI系统直接分享给你。",
      userNote: "CTA 动作不能改。",
      hotspotAngle: "",
      topicGoal: "",
      storyConclusion: "",
      businessMode: "none",
      businessModeChosen: true,
      ctaMode: "keyword",
      ctaModeChosen: true
    }
  }
];

function cleanLength(text: string) {
  return text.replace(/\s+/g, "").length;
}

function splitParagraphs(text: string) {
  return text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

function countSentences(text: string) {
  return (text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? []).map((item) => item.trim()).filter(Boolean).length;
}

function stripBoundarySentence(paragraph: string, mode: "first" | "last") {
  const sentences = (paragraph.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? []).map((item) => item.trim()).filter(Boolean);
  if (!sentences.length) return "";
  return (mode === "first" ? sentences.slice(1) : sentences.slice(0, -1)).join("").replace(/\s+/g, "");
}

const CTA_MARKERS = ["\u8bc4\u8bba\u533a", "\u79c1\u4fe1", "\u5173\u6ce8", "\u4e3b\u9875", "\u76f4\u64ad", "\u5c0f\u7231\u5fc3", "\u70b9\u4e2a\u5c0f\u7ea2\u5fc3", "\u770b\u76f4\u64ad", "\u76f4\u64ad\u5165\u53e3", "\u7559\u4e0b"];

function looksLikeSourceCta(text: string) {
  return CTA_MARKERS.some((marker) => text.includes(marker));
}

function comparableSourceParagraph(paragraph: string, index: number, total: number) {
  if (total === 1) {
    const withoutHook = stripBoundarySentence(paragraph, "first");
    return looksLikeSourceCta(withoutHook) ? stripBoundarySentence(withoutHook, "last") : withoutHook;
  }
  if (index === 0) return stripBoundarySentence(paragraph, "first");
  if (index === total - 1) {
    return /评论区|私信|关注|主页|直播|小爱心|点个小红心|看直播|直播入口|留下/.test(paragraph)
      ? stripBoundarySentence(paragraph, "last")
      : paragraph.replace(/\s+/g, "");
  }
  return paragraph.replace(/\s+/g, "");
}

function comparableDraftParagraph(paragraph: string, index: number, total: number, ctaText: string) {
  if (total === 1) {
    let next = stripBoundarySentence(paragraph, "first");
    if (next.includes(ctaText.replace(/\s+/g, ""))) {
      next = stripBoundarySentence(next, "last");
    }
    return next;
  }
  if (index === 0) return stripBoundarySentence(paragraph, "first");
  if (index === total - 1) {
    return paragraph.includes(ctaText) ? stripBoundarySentence(paragraph, "last") : paragraph.replace(/\s+/g, "");
  }
  return paragraph.replace(/\s+/g, "");
}

function assertDraftSet(sample: SampleCase, drafts: DraftItem[], hookText: string, ctaText: string) {
  const sourceParagraphs = splitSourceParagraphs(sample.task.sourceText || sample.task.userNote || "");
  const sourceLength = cleanLength(sample.task.sourceText || sample.task.userNote || "");

  drafts.forEach((draft) => {
    const paragraphs = splitParagraphs(draft.script);
    const totalRatio = cleanLength(draft.script) / Math.max(1, sourceLength);

    if (paragraphs.length !== sourceParagraphs.length) {
      throw new Error(`${sample.name}: ${draft.versionName} 段落数不一致`);
    }

    if (totalRatio < 0.9 || totalRatio > 1.105) {
      throw new Error(`${sample.name}: ${draft.versionName} 总字数比例异常 ${totalRatio.toFixed(2)}`);
    }

    if (!paragraphs[0]?.startsWith(hookText)) {
      throw new Error(`${sample.name}: ${draft.versionName} 首段没有使用已选钩子`);
    }

    if (!paragraphs[paragraphs.length - 1]?.includes(ctaText)) {
      throw new Error(`${sample.name}: ${draft.versionName} 末段没有保留 CTA`);
    }

    const duplicateCount = new Set(paragraphs.map((item) => item.replace(/[，。！？!?、\s]/g, ""))).size;
    if (duplicateCount !== paragraphs.length) {
      throw new Error(`${sample.name}: ${draft.versionName} 出现重复段`);
    }

    paragraphs.forEach((paragraph, index) => {
      const sourceParagraph = sourceParagraphs[index] || "";
      const comparableDraft = comparableDraftParagraph(paragraph, index, paragraphs.length, ctaText);
      const comparableSource = comparableSourceParagraph(sourceParagraph, index, sourceParagraphs.length);
      const ratio = cleanLength(comparableDraft || paragraph) / Math.max(1, cleanLength(comparableSource || sourceParagraph));
      const sentenceDelta = Math.abs(countSentences(comparableDraft || paragraph) - countSentences(comparableSource || sourceParagraph));
      if (ratio < 0.8 || ratio > 1.2) {
        throw new Error(`${sample.name}: ${draft.versionName} 第${index + 1}段字数比例异常 ${ratio.toFixed(2)}`);
      }
      if (sentenceDelta > 1) {
        throw new Error(`${sample.name}: ${draft.versionName} 第${index + 1}段句数偏差过大`);
      }
      if (!paragraph || paragraph.length < 8) {
        throw new Error(`${sample.name}: ${draft.versionName} 第${index + 1}段疑似空段或残句`);
      }
    });

    sample.requiredTokens.forEach((token) => {
      if (!draft.script.includes(token)) {
        throw new Error(`${sample.name}: ${draft.versionName} 丢失关键 token ${token}`);
      }
    });
  });

  const uniqueScripts = new Set(drafts.map((draft) => draft.script)).size;
  if (uniqueScripts < 2) {
    throw new Error(`${sample.name}: 5 个版本完全一样或几乎一样`);
  }
}

let failed = false;

for (const sample of sampleCases) {
  const hook = buildMockHooks(sample.task)[0];
  const skeleton = buildMockSkeletons(sample.task)[0];
  const meat = sample.task.businessMode === "none" ? null : buildMockMeat(sample.task, defaultBaseProfile)[0] ?? null;
  const cta = buildMockCtas(sample.task, defaultBaseProfile)[0];
  const fallbackDrafts = buildMockDrafts(sample.task, defaultBaseProfile, hook, skeleton, meat, cta);
  const normalized = normalizeDraftResults(fallbackDrafts, { task: sample.task, profile: defaultBaseProfile, hook, skeleton, meat, cta });

  console.log(`\n=== ${sample.name} ===`);
  console.log(`hook: ${hook.text}`);
  console.log(`cta: ${cta.text}`);
  console.log(`fallback used: ${normalized.usedFallbackCount}`);

  try {
    assertDraftSet(sample, normalized.items, hook.text, cta.text);
  } catch (error) {
    failed = true;
    console.error(String(error));
  }

  const weakItems = fallbackDrafts.map((draft) => ({
    ...draft,
    script: `${hook.text}\n\n一句很短的摘要。\n\n${cta.text}`,
    subtitleScript: `${hook.text}\n一句很短的摘要。\n${cta.text}`
  }));
  const weakNormalized = normalizeDraftResults(weakItems, { task: sample.task, profile: defaultBaseProfile, hook, skeleton, meat, cta });
  if (weakNormalized.usedFallbackCount === 0) {
    failed = true;
    console.error(`${sample.name}: 弱稿没有触发保真兜底`);
  }
}

if (failed) {
  console.error("\nViral rewrite validation failed.");
  process.exit(1);
}

console.log("\nAll viral rewrite validation cases passed.");
