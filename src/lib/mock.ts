import {
  ApiSettings,
  BaseProfile,
  BridgeStrength,
  BusinessMode,
  CtaItem,
  CtaMode,
  DecomposeResult,
  DraftItem,
  EntryType,
  HistoryItem,
  HookItem,
  MeatItem,
  RiskLevel,
  ScoreCard,
  SkeletonItem,
  SourceStructureItem,
  TaskForm,
  TemplateItem
} from "../types";
import { getHookLeadScore } from "./hookEngine";
import { createSkeletonStep, normalizeSkeletonStep } from "./skeletons";
import { analyzeTaskStrategy } from "./taskStrategy";

const typeLabelMap: Record<EntryType, string> = {
  viral: "仿写爆款",
  hotspot: "蹭热点",
  topic: "主题创作",
  boss_story: "我的故事"
};

const ctaLabelMap: Record<CtaMode, string> = {
  none: "纯评论流量",
  comment: "评论666互动",
  keyword: "评论关键词领资料",
  profile: "评论+主页承接",
  lead: "评论后资料承接"
};

const businessLabelMap: Record<BusinessMode, string> = {
  none: "不挂业务",
  light: "顺带提一下",
  strong: "明确挂业务"
};

export const defaultApiSettings: ApiSettings = {
  useLiveApi: true,
  baseUrl: "/api",
  apiKey: "",
  mainModel: "gemini-3-flash",
  batchModel: "gemini-3-flash",
  polishModel: "gemini-3-flash",
  requestTimeoutMs: 45000
};

export const defaultBaseProfile: BaseProfile = {
  selfIntro:
    "我帮助老板、创业者、企业操盘手，用 AI 把内容增长、流量增长、获客增长系统化跑起来。",
  targetAudience:
    "老板、创业者、企业操盘手、实体老板、想通过 AI 做内容获客的人",
  coreKeywords: "AI获客, 内容增长, 数字资产, 私域沉淀, 企业增长"
};

export const defaultTask: TaskForm = {
  entryType: "viral",
  entryTypeChosen: false,
  sourceText:
    "就在大家都在准备回家过年过节的时候，世界正在发生巨大变化。微信和支付宝躺赢的时代结束了，国家接连扔出两个王炸，海南封关、数字人民币交易飙升，这都在释放一个信号：物理世界的边界正在打破，数字时代强势来临。",
  userNote: "",
  hotspotAngle: "从普通人资产焦虑切入，落到数字资产和 AI 获客",
  topicGoal: "用趋势认知的方式讲透数字资产为什么重要",
  storyConclusion: "老板之所以能穿越周期，不是运气好，而是更早把内容和流量变成自己的资产。",
  businessMode: "light",
  businessModeChosen: false,
  ctaMode: "keyword",
  ctaModeChosen: false
};

const hookTypeByEntry: Record<EntryType, string> = {
  viral: "预警型",
  hotspot: "热点借势型",
  topic: "反常识型",
  boss_story: "故事反转型"
};

const skeletonByEntry: Record<EntryType, string> = {
  viral: "趋势认知骨架",
  hotspot: "热点映射骨架",
  topic: "观点拆解骨架",
  boss_story: "老板故事骨架"
};

const emotionByEntry: Record<EntryType, string> = {
  viral: "紧迫感 + 机会感",
  hotspot: "冲突感 + 代入感",
  topic: "判断感 + 认知提升",
  boss_story: "真实感 + 反转感"
};

const skeletonLibrary: SkeletonItem[] = [
  {
    id: "sk-judge",
    name: "判决推进骨架",
    scenario: "强判断 / 痛点 / 老板 / AI获客 / 争议观点",
    summary: "适合先把结论钉死，再一层层讲代价、原因、新认知和动作落点。",
    steps: [
      createSkeletonStep({ name: "现实切口", purpose: "把观众已经感受到的现实先接住", targetWords: 65 }),
      createSkeletonStep({ name: "代价放大", purpose: "把继续拖着不动的后果讲透", targetWords: 75 }),
      createSkeletonStep({ name: "原因拆开", purpose: "解释为什么会变成这样", targetWords: 75 }),
      createSkeletonStep({ name: "新认知桥", purpose: "把观众从旧理解带到新理解", targetWords: 65 }),
      createSkeletonStep({ name: "动作落点", purpose: "把判断压到具体方向或动作上", targetWords: 55, allowMeat: true })
    ]
  },
  {
    id: "sk-suspense",
    name: "悬念兑现骨架",
    scenario: "问句 / 三点式 / 清单式 / 金句延展",
    summary: "适合先吊住问题，再逐层兑现答案，最后把最关键的点压出来。",
    steps: [
      createSkeletonStep({ name: "悬念承接", purpose: "把开头抛出的问题继续吊住", targetWords: 55 }),
      createSkeletonStep({ name: "第一层兑现", purpose: "先给第一刀，让观众确认这条有内容", targetWords: 70 }),
      createSkeletonStep({ name: "第二层兑现", purpose: "继续补第二刀，拉高完播欲望", targetWords: 70 }),
      createSkeletonStep({ name: "关键答案", purpose: "把真正最重要的一点压出来", targetWords: 80 }),
      createSkeletonStep({ name: "结果落点", purpose: "把答案落回现实处境或动作上", targetWords: 55, allowMeat: true })
    ]
  },
  {
    id: "sk-mapping",
    name: "热点映射骨架",
    scenario: "热点 / 新闻 / 平台动作 / 外部变化",
    summary: "适合先讲事件冲击，再映射现实、升级风险、过桥到新认知，最后再给解法。",
    steps: [
      createSkeletonStep({ name: "事件冲击", purpose: "把热点里最能打人的事实先提出来", targetWords: 55 }),
      createSkeletonStep({ name: "现实映射", purpose: "把热点和老板、用户、普通人的现实连接起来", targetWords: 70 }),
      createSkeletonStep({ name: "风险升级", purpose: "把不调整会付出的代价讲清楚", targetWords: 70 }),
      createSkeletonStep({ name: "新认知桥", purpose: "把话题从热闹过桥到真正值钱的东西", targetWords: 65 }),
      createSkeletonStep({ name: "解法落点", purpose: "再顺势带出方法、方向或服务", targetWords: 55, allowMeat: true })
    ]
  },
  {
    id: "sk-risk",
    name: "风险监管骨架",
    scenario: "两会回应 / AI风险 / 合规监管 / 公共议题 / 行业边界",
    summary: "先接住公共讨论里的具体问题，再升级到经营边界和老板困局，最后轻落到可执行动作。",
    steps: [
      createSkeletonStep({
        name: "热点承接",
        purpose: "先把节目、讨论或议题里的具体问题接住",
        targetWords: 70,
        role: "event",
        segmentTask: "优先复述节目或公共讨论里明确出现的问题，不要先讲业务。",
        minSentences: 2,
        mustInclude: ["具体议题", "讨论对象"],
        forbidden: ["提前卖服务", "空讲趋势", "改写成已落地政策"],
        bridgeToNext: "事实接住后，再讲为什么这件事不只是热闹。",
        allowMeat: false,
        requireSource: true
      }),
      createSkeletonStep({
        name: "风险升级",
        purpose: "把这类问题为什么重要讲清楚",
        targetWords: 75,
        role: "risk",
        segmentTask: "从替代、边界、监管或行业影响里挑最核心的风险往上推。",
        minSentences: 2,
        mustInclude: ["风险点", "后果"],
        forbidden: ["直接卖方案", "跳过事实", "过度夸大"],
        bridgeToNext: "风险成立后，再映射到经营者真正要担心什么。",
        allowMeat: false,
        requireSource: true
      }),
      createSkeletonStep({
        name: "经营映射",
        purpose: "把公共议题翻译成老板能听懂的经营问题",
        targetWords: 75,
        role: "mapping",
        segmentTask: "把公共讨论映射到经营边界、工具使用和内容动作，不要直接卖AI获客。",
        minSentences: 2,
        mustInclude: ["经营视角", "现实处境"],
        forbidden: ["硬拐产品", "空讲概念", "跳过代入"],
        bridgeToNext: "先让老板代入，再把新认知讲出来。",
        allowMeat: false,
        requireSource: false
      }),
      createSkeletonStep({
        name: "边界重塑",
        purpose: "把AI从工具话题，推到规则和经营边界上",
        targetWords: 70,
        role: "bridge",
        segmentTask: "重塑关键认知：不是会不会用AI，而是能不能在边界内稳定用AI。",
        minSentences: 2,
        mustInclude: ["新认知", "边界意识"],
        forbidden: ["直接等于产品", "术语堆砌", "提前收口"],
        bridgeToNext: "认知立住后，再轻轻落到动作和方案。",
        allowMeat: false,
        requireSource: false
      }),
      createSkeletonStep({
        name: "解法轻落",
        purpose: "只在后半段轻落一层动作或方案",
        targetWords: 60,
        role: "solution",
        segmentTask: "如果要挂业务，只能轻落到合规、稳定、可持续的AI内容/经营动作，不要重卖。",
        minSentences: 2,
        mustInclude: ["动作线索", "结果方向"],
        forbidden: ["连续硬卖", "数字分身硬拐", "把业务写成主命题"],
        bridgeToNext: "动作给出后，再用结果感压实。",
        allowMeat: true,
        requireSource: false
      }),
      createSkeletonStep({
        name: "结果压实",
        purpose: "把前面的判断落到老板能带走的结果感上",
        targetWords: 55,
        role: "proof",
        segmentTask: "用经营结果、避坑结果或行动结果压实，不再开新话题。",
        minSentences: 2,
        mustInclude: ["结果感", "判断压实"],
        forbidden: ["再开新话题", "过度夸张", "回到卖点堆砌"],
        bridgeToNext: "最后只留一个动作给收口。",
        allowMeat: true,
        requireSource: false
      })
    ]
  },
  {
    id: "sk-wealth",
    name: "财富演化骨架",
    scenario: "趋势认知 / 数字资产 / 平台变迁 / AI增长",
    summary: "先讲资源如何更替，再切旧逻辑与新逻辑，重塑关键概念，代入老板困局，最后再让解法自然出现。",
    steps: [
      createSkeletonStep({
        name: "财富阶段展开",
        purpose: "把资源更替讲出递进感，不能只列时代标签",
        targetWords: 95,
        role: "mapping",
        segmentTask: "把农业、工业、互联网、数字时代的资源变化讲成递进，而不是名词罗列。",
        minSentences: 3,
        mustInclude: ["阶段变化", "资源更替", "递进关系"],
        forbidden: ["只列标签", "提前卖服务", "跳过逻辑"],
        bridgeToNext: "阶段讲完后，要转到今天到底是靠什么赚钱。",
        allowMeat: false,
        requireSource: true
      }),
      createSkeletonStep({
        name: "变现逻辑易位",
        purpose: "明确过去靠什么，现在靠什么",
        targetWords: 85,
        role: "reason",
        segmentTask: "把旧资源失效、新资源接管说清楚，让观众知道规则已经变了。",
        minSentences: 2,
        mustInclude: ["旧逻辑", "新逻辑"],
        forbidden: ["空喊趋势", "只讲概念", "提前卖服务"],
        bridgeToNext: "逻辑换完后，再重新定义真正值钱的资产。",
        allowMeat: false,
        requireSource: true
      }),
      createSkeletonStep({
        name: "资产概念重塑",
        purpose: "先定义普通人真正的数字资产是什么",
        targetWords: 85,
        role: "bridge",
        segmentTask: "先把关键概念讲透，再让观众明白它不是空词。",
        minSentences: 2,
        mustInclude: ["新定义", "认知转折"],
        forbidden: ["直接等于产品", "术语堆砌", "跳过过桥"],
        bridgeToNext: "概念讲清后，要让老板代入自己的现实处境。",
        allowMeat: false,
        requireSource: false
      }),
      createSkeletonStep({
        name: "经营困局剖析",
        purpose: "让老板觉得这就是自己现在的卡点",
        targetWords: 80,
        role: "identity",
        segmentTask: "把不会拍、不会写、不会承接、工具太旧这类真实困局摊开。",
        minSentences: 2,
        mustInclude: ["老板困局", "真实卡点"],
        forbidden: ["直接卖方案", "只讲自己", "空喊焦虑"],
        bridgeToNext: "困局成立后，解法才能自然出现。",
        allowMeat: false,
        requireSource: false
      }),
      createSkeletonStep({
        name: "AI解法桥",
        purpose: "在完成代入后再自然带出系统化解法",
        targetWords: 75,
        role: "solution",
        segmentTask: "把AI、系统、数字员工这类解法作为新工具出现，而不是广告插入。",
        minSentences: 2,
        mustInclude: ["方法线索", "结果方向"],
        forbidden: ["连续硬卖", "脱离困局", "一上来讲服务"],
        bridgeToNext: "解法出现后，要用现实结果把它压实。",
        allowMeat: true,
        requireSource: false
      }),
      createSkeletonStep({
        name: "结果压实",
        purpose: "把前面的判断落到老板能带走的结果感上",
        targetWords: 60,
        role: "proof",
        segmentTask: "用现实结果或经营结果把整条逻辑压实，再准备收束。",
        minSentences: 2,
        mustInclude: ["现实结果", "判断压实"],
        forbidden: ["再开新话题", "空口号", "过度重复"],
        bridgeToNext: "最后只留一个动作给收口。",
        allowMeat: true,
        requireSource: false
      })
    ]
  },
  {
    id: "sk-story",
    name: "故事反转骨架",
    scenario: "老板经历 / 人设 / 冲突反转",
    summary: "适合用真实经历把冲突、代价、转向、反转和认知压实。",
    steps: [
      createSkeletonStep({ name: "冲突引爆", purpose: "先把最拧巴、最危险的那一下摊开", targetWords: 75 }),
      createSkeletonStep({ name: "代价展开", purpose: "把事情严重到什么程度讲具体", targetWords: 75 }),
      createSkeletonStep({ name: "一念转向", purpose: "交代你为什么没按常规出牌", targetWords: 65 }),
      createSkeletonStep({ name: "结果反转", purpose: "讲清后来发生了什么变化", targetWords: 75 }),
      createSkeletonStep({ name: "认知压实", purpose: "把故事压成一句能带走的判断", targetWords: 55, allowMeat: true })
    ]
  },
  {
    id: "sk-quote",
    name: "金句递进骨架",
    scenario: "修心 / 人设 / 认知短视频 / 金句型",
    summary: "适合短视频金句内容，先下判断，再解释、对照、回收，不空喊。",
    steps: [
      createSkeletonStep({ name: "判断打底", purpose: "先把这条金句真正的判断讲清楚", targetWords: 45 }),
      createSkeletonStep({ name: "原因展开", purpose: "补上这句话为什么成立", targetWords: 65 }),
      createSkeletonStep({ name: "对照后果", purpose: "把做得到和做不到的差别拉开", targetWords: 65 }),
      createSkeletonStep({ name: "收束落点", purpose: "最后压成一句能记住的话", targetWords: 45, allowMeat: true })
    ]
  }
];

function getSkeletonById(id: string) {
  return skeletonLibrary.find((item) => item.id === id) ?? skeletonLibrary[0];
}

function isListStyleTask(task: TaskForm) {
  const text = getRelevantTaskText(task);
  return /(第一|第二|第三|第四|第[一二三四五六七八九十]个|第[一二三四五六七八九十]样|三样|三件|四大|五个|六条|几个|忠告|秘诀|方法|步骤)/.test(
    text
  );
}

function isShortQuoteTask(task: TaskForm) {
  const text = getRelevantTaskText(task);
  const theme = inferHookTheme(task);
  if (theme === "spiritual") return true;
  if (task.businessMode !== "none") return false;
  if (theme !== "generic") return false;
  return text.length <= 120 && !isListStyleTask(task) && task.entryType === "topic";
}

function isNarrativeTask(task: TaskForm) {
  if (task.entryType === "boss_story") return true;
  const text = getRelevantTaskText(task);
  return /(后来|结果|当时|那一刻|报警|放过|赚回|转给他|我们合作|我决定|反过来)/.test(text);
}

function isWealthEvolutionTask(task: TaskForm) {
  const text = getRelevantTaskText(task);
  return /(农业时代|工业时代|互联网时代|数字时代|财富洗牌|第四次变革|数字资产|数字人民币|资源更替|微信和支付宝|马斯克)/.test(text);
}

function inferProgressionSkeletonIds(task: TaskForm) {
  const theme = inferHookTheme(task);
  const wealthTask = isWealthEvolutionTask(task) || theme === "asset";
  const strategy = analyzeTaskStrategy(task);

  if (task.entryType === "hotspot") {
    if (strategy.hotspotType === "risk_regulation") {
      return ["sk-risk", "sk-mapping", "sk-judge"];
    }
    if (strategy.hotspotType === "platform_change") {
      return ["sk-mapping", "sk-risk", "sk-judge"];
    }
    if (strategy.hotspotType === "external_shock") {
      return ["sk-mapping", "sk-risk", "sk-judge"];
    }
    if (strategy.hotspotType === "mixed_digest") {
      return ["sk-suspense", "sk-mapping", "sk-judge"];
    }
    if (wealthTask) {
      return ["sk-wealth", "sk-mapping", "sk-judge"];
    }
    return ["sk-mapping", isListStyleTask(task) ? "sk-suspense" : "sk-judge", theme === "spiritual" ? "sk-quote" : "sk-judge"];
  }

  if (task.entryType === "topic" && strategy.hotspotType === "risk_regulation") {
    return ["sk-risk", "sk-judge", "sk-suspense"];
  }

  if (isNarrativeTask(task)) {
    return ["sk-story", "sk-judge", "sk-quote"];
  }

  if (wealthTask) {
    return ["sk-wealth", "sk-judge", "sk-suspense"];
  }

  if (isListStyleTask(task)) {
    return ["sk-suspense", theme === "platform" ? "sk-mapping" : "sk-judge", "sk-quote"];
  }

  if (isShortQuoteTask(task)) {
    return ["sk-quote", "sk-judge", "sk-suspense"];
  }

  if (theme === "platform") {
    return ["sk-mapping", "sk-judge", "sk-suspense"];
  }

  return ["sk-judge", "sk-suspense", "sk-quote"];
}

function buildSourceCopySkeleton(task: TaskForm): SkeletonItem {
  const sourceParagraphs = splitSourceParagraphs(task.sourceText || task.userNote);
  return {
    id: "sk-viral-source",
    name: "原文同款骨架",
    scenario: "仿写爆款 / 保结构轻改写",
    summary: "直接沿用原文段落顺序推进，不压字数，只做轻微改写、去重和装配。",
    steps: sourceParagraphs.slice(0, 8).map((paragraph, index) =>
      createSkeletonStep({
        name:
          /第一|第二|第三|第四|三样|三件|四大|五个/.test(paragraph)
            ? `原文兑现${index + 1}`
            : /事件|消息|刚刚|这次|从.+开始|平台|腾讯|微信/.test(paragraph)
              ? `原文映射${index + 1}`
              : /AI|系统|员工|脚本|剪辑|方法|工具/.test(paragraph)
                ? `原文落点${index + 1}`
                : `原文推进${index + 1}`,
        purpose: "按原文段落顺序承接推进",
        targetWords: Math.max(45, Math.min(180, paragraph.length)),
        segmentTask: "先吃原文这一段里的事实、判断和转折，只做轻微改写，不新增新的论证层。",
        minSentences: Math.max(1, Math.min(4, splitParagraphSentences(paragraph).length || 1)),
        bridgeToNext: index >= sourceParagraphs.length - 1 ? "最后把原文结论和动作收住。" : "顺着原文下一段继续推进，不要跳层。",
        allowMeat: index >= Math.max(2, sourceParagraphs.length - 2),
        requireSource: true
      })
    )
  };
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function shortTopic(task: TaskForm) {
  const text = getRelevantTaskText(task) || task.topicGoal || task.hotspotAngle || task.storyConclusion || task.sourceText;
  return text.slice(0, 22).trim() || "这件事";
}

function cleanText(text: string) {
  return text.replace(/\s+/g, "").trim();
}

function getRelevantTaskText(task: TaskForm) {
  if (task.entryType === "hotspot") {
    return [task.sourceText, task.hotspotAngle].join(" ");
  }

  if (task.entryType === "topic") {
    return [task.topicGoal, task.sourceText].join(" ");
  }

  if (task.entryType === "boss_story") {
    return [task.sourceText, task.storyConclusion].join(" ");
  }

  return [task.sourceText, task.userNote].join(" ");
}

function containsWarShock(task: TaskForm) {
  // 已废弃：不再检测战争相关内容
  return false;
}

function extractFirstSentence(text: string) {
  return text
    .split(/[。！？!?]/)
    .map((item) => item.trim())
    .find(Boolean) || text.trim();
}

export function splitSourceParagraphs(text: string) {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return [];

  const paragraphBlocks = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (paragraphBlocks.length >= 2) {
    return paragraphBlocks;
  }

  const lineBlocks = normalized
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (lineBlocks.length >= 2) {
    return lineBlocks;
  }

  const sentenceBlocks =
    normalized.match(/[^。！？!?]+[。！？!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [];

  if (sentenceBlocks.length <= 3) {
    return [normalized];
  }

  const paragraphs: string[] = [];
  let current = "";
  sentenceBlocks.forEach((sentence, index) => {
    current = `${current}${sentence}`.trim();
    const shouldBreak = current.length >= 130 || (index + 1) % 3 === 0;
    if (shouldBreak) {
      paragraphs.push(current);
      current = "";
    }
  });

  if (current) {
    paragraphs.push(current);
  }

  return paragraphs.filter(Boolean);
}

function classifySourceParagraphRole(paragraph: string, index: number, total: number) {
  if (looksLikeDraftCtaSentence(paragraph) || (index === total - 1 && /(评论区|主页|留个|留下|保存下来|点个小红心)/.test(paragraph))) {
    return { label: "动作", hint: "原文里承接评论、收藏、主页或关键词动作的部分" };
  }

  if (/你只需要|登录一个账号|AI员工|系统|帮你|自动选题|自动写脚本|自动剪辑|分享给你|发给你/.test(paragraph)) {
    return { label: "植入", hint: "原文里把方案、系统或服务带出来的部分" };
  }

  if (/新风口|真正值钱的|真正重要的|长期资产|数字资产|新方向|新逻辑|接下来真正/.test(paragraph)) {
    return { label: "塑品", hint: "原文里先把新方向、新解法种进观众脑子里的部分" };
  }

  if (/你有没有发现|本质|真正的问题|最可怕的|不是.+而是|说白了|其实|大多数人/.test(paragraph)) {
    return { label: "深化", hint: "原文里把表层现象往更深认知推进的部分" };
  }

  if (index === 0) {
    return { label: "立题", hint: "原文开头之后，用来交代这条到底在讲什么" };
  }

  return { label: "展开", hint: "原文中段继续把事情讲开、讲具体的部分" };
}

export function buildMockSourceStructure(task: TaskForm): SourceStructureItem[] {
  if (task.entryType !== "viral") {
    return [];
  }

  const paragraphs = splitSourceParagraphs(task.sourceText || task.userNote);
  if (paragraphs.length === 0) {
    return [];
  }

  const items: SourceStructureItem[] = [];
  const firstSentences = splitParagraphSentences(paragraphs[0]);

  if (firstSentences.length > 0) {
    items.push({
      id: createId("source"),
      label: "皮 / 抓停",
      hint: "原文第一刀，负责把观众停下来",
      text: ensureSentence(firstSentences[0])
    });

    const leadRemainder = firstSentences.slice(1).join("").trim();
    if (leadRemainder) {
      items.push({
        id: createId("source"),
        label: "立题",
        hint: "原文开头后半段，负责把这条内容的主题立住",
        text: leadRemainder
      });
    }
  }

  paragraphs.slice(1).forEach((paragraph, index) => {
    const role = classifySourceParagraphRole(paragraph, index + 1, paragraphs.length);
    items.push({
      id: createId("source"),
      label: role.label,
      hint: role.hint,
      text: paragraph
    });
  });

  return items;
}

function extractCoreTerm(task: TaskForm) {
  const text = getRelevantTaskText(task);
  const dictionary = [
    "数字人民币",
    "数字资产",
    "微信推客",
    "微信",
    "支付宝",
    "私域",
    "AI获客",
    "AI",
    "流量",
    "获客",
    "老板IP",
    "修行",
    "直播带货",
    "内容增长",
    "创业"
  ];

  const hit = dictionary.find((item) => text.includes(item));
  if (hit) {
    return hit;
  }

  return shortTopic(task).replace(/[，。,.!?！？]/g, "").slice(0, 10) || "这件事";
}

function containsAny(text: string, patterns: Array<string | RegExp>) {
  return patterns.some((pattern) => {
    if (typeof pattern === "string") {
      return text.includes(pattern);
    }

    return pattern.test(text);
  });
}

function pickPriorityText(task: TaskForm) {
  if (task.entryType === "hotspot") {
    return [task.hotspotAngle, task.sourceText].join(" ");
  }

  if (task.entryType === "topic") {
    return [task.topicGoal, task.sourceText].join(" ");
  }

  if (task.entryType === "boss_story") {
    return [task.storyConclusion, task.sourceText].join(" ");
  }

  return [task.sourceText, task.userNote].join(" ");
}

function pickExistingStrongTitle(task: TaskForm, formula: 1 | 2 | 3 | 4 | 5 | 6) {
  const title = extractFirstSentence(task.entryType === "viral" ? task.sourceText : getRelevantTaskText(task))
    .slice(0, 40)
    .trim();
  if (!title) return "";

  if (formula === 1) {
    return /^(出大瓜了|出大事了|真的破防了|[^，。！？?]{2,10}(沉默了|变天了|发钱了|摊牌了|翻盘了|破防了|看愣了|没坐住了?|后背发凉了?|睡不着了?))/.test(
      title
    )
      ? title
      : "";
  }

  if (formula === 2) {
    return /^(从.+开始|十年后|明年|从今年开始|202\d年|这两天|一夜之间).*(发钱|红包|重排|断流|掉量|掉队|不值钱|废纸|洗牌|买不起|难了|惨了|先没客户|变天)/.test(
      title
    )
      ? title
      : "";
  }

  if (formula === 3) {
    return /^(一定要|必须|老板一定要|做.+的人一定要|想.+的人必须|还在.+的人必须)/.test(title) ? title : "";
  }

  if (formula === 4) {
    return /^(刚刚|这两天|微信这次|腾讯这次|从.+开始).*(没反应过来|没注意到|没看懂|知道的人不多|重新开了|重排了|发钱了|把入口改了|把口子打开了|动真格了)/.test(
      title
    )
      ? title
      : "";
  }

  if (formula === 5) {
    return /^[^，。！？?]{4,18}[？?]$/.test(title) && /(真|真的|到底|还能|会很惨|最危险|最怕)/.test(title) ? title : "";
  }

  return /^(不会.+的人|还在.+的人|死守.+的人|舍不得.+的人|明星和网红|将来明星和网红|心不稳的人|情绪一乱的人|做老板的人).*(要开始|迟早|会越来越|先没客户|先掉量|先断流|吃大亏|被打醒)/.test(
    title
  )
    ? title
    : "";
}

function inferWarAnchor(task: TaskForm) {
  // 已废弃：不再推断战争相关锚点
  return "这件事";
}

function inferHookAnchor(task: TaskForm) {
  const text = pickPriorityText(task);
  const theme = inferHookTheme(task);

  if (/不结婚|婚姻/.test(text)) return "不结婚";
  if (theme === "ai") return text.includes("AI获客") ? "AI获客" : "AI";
  if (theme === "platform") {
    if (/腾讯/.test(text)) return "腾讯";
    if (/微信/.test(text)) return "微信";
  }
  if (theme === "celebrity") return "明星和网红";

  const anchors = [
    "腾讯",
    "微信",
    "视频号",
    "抖音",
    "小红书",
    "快手",
    "明星和网红",
    "明星",
    "网红",
    "支付宝",
    "数字人民币",
    "数字资产",
    "AI获客",
    "AI",
    "学佛的人",
    "修行的人"
  ];
  const hit = anchors.find((item) => text.includes(item));
  if (hit) {
    return hit;
  }

  const pickedTitle = getRelevantTaskText(task).replace(/[，。,.!?！？：:]/g, "").trim();
  if (pickedTitle) {
    return pickedTitle.slice(0, 18);
  }

  return extractCoreTerm(task);
}

function inferHookTarget(task: TaskForm) {
  const text = pickPriorityText(task);
  const theme = inferHookTheme(task);
  if (task.entryType === "boss_story") return "做老板的人";
  if (containsWarShock(task)) return "把安全感全押在线下的人";
  if (theme === "ai") return "还在靠老办法获客的人";
  if (theme === "platform") return "还在老地方等流量的人";
  if (theme === "celebrity") return "明星和网红";
  if (/学佛|修行/.test(text)) return "真正想把关系做长久的人";
  if (/老板|创业|公司|门店|实体/.test(text)) return "还在线下死扛的老板";
  if (/AI|获客|流量|内容/.test(text)) return "还在靠老办法获客的人";
  if (/数字资产|数字人民币|微信|支付宝|腾讯|平台/.test(text)) return "还没开始布局数字资产的人";
  return "还想拿老办法赚钱的人";
}

function inferHookLoss(task: TaskForm) {
  const text = pickPriorityText(task);
  const theme = inferHookTheme(task);
  if (task.entryType === "boss_story") return "一次判断失误就能把多年积累打回原点";
  if (containsWarShock(task)) return "一次外部变化就能把多年安全感打穿";
  if (theme === "ai") return "连低成本客户都摸不到";
  if (theme === "platform") return "第一波流量和红利跟你无关";
  if (theme === "celebrity") return "会越来越不值钱";
  if (/学佛|修行/.test(text)) return "再好的机会也接不住";
  if (/AI|获客|流量|内容/.test(text)) return "连低成本客户都摸不到";
  if (/数字资产|数字人民币/.test(text)) return "连未来的赚钱入口都摸不到";
  if (/微信|支付宝|腾讯|平台/.test(text)) return "第一波流量和红利跟你无关";
  return "会越来越难赚";
}

function inferLegacyMethod(task: TaskForm) {
  const text = pickPriorityText(task);
  const theme = inferHookTheme(task);
  if (theme === "platform") return "靠发朋友圈接单";
  if (theme === "ai") return "传统拉客户";
  if (theme === "celebrity") return "端着架子吃流量饭";
  if (/微信|腾讯|视频号|抖音|小红书|快手|平台/.test(text)) return "靠发朋友圈接单";
  if (/AI|获客|流量|内容/.test(text)) return "传统拉客户";
  if (/老板|创业|公司|门店|实体|生意/.test(text)) return "线下守店";
  if (/明星|网红/.test(text)) return "端着架子吃流量饭";
  if (/数字资产|数字人民币|现金/.test(text)) return "只存现金";
  return "守旧路";
}

function inferHookTimePhrase(task: TaskForm) {
  const text = pickPriorityText(task);
  const matched = text.match(/(从\s*\d+\s*月\s*\d+\s*号开始|202\d年|明年|十年后|再过三年|未来三年)/);
  if (matched?.[1]) {
    return matched[1].replace(/\s+/g, "");
  }

  if (/现金|数字人民币/.test(text)) return "十年后";
  if (/腾讯|微信|抖音|小红书|快手|平台|AI|获客|流量/.test(text)) return "从今年开始";
  if (task.entryType === "hotspot") return "这几天";
  if (task.entryType === "boss_story") return "一夜之间";
  return "从今年开始";
}

function toStartPhrase(timePhrase: string) {
  if (timePhrase.includes("开始")) return timePhrase;
  if (timePhrase === "再过三年") return "三年内";
  if (timePhrase === "十年后") return "十年内";
  if (timePhrase === "明年") return "从明年开始";
  if (timePhrase === "这几天") return "这几天开始";
  if (timePhrase === "一夜之间") return "一夜之间";
  return `${timePhrase}开始`;
}

function inferHookQuestion(task: TaskForm) {
  const text = pickPriorityText(task);
  const theme = inferHookTheme(task);
  if (/结婚|婚姻/.test(text)) return "不结婚到底有多惨";
  if (containsWarShock(task)) return "老板最大的风险，真的是没客户吗";
  if (theme === "ai") return "不会AI获客，到底有多难受";
  if (theme === "platform") return "平台把入口换了，到底有多狠";
  if (theme === "celebrity") return "明星以后到底有多难";
  if (/学佛|修行/.test(text)) return "心不稳的人，到底有多吃亏";
  if (/数字资产|数字人民币/.test(text)) return "没有数字资产，到底有多被动";
  return `${extractCoreTerm(task)}到底有多狠`;
}

type HookTheme = "ai" | "asset" | "platform" | "spiritual" | "boss" | "celebrity" | "generic";

function isMarriageTopic(task: TaskForm) {
  return /结婚|婚姻/.test(getRelevantTaskText(task));
}

function inferHookTheme(task: TaskForm): HookTheme {
  const fullText = getRelevantTaskText(task);
  const themePatterns: Array<{ theme: HookTheme; patterns: RegExp[] }> = [
    { theme: "spiritual", patterns: [/学佛/g, /修行/g, /佛学/g, /慈悲/g, /禅/g, /冥想/g, /心灵/g, /灵性/g] },
    { theme: "celebrity", patterns: [/明星/g, /网红/g, /演员/g, /艺人/g, /顶流/g, /偶像/g, /娱乐圈/g, /MCN/g] },
    { theme: "platform", patterns: [/腾讯/g, /微信/g, /支付宝/g, /视频号/g, /抖音/g, /小红书/g, /快手/g, /平台/g, /元宝/g, /公众号/g, /微博/g, /B站/g] },
    { theme: "asset", patterns: [/数字资产/g, /数字人民币/g, /NFT/g, /区块链/g, /元宇宙/g, /虚拟货币/g] },
    { theme: "ai", patterns: [/AI/g, /获客/g, /内容增长/g, /流量/g, /私域/g, /短视频/g, /文案/g, /变现/g, /涨粉/g, /曝光/g, /算法/g, /投放/g, /ROI/g, /转化/g, /引流/g, /粉丝/g, /用户增长/g, /数字人/g, /AIGC/g, /人工智能/g, /直播带货/g] },
    { theme: "boss", patterns: [/老板/g, /创业者/g, /企业/g, /生意/g, /公司/g, /老总/g, /总裁/g, /经营/g, /操盘/g, /实体/g, /门店/g, /店主/g, /商家/g] }
  ];

  const scored = themePatterns
    .map(({ theme, patterns }) => ({
      theme,
      score: patterns.reduce((total, pattern) => total + (fullText.match(pattern)?.length ?? 0), 0)
    }))
    .sort((left, right) => right.score - left.score);

  if (scored[0] && scored[0].score > 0) {
    return scored[0].theme;
  }

  if (task.entryType === "boss_story") return "boss";
  return "generic";
}

function inferShortCrowd(task: TaskForm) {
  const theme = inferHookTheme(task);
  if (theme === "asset") return "老板";
  if (theme === "ai") return "普通人";
  if (theme === "spiritual") return "创业者";
  if (theme === "celebrity") return "很多人";
  return "老板";
}

function buildFormulaOne(task: TaskForm, anchor: string) {
  // 公式1：锚点 + 情绪异常反应（真实爆款规律：先给说话人的情绪反应，再带观众代入）
  // 参考：刘强东沉默了，章泽天也沉默了，真的破防了 / 我看完后背都是汗，到现在脑子还嗡嗡的
  const theme = inferHookTheme(task);
  const crowd = inferShortCrowd(task);
  const existing = pickExistingStrongTitle(task, 1);
  if (existing) {
    return [existing, existing];
  }

  if (isMarriageTopic(task)) {
    return ["不结婚这件事，真把很多人吓住了。", "婚姻这两个字，真把很多人说怕了。"];
  }

  if (theme === "asset") {
    return [
      `${anchor}，所有把身家押在线下的老板，后背都凉了，真的没坐住。`,
      `${anchor}这一炸，我看完后背都是汗，才发现我们以为稳的东西根本不稳。`
    ];
  }

  if (theme === "spiritual") {
    return [
      "一定要跟学佛的人做朋友，我跟他接触三次之后，后背发凉了，因为他一眼就看透了我。",
      "修行的人，真的会让很多人越接触越沉默，因为你以为在玩心眼，他修的是天眼。"
    ];
  }

  if (theme === "boss") {
    return [
      "很多老板沉默了，这件事真把人看破防了。",
      `${anchor}这件事一出来，我看完脑子嗡了一下。`
    ];
  }

  if (theme === "celebrity") {
    return [
      "明星以后真要难了，很多人还没反应过来。",
      "明星和网红这条路，我看完后背都凉了。"
    ];
  }

  if (theme === "platform") {
    return [
      `${anchor}这次变天了，很多老板后背都凉了。`,
      `${anchor}这一动，我看完直接没坐住。`
    ];
  }

  if (theme === "ai") {
    return [
      `${anchor}这次真把很多老板看沉默了。`,
      `${anchor}一出来，我看完脑子嗡了一下。`
    ];
  }

  return [
    `${anchor}沉默了，真的破防了，这件事比我想的严重多了。`,
    `${anchor}这次出来，很多${crowd}后背发凉，真的没坐住。`
  ];
}

function buildFormulaTwo(task: TaskForm, timePhrase: string) {
  // 公式2：时间点 + 具体人群 + 极端后果（真实爆款规律：时间要具体，后果要有画面感）
  // 参考：从2月1号开始，腾讯要在一个很多人还没注意到的地方... / 十年后现金变废纸
  const theme = inferHookTheme(task);
  const startPhrase = toStartPhrase(timePhrase);
  const existing = pickExistingStrongTitle(task, 2);
  if (existing) {
    return [existing, existing];
  }

  if (isMarriageTopic(task)) {
    return ["从今天开始，婚姻焦虑又要收割一批人了。", "这两年，拿结婚吓自己的人越来越多了。"];
  }

  if (theme === "asset") {
    return [
      "十年后，现金可能真没现在这么值钱了。",
      `${startPhrase}，没数字资产的人会越来越被动。`
    ];
  }

  if (theme === "ai") {
    return [
      `${startPhrase}，不会AI获客的老板，要开始掉客户了。`,
      `${startPhrase}，还靠老办法拉客户的人，要先难受了。`
    ];
  }

  if (theme === "platform") {
    return [
      `${startPhrase}，平台真要重新分流量了。`,
      `${startPhrase}，看不懂平台这次变化的人，要先掉量了。`
    ];
  }

  if (theme === "spiritual") {
    return [
      `${startPhrase}，心不稳的人，真要开始吃亏了。`,
      `${startPhrase}，情绪一乱的人，机会会一把一把丢。`
    ];
  }

  if (theme === "boss") {
    return [
      `${startPhrase}，死守旧路的老板，要先被市场打醒了。`,
      `${startPhrase}，老板最怕的那件事，真要来了。`
    ];
  }

  if (theme === "celebrity") {
    return [
      `${startPhrase}，明星这碗饭，真的没以前好吃了。`,
      `${startPhrase}，还端着的人，真的要开始难了。`
    ];
  }

  return [
    `${startPhrase}，老办法这次真不灵了。`,
    `${startPhrase}，反应慢的人，真要先掉队了。`
  ];
}

function buildFormulaThree(task: TaskForm, anchor: string) {
  // 公式3：强命令 + 具体人群（真实爆款规律：命令要有对象，不能命令全世界）
  // 参考：一定要跟学佛的人做朋友 / 老板一定要尽快给自己留一条线上活路
  const theme = inferHookTheme(task);
  const existing = pickExistingStrongTitle(task, 3);
  if (existing) {
    return [existing, existing];
  }

  if (isMarriageTopic(task)) {
    return ["别再拿结婚吓普通人了。", "还在拿婚姻吓唬别人的人，真的该醒了。"];
  }

  if (theme === "asset") {
    return [
      "普通人一定要开始攒数字资产。",
      "还没有线上获客能力的老板，必须马上补这一课。"
    ];
  }

  if (theme === "ai") {
    return [
      "老板一定要尽快把AI装进获客链路。",
      "做生意的人，必须马上换获客工具。"
    ];
  }

  if (theme === "platform") {
    return [
      `做流量的人一定要看懂${anchor}这次变化。`,
      "老板必须马上搞清楚平台把流量往哪里送。"
    ];
  }

  if (theme === "spiritual") {
    return [
      "一定要跟学佛的人做朋友。",
      "真正想把关系做长久的人，必须先把心修稳。"
    ];
  }

  if (theme === "boss") {
    return [
      "老板必须马上给自己留后路。",
      "还在线下死扛的老板，真的不能再等了。"
    ];
  }

  if (theme === "celebrity") {
    return [
      "想继续吃流量饭的人，千万别再端着了。",
      "做流量的人，一定不能再端着了。"
    ];
  }

  return [
    "还想继续赚钱的人，一定要尽快换路。",
    "想把生意做长久的人，必须马上改掉旧打法。"
  ];
}

function buildFormulaFour(task: TaskForm, anchor: string, timePhrase: string) {
  // 公式4：信息差爆料型（真实爆款规律：要说"很多人还不知道"，要有时间锚点，要有具体动作）
  // 参考：从2月1号开始，腾讯要在一个很多人还没注意到的地方派发十亿现金红包
  const theme = inferHookTheme(task);
  const existing = pickExistingStrongTitle(task, 4);
  if (existing) {
    return [existing, existing];
  }

  if (isMarriageTopic(task)) {
    return ["刚刚，婚姻最扎心的真相，被摆上桌了。", "这两天，不结婚这件事又把一批人吓住了。"];
  }

  // 移除战争主题，改为资产主题
  if (theme === "asset") {
    return [
      "刚刚，数字人民币又往前推了一步，很多人还没反应过来。",
      `${timePhrase}，一个跟钱直接有关的新动作，已经悄悄开了。`
    ];
  }

  if (theme === "ai") {
    return [
      `刚刚，${anchor}开始重排客户入口了，很多老板还没看懂。`,
      `${timePhrase}，${anchor}在一个很多人没注意到的地方，已经把客户口子重新开了。`
    ];
  }

  if (theme === "platform") {
    return [
      `刚刚，${anchor}把一条新流量口子放出来了，知道的人还不多。`,
      `${timePhrase}，${anchor}在一个很多人没注意到的地方，把流量口子打开了。`
    ];
  }

  if (theme === "spiritual") {
    return [
      "刚刚，一个真正筛人的东西出来了，很多人还没看懂。",
      "这两天，真正决定你能走多远的东西，已经摆在脸上了。"
    ];
  }

  if (theme === "boss") {
    return [
      "刚刚，老板圈最狠的一次洗牌信号出来了，很多人还没反应过来。",
      "这两天，一个会直接改生意分配权的动作，已经悄悄开始了。"
    ];
  }

  if (theme === "celebrity") {
    return [
      "这两天，明星和网红最赚钱的那条老路，真的开始塌了。",
      "刚刚，明星和网红这碗饭的玩法又变了。"
    ];
  }

  return [
    "刚刚，赚钱顺序真的被改了，很多人还没反应过来。",
    `${timePhrase}，一个会重新筛人的变化，已经悄悄开始了。`
  ];
}

function buildFormulaFive(task: TaskForm) {
  // 公式5：反常识问题（真实爆款规律：问题要有争议性，要直接点对象）
  // 参考：不结婚真的会很惨吗？/ 到底是段永平牛还是雷军牛？/ 中国踢日本能赢吗？
  const theme = inferHookTheme(task);
  const existing = pickExistingStrongTitle(task, 5);
  if (existing) {
    return [existing, existing];
  }

  if (isMarriageTopic(task)) {
    return ["不结婚到底有多惨？", "婚姻这件事，到底吓住了多少人？"];
  }

  if (theme === "asset") {
    return [
      "现金到底有多不值钱？",
      "没有数字资产，到底有多被动？"
    ];
  }

  if (theme === "ai") {
    return [
      "不会AI获客，到底有多难受？",
      "客户变少，到底是谁的问题？"
    ];
  }

  if (theme === "platform") {
    return [
      "流量起不来，到底有多危险？",
      "老板最危险的时候，真是没客户吗？"
    ];
  }

  if (theme === "spiritual") {
    return [
      "修行到底有多重要？",
      "心不稳的人，到底有多吃亏？"
    ];
  }

  if (theme === "boss") {
    return [
      "老板最危险的时候，真是没客户吗？",
      "死守线下，到底有多危险？"
    ];
  }

  if (theme === "celebrity") {
    return [
      "明星以后，到底有多难？",
      "还端着的人，到底有多吃亏？"
    ];
  }

  return [inferHookQuestion(task) + "？", `${extractCoreTerm(task)}到底有多狠？`];
}

function buildFormulaSix(task: TaskForm, anchor: string) {
  // 公式6：人群命运判决（真实爆款规律：判决要斩钉截铁，后果要具体，不能只说"会很惨"）
  // 参考：许家印倒了，李嘉诚跑了，马云也不复从前了 / 将来明星和网红都会很可怜
  const theme = inferHookTheme(task);
  const existing = pickExistingStrongTitle(task, 6);
  if (existing) {
    return [existing, existing];
  }

  if (isMarriageTopic(task)) {
    return ["婚姻焦虑最重的人，最后都活得最拧巴。", "被婚姻吓住的人，最后都活不痛快。"];
  }

  if (theme === "asset") {
    return [
      "没数字资产的人，后面会很被动。",
      "把安全感全押在线下的人，迟早会吃亏。"
    ];
  }

  if (theme === "ai") {
    const legacyMethod = inferLegacyMethod(task);
    return [
      "AI获客这件事，老板再晚看懂，成本只会更高。",
      `${legacyMethod}的老板，后面会越来越吃力。`
    ];
  }

  if (theme === "platform") {
    const legacyMethod = inferLegacyMethod(task);
    return [
      `看不懂${anchor}这次变化的人，绝对没流量。`,
      `${legacyMethod}的老板，今年一定没单。`
    ];
  }

  if (theme === "spiritual") {
    return [
      "心不稳的人，大机会也接不住。",
      "情绪一乱的人，手里的福气留不住。"
    ];
  }

  if (theme === "boss") {
    const legacyMethod = inferLegacyMethod(task);
    return [
      "死守线下的老板，今年一定被淘汰。",
      `${legacyMethod}的老板，今年一定倒闭。`
    ];
  }

  if (theme === "celebrity") {
    return [
      "明星和网红这碗饭，今年一定更难吃。",
      "还端着的明星和网红，绝对接不到活。"
    ];
  }

  return [
    "守旧路的人，今年一定吃大亏。",
    "不肯换路的人，绝对赚不到钱。"
  ];
}

function hookRiskByFormula(formula: number): RiskLevel {
  if (formula === 2 || formula === 6) return "高";
  if (formula === 1 || formula === 4) return "中";
  return "低";
}

function inferHookType(task: TaskForm) {
  const text = getRelevantTaskText(task);
  if (task.entryType === "boss_story") return "反转故事型";
  if (/国家|政策|数字人民币|央行|微信|平台|战争|经济/.test(text)) return "趋势预警型";
  if (/为什么|到底|真相|其实/.test(text)) return "反常识型";
  if (/老板|创业|公司|实体/.test(text)) return "老板判断型";
  return hookTypeByEntry[task.entryType];
}

function inferEmotion(task: TaskForm) {
  const text = getRelevantTaskText(task);
  if (/风险|焦虑|危机|洗牌|失业|结束/.test(text)) return "危机感 + 紧迫感";
  if (/机会|趋势|红利|增长|翻身/.test(text)) return "机会感 + 判断感";
  if (task.entryType === "boss_story") return "反转感 + 真实感";
  return emotionByEntry[task.entryType];
}

function inferRisks(task: TaskForm) {
  const text = getRelevantTaskText(task);
  const risks: string[] = [];

  if (/国家|政策|央行|数字人民币|封关/.test(text)) {
    risks.push("涉及政策、金融、国家级变化时，不要把结论说成已经全面落地，尽量保留判断空间。");
  }
  // 移除战争风险提示
  if (/最值钱|最后机会|一定要/.test(text)) {
    risks.push("开头可以狠，但中段要补理由，否则容易像空喊口号。");
  }
  if (task.businessMode !== "none") {
    risks.push("如果中段太早出现业务，整条会像广告，肉最好后移到倒数第二段。");
  }
  risks.push("结尾只留一个动作，别同时让用户点赞、评论、进主页、领资料。");

  return risks.slice(0, 3);
}

function inferReusablePoints(task: TaskForm) {
  const text = getRelevantTaskText(task);
  const points = [
    "开头不要解释，先把结果级冲击抛出来，再往下补原因。",
    "中段最好用“变化 -> 为什么你要重视 -> 普通人怎么应对”来推进。",
    "如果这条是热点内容，优先做评论互动，不要强行挂业务。"
  ];

  if (/老板|创业|公司/.test(text)) {
    points.unshift("如果涉及老板故事，反差和代价一定要前置，先把人留下。");
  }

  if (/数字人民币|数字资产|AI/.test(text)) {
    points.unshift("趋势类内容一定要把“大变化”和“普通人的后果”绑在一起讲。");
  }

  return points.slice(0, 3);
}

function defaultCtaText(ctaMode: CtaMode, profile: BaseProfile) {
  const keyword = profile.coreKeywords.split(/[,，]/)[0]?.trim() ?? "数字资产";
  if (ctaMode === "none") return "如果你也有同样的感受，评论区留下厚德载物。";
  if (ctaMode === "comment") return "如果你想继续听下去，评论区留个666，我继续往下拆。";
  if (ctaMode === "keyword") return `如果你也想知道怎么把流量变成自己的资产，评论区打${keyword}，我把方法发给你。`;
  if (ctaMode === "profile") return "如果你想看完整打法，先在评论区留一句想学，再去主页看第一条置顶。";
  return "如果你真想拿资料，评论区直接打想要，我把完整内容发给你。";
}

function inferTaskKeyword(task: TaskForm, profile: BaseProfile) {
  const theme = inferHookTheme(task);
  if (theme === "ai") return "AI获客";
  if (theme === "asset") return "数字资产";
  if (theme === "platform") return "微信流量";
  if (theme === "spiritual") return "修行";
  if (theme === "boss") return "老板增长";
  return profile.coreKeywords.split(/[,，]/)[0]?.trim() ?? "数字资产";
}

function inferTaskAssetNoun(task: TaskForm, profile: BaseProfile) {
  const theme = inferHookTheme(task);
  if (theme === "ai") return "自己的获客链路";
  if (theme === "asset") return "自己的数字资产";
  if (theme === "spiritual") return "自己的心力和判断力";
  if (theme === "boss") return "自己的第二增长曲线";
  return `自己的${inferTaskKeyword(task, profile)}`;
}

function buildKeywordLeadText(task: TaskForm, keyword: string) {
  const theme = inferHookTheme(task);
  if (theme === "ai") return `如果你也想把客户真正跑起来，评论区打${keyword}，我把方法发给你。`;
  if (theme === "asset") return `如果你也想知道怎么把流量变成自己的资产，评论区打${keyword}，我把方法发给你。`;
  if (theme === "platform") return `如果你也想接住这一波流量，评论区打${keyword}，我把方法发给你。`;
  if (theme === "boss") return `如果你也想把老板这套增长路子跑起来，评论区打${keyword}，我把方法发给你。`;
  return `如果你也想知道怎么把流量变成自己的资产，评论区打${keyword}，我把方法发给你。`;
}

function buildTaskCtaText(ctaMode: CtaMode, task: TaskForm, profile: BaseProfile) {
  const keyword = inferTaskKeyword(task, profile);
  if (ctaMode === "none") return "如果你也有同样的感受，评论区留下厚德载物。";
  if (ctaMode === "comment") return "如果你想继续听下去，评论区留个666，我继续往下拆。";
  if (ctaMode === "keyword") return buildKeywordLeadText(task, keyword);
  if (ctaMode === "profile") return "如果你想看完整打法，先在评论区留一句想学，再去主页看第一条置顶。";
  return "如果你真想拿资料，评论区直接打想要，我把完整内容发给你。";
}

function businessPhrase(task: TaskForm, profile: BaseProfile) {
  if (task.businessMode === "none") {
    return "";
  }

  if (task.businessMode === "light") {
    return `真正能让普通人抓住这波机会的，不是拼命刷信息，而是把内容、流量和客户沉淀成自己的${inferTaskKeyword(task, profile)}。`;
  }

  return `${profile.selfIntro}我们这套方案的本质，就是把内容、流量和获客三件事系统化跑起来。`;
}

function riskLevel(index: number): RiskLevel {
  if (index % 4 === 0) return "高";
  if (index % 3 === 0) return "中";
  return "低";
}

export function buildMockDecompose(task: TaskForm, profile: BaseProfile): DecomposeResult {
  const entryType = task.entryType;
  const topic = extractCoreTerm(task);
  const firstSentence = extractFirstSentence(cleanText(getRelevantTaskText(task)));
  const primarySkeleton = buildMockSkeletons(task)[0] ?? skeletonLibrary[0];
  const suggestedHook =
    buildMockHooks(task)[0]?.text ||
    (entryType === "boss_story"
      ? "我几十家门店说关就关，那一刻我才明白，老板真正输的不是钱。"
      : `${topic}会淘汰99%的人。`);

  return {
    taskName: `${typeLabelMap[entryType]} · ${topic}`,
    summary: containsWarShock(task)
      ? "这条热点真正该打的，不是战争信息本身，而是战争背后把普通老板安全感炸穿的那一下。先把线下资产的不确定性打出来，再顺着落到数字资产和 AI 获客，才会有停留和代入。"
      : `这条素材真正该打的，不是信息量，而是注意力警报。原文的问题是“先解释，后判断”，所以前三秒留不住人。建议改成“先把前4到8个字钉住 -> 先下判决 -> 再补后果 -> 最后解释原因”。`,
    hookAnalysis: {
      type: inferHookType(task),
      example: suggestedHook,
      logic: `原素材开头“${firstSentence.slice(0, 28)}”更像说明，不像开战。皮不是一句观点，而是注意力警报：前4到8个字先打锚点，再下判决，再给后果，让观众立刻想问“为什么”。`
    },
    skeletonAnalysis: {
      name: primarySkeleton.name,
      steps: primarySkeleton.steps.map((step) => step.name),
      why:
        primarySkeleton.id === "sk-viral-source"
          ? "这条先保留原爆款的原始推进顺序，只轻改表达，不压缩内容，再把皮和肉顺着原文丝滑装进去。"
          : primarySkeleton.id === "sk-mapping"
            ? "这套骨架不是讲热点热闹，而是先把事件冲击接住，再映射现实、升级风险、过桥到新认知，最后才落方法。"
            : primarySkeleton.id === "sk-suspense"
              ? "这套骨架的核心不是列点，而是持续兑现，让观众每往下听一段，都能拿到新的内容回报。"
              : primarySkeleton.id === "sk-story"
                ? "这套骨架会先把冲突和代价摊开，再讲转向和反转，最后把故事压成能带走的老板认知。"
                : primarySkeleton.id === "sk-quote"
                  ? "哪怕是金句型短视频，也不能只有一句漂亮话，必须先判断、再解释、再对照、再回收。"
                  : "这套骨架的核心是持续推进：先接住现实，再放大代价，再拆原因，再过桥到新认知，最后才落方向。"
    },
    meatAnalysis: {
      fit: task.businessMode,
      reason:
        task.businessMode === "none"
          ? "这条更适合纯流量或人设打法，先把评论和停留做起来，不建议硬挂业务。"
          : task.businessMode === "light"
            ? "当前内容和业务存在弱相关，适合在后半段轻提方法、数字资产或AI获客，不要抢前面内容戏份。"
            : "当前内容和业务强相关，可以带方案，但仍然建议先讲变化和后果，再带出解法。",
      example: businessPhrase(task, profile)
    },
    ctaAnalysis: {
      type: ctaLabelMap[task.ctaMode],
      example: buildTaskCtaText(task.ctaMode, task, profile),
      reason: "这类收口更适合视频号，动作简单，便于先做互动再承接精准用户。"
    },
    emotion: inferEmotion(task),
    reusablePoints: inferReusablePoints(task),
    risks: inferRisks(task)
  };
}

function inferMockHookVerdict(task: TaskForm) {
  const theme = inferHookTheme(task);

  if (theme === "platform") return "这次把入口换了。";
  if (theme === "ai") return "这波不是热闹，是真的要分人了。";
  if (theme === "asset") return "这事比大多数人想的更狠。";
  if (theme === "spiritual") return "这根本不是鸡汤，是分水岭。";
  if (theme === "celebrity") return "这碗饭真的要变了。";
  if (theme === "boss") return "这不是提醒，是给老板的判决。";
  return "这次真不是小事。";
}

function inferMockHookOutcome(task: TaskForm) {
  const loss = inferHookLoss(task);

  if (/没生意/.test(loss)) return "生意会越来越难做";
  if (/没客户/.test(loss)) return "客户会越来越难留";
  if (/倒闭/.test(loss)) return "经营压力会越来越大";
  if (/淘汰/.test(loss)) return "后面更容易被淘汰";
  if (/不值钱|废纸/.test(loss)) return "会越来越不值钱";
  if (/买不起/.test(loss)) return "后面一定买不起";
  if (/吃亏/.test(loss)) return "后面一定吃大亏";
  if (/掉量|掉队/.test(loss)) return "后面最先掉队";
  return "后面最先出局";
}

function inferMockHookType(text: string) {
  if (/[？?]$/.test(text)) return "拷问型";
  if (/^(从|这两天|刚刚|今天|明年|未来|再过|202\d年)/.test(text)) return "时间压迫型";
  if (/^(一定要|必须|千万别|赶紧|别再|不要再)/.test(text)) return "命令型";
  if (/^(不会|还在|死守|传统|线下守店)/.test(text)) return "人群判决型";
  if (/(沉默了|急了|完了|变天了|破防了|动口子了)/.test(text)) return "异常判决型";
  return "强结论型";
}

export function buildMockHooks(task: TaskForm): HookItem[] {
  const hookTask = task.entryType === "hotspot" ? { ...task, hotspotAngle: "" } : task;
  const strategy = analyzeTaskStrategy(hookTask);
  const sourceHasDirectBusinessAnchor =
    /(AI获客|数字IP|数字资产|获客|流量|私域|自动化|内容增长|平台变化|企业增长|老板增长|数字人|客户|订单|转化)/.test(hookTask.sourceText || "")
    || /(AI|人工智能).{0,12}(获客|流量|转化|客户|商业化|内容增长|数字人|企业增长|老板增长)/.test(hookTask.sourceText || "");
  const anchor = inferHookAnchor(hookTask);
  const theme = inferHookTheme(hookTask);
  const target = inferHookTarget(hookTask);
  const legacyMethod = inferLegacyMethod(hookTask);
  const timePhrase = toStartPhrase(inferHookTimePhrase(hookTask));
  const question = `${inferHookQuestion(hookTask).replace(/[？?]+$/g, "")}？`;
  const topic = extractCoreTerm(hookTask);
  const firstSentence = extractFirstSentence(hookTask.entryType === "topic" ? hookTask.topicGoal || hookTask.sourceText : getRelevantTaskText(hookTask)).trim();
  const hotspotPercentShock = firstSentence.match(/(国际油价|油价)[^。！？?]{0,12}(?:单日巨震|单日大跌|一天跌掉|暴跌)(\d+%)/);
  const hotspotRangeShock = firstSentence.match(/(国际油价|油价)?[^。！？?]{0,12}从(\d{2,3}美元?)[^。！？?]{0,10}(?:高位回落到|回落到|跌到|跌至|到)(\d{2,3}美元?)/);
  const hotspotDirectCandidates =
    hookTask.entryType === "hotspot"
      ? [
          hotspotPercentShock ? `${hotspotPercentShock[1]}24小时暴跌${hotspotPercentShock[2]}。` : "",
          hotspotRangeShock ? `${hotspotRangeShock[1] || "油价"}从${hotspotRangeShock[2]}高位暴跌到${hotspotRangeShock[3]}。` : "",
          firstSentence
            .replace(/单日巨震(\d+%)/g, "24小时暴跌$1")
            .replace(/单日大跌(\d+%)/g, "24小时暴跌$1")
            .replace(/一天跌掉(\d+%)/g, "24小时暴跌$1")
            .replace(/闪崩/g, "高位暴跌")
            .trim(),
          getHookLeadScore(firstSentence) >= 26 ? firstSentence : ""
        ]
      : [];
  const regulationCandidates =
    hookTask.entryType === "hotspot" && strategy.hotspotType === "risk_regulation"
      ? [
          /两会/.test(hookTask.sourceText) ? "两会这次直接问到AI边界了。" : "",
          /饭碗|替代/.test(hookTask.sourceText) ? "AI到底会不会抢走你的饭碗？" : "AI到底该不该设边界？",
          /网约车/.test(hookTask.sourceText) ? "网约车监管这次被摆上桌面了。" : "",
          getHookLeadScore(firstSentence) >= 26 ? firstSentence : ""
        ]
      : [];
  const verdict = inferMockHookVerdict(hookTask);
  const topicCandidate = topic.length >= 2 && topic.length <= 8 ? `${topic}${verdict}` : "";
  const outcome = inferMockHookOutcome(hookTask);
  const existingTitles = [1, 2, 3]
    .map((formula) => pickExistingStrongTitle(hookTask, formula as 1 | 2 | 3 | 4 | 5 | 6))
    .filter(Boolean);

  const themeCandidates =
    isMarriageTopic(hookTask)
      ? [
          "不结婚到底有多惨？",
          "婚姻这件事，到底吓住了多少人？",
          "不结婚这件事，根本没那么可怕。"
        ]
      : theme === "celebrity"
        ? [
            "将来明星和网红都会很可怜，你等着看吧。",
            "明星和网红这碗饭，真的要变了。",
            "还端着的明星和网红，后面一定接不到活。"
          ]
        : theme === "platform"
          ? [
              getHookLeadScore(firstSentence) >= 28 ? firstSentence : "",
              `${anchor}这次动真格了。`,
              `${anchor}这次把入口换了。`,
              /红包/.test(hookTask.sourceText) && /(微信|元宝)/.test(hookTask.sourceText)
                ? "十亿红包没进微信，很多人还没反应过来。"
                : `${timePhrase}，${anchor}这次真的换口子了。`
            ]
          : theme === "ai"
            ? [
                `${anchor}背后，先变的不是热闹，是获客规则。`,
                "AI这波变化，最先影响的是还在老办法拉客户的老板。",
                "老板现在补AI获客，不是赶时髦，是在补入口。"
              ]
            : theme === "spiritual"
              ? [
                  "一定要跟学佛的人做朋友。",
                  "学佛的人，身上最值钱的不是聪明，是慈悲。",
                  "修行的人，关键时刻真能护住一个家。"
                ]
              : theme === "boss"
                ? [
                    "还在线下死扛的老板，后面最先出局。",
                    "老板最危险的时候，根本不是没客户。",
                    `${legacyMethod}的老板，${outcome}。`
                  ]
                : [];

  const fallbackCandidates = [
    `${anchor}${verdict}`,
    `${timePhrase}，${anchor}${verdict}`,
    question,
    ...(theme === "platform" || theme === "spiritual" || theme === "celebrity" ? [] : [`${legacyMethod}的老板，${outcome}。`, `${target}，${outcome}。`]),
    `别只看热闹，${anchor}${verdict}`
  ];

  const rawCandidates = [
    ...regulationCandidates,
    ...hotspotDirectCandidates,
    ...themeCandidates,
    ...existingTitles,
    getHookLeadScore(firstSentence) >= 32 ? firstSentence : "",
    ...fallbackCandidates,
    topicCandidate
  ]
    .map((item) => item.replace(/\s+/g, "").replace(/。。+/g, "。").trim())
    .filter(Boolean)
    .filter((item) => {
      if (hookTask.entryType === "hotspot" && !sourceHasDirectBusinessAnchor) {
        if (/(数字IP|数字资产|AI获客|私域|线下死扛的老板|老板最危险的时候|传统拉客户|老板|守旧路|老办法赚钱)/.test(item)) {
          return false;
        }
      }
      if (theme !== "ai") return true;
      return !/(老办法|开始难受|迟早先没客户|根本没客户)/.test(item);
    });

  const uniqueCandidates = Array.from(new Set(rawCandidates)).slice(0, 12);

  return uniqueCandidates
    .map((text, index) => {
      const leadScore = getHookLeadScore(text);
      const riskLevel: RiskLevel = leadScore >= 48 ? "高" : leadScore >= 34 ? "中" : "低";
      return {
        id: createId("hook"),
        text,
        type: inferMockHookType(text),
        platformFit: "视频号优先",
        riskLevel,
        score: Math.max(84, Math.min(99, 72 + leadScore + (index % 3)))
      };
    })
    .sort((left, right) => getHookLeadScore(right.text) - getHookLeadScore(left.text))
    .slice(0, 3);
}

export function buildMockSkeletons(task: TaskForm): SkeletonItem[] {
  if (task.entryType === "viral") {
    const sourceSkeleton = buildSourceCopySkeleton(task);
    const progressionIds = inferProgressionSkeletonIds(task);
    return [sourceSkeleton, ...progressionIds.map((id) => getSkeletonById(id))].filter(
      (item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index
    );
  }

  return inferProgressionSkeletonIds(task).map((id) => getSkeletonById(id));
}

function composeMeatText(bridgeText: string, serviceText: string, actionPrepText: string) {
  return [bridgeText, serviceText, actionPrepText]
    .map((item) => ensureSentence(item))
    .filter(Boolean)
    .join("\n");
}

function createMockMeatItem(config: {
  type: string;
  bridgeText?: string;
  serviceText?: string;
  actionPrepText?: string;
  intensity: BusinessMode;
  smoothnessScore: number;
}): MeatItem {
  const bridgeText = ensureSentence(config.bridgeText || "");
  const serviceText = ensureSentence(config.serviceText || "");
  const actionPrepText = ensureSentence(config.actionPrepText || "");
  return {
    id: createId("meat"),
    type: config.type,
    text: composeMeatText(bridgeText, serviceText, actionPrepText),
    bridgeText,
    serviceText,
    actionPrepText,
    intensity: config.intensity,
    smoothnessScore: config.smoothnessScore
  };
}

interface DraftMeatPlan {
  bridgeLine: string;
  serviceLine: string;
  actionPrepLine: string;
}

function buildDraftMeatPlan(task: TaskForm, meat: MeatItem | null): DraftMeatPlan {
  if (!meat) {
    return {
      bridgeLine: "",
      serviceLine: "",
      actionPrepLine: ""
    };
  }

  const fallbackLines = splitParagraphSentences(meat.text || "")
    .map((item) => tightenBusinessText(item))
    .filter(Boolean);
  const viral = task.entryType === "viral";
  const wrap = (value: string) => {
    if (!value) return "";
    return viral ? shortenAssemblyBusinessLine(value) : ensureSentence(value);
  };

  let bridgeSeed = tightenBusinessText(meat.bridgeText || "");
  let serviceSeed = tightenBusinessText(meat.serviceText || "");
  let actionSeed = tightenBusinessText(meat.actionPrepText || "");

  if (!bridgeSeed && !serviceSeed && !actionSeed) {
    if (fallbackLines.length === 1) {
      if (meat.intensity === "strong") {
        serviceSeed = fallbackLines[0];
      } else {
        bridgeSeed = fallbackLines[0];
      }
    } else {
      bridgeSeed = fallbackLines[0] || "";
      serviceSeed = fallbackLines[1] || "";
      actionSeed = fallbackLines[2] || "";
    }
  }

  return {
    bridgeLine: wrap(bridgeSeed),
    serviceLine: wrap(serviceSeed),
    actionPrepLine: wrap(actionSeed)
  };
}

function applyMeatPlanToParagraphs(paragraphs: string[], steps: SkeletonItem["steps"], meatPlan: DraftMeatPlan) {
  const next = [...paragraphs];
  if (next.length === 0) return next;

  const allowMeatIndexes = steps
    .map((step, index) => (normalizeSkeletonStep(step).allowMeat ? index : -1))
    .filter((index) => index >= 0);
  const clampIndex = (value: number) => Math.max(0, Math.min(next.length - 1, value));
  const firstIndex = clampIndex(allowMeatIndexes[0] ?? Math.max(0, next.length - 2));
  const secondIndex = clampIndex(allowMeatIndexes[1] ?? firstIndex);
  const lastIndex = clampIndex(allowMeatIndexes[allowMeatIndexes.length - 1] ?? Math.max(0, next.length - 1));

  const appendLine = (index: number, line: string) => {
    if (!line) return;
    if (paragraphContainsText(next[index] ?? "", line)) return;
    next[index] = appendSentenceToParagraph(next[index] ?? "", line);
  };

  appendLine(firstIndex, meatPlan.bridgeLine);
  appendLine(secondIndex, meatPlan.serviceLine);
  appendLine(lastIndex, meatPlan.actionPrepLine);

  return next;
}

function buildLegacyMockMeat(task: TaskForm, profile: BaseProfile): MeatItem[] {
  const shared = profile.selfIntro.replace(/。+$/g, "");
  const assetNoun = inferTaskAssetNoun(task, profile);
  const serviceLead = shared ? `${shared}。` : "";
  const theme = inferHookTheme(task);

  const themedItems: MeatItem[] =
    theme === "platform"
      ? [
          {
            id: createId("meat"),
            type: "入口承接型肉",
            text: `这种新入口真正值钱的，是能把流量接成${assetNoun}。`,
            intensity: "light",
            smoothnessScore: 90
          },
          {
            id: createId("meat"),
            type: "结果映射型肉",
            text: "很多老板后面流量越来越稳，不是运气好，是更早把入口变化接成了客户承接。",
            intensity: "light",
            smoothnessScore: 91
          },
          {
            id: createId("meat"),
            type: "服务融入型肉",
            text: `${serviceLead}我们现在做的，就是帮老板把平台流量和客户承接连起来。`,
            intensity: "strong",
            smoothnessScore: 84
          },
          {
            id: createId("meat"),
            type: "信任转化型肉",
            text: "这种内容真正的价值，不是热闹，是先把信任做起来，再让客户来找你。",
            intensity: "light",
            smoothnessScore: 88
          }
        ]
      : theme === "ai"
        ? [
              {
                id: createId("meat"),
                type: "结果诱导型肉",
                text: `真正能赚钱的，是先把AI获客跑成${assetNoun}。`,
                intensity: "light",
                smoothnessScore: 92
              },
            {
                id: createId("meat"),
                type: "服务融入型肉",
                text: "有些老板客户越来越稳，不是突然更会拍了，是更早把AI找客户这条链路装进了公司。",
                intensity: "light",
                smoothnessScore: 91
              },
            {
                id: createId("meat"),
                type: "身份结果型肉",
                text: `${serviceLead}我们现在做的，就是帮老板把AI获客内容链路搭起来。`,
                intensity: "strong",
                smoothnessScore: 84
              },
            {
                id: createId("meat"),
                type: "加深信任型肉",
                text: "AI内容真正的意义，不是多发几条，是先让客户信你，再让客户主动来找你。",
                intensity: "light",
                smoothnessScore: 88
              }
          ]
        : theme === "boss"
          ? [
              {
                id: createId("meat"),
                type: "第二曲线型肉",
                text: `真正值钱的，是把内容和客户承接跑成${assetNoun}。`,
                intensity: "light",
                smoothnessScore: 89
              },
              {
                id: createId("meat"),
                type: "服务融入型肉",
                text: "很多老板后面能稳住盘子，不是突然不焦虑了，是更早把第二增长曲线搭起来了。",
                intensity: "light",
                smoothnessScore: 88
              },
              {
                id: createId("meat"),
                type: "身份结果型肉",
                text: `${serviceLead}我们现在做的，就是帮老板把流量和客户承接提前搭好。`,
                intensity: "strong",
                smoothnessScore: 83
              },
              {
                id: createId("meat"),
                type: "加深信任型肉",
                text: "这种内容真正的作用，是先让客户信你，再让客户顺着内容来找你。",
                intensity: "light",
                smoothnessScore: 87
              }
            ]
          : [];

  const items: MeatItem[] = [
    {
      id: createId("meat"),
      type: "结果诱导型肉",
      text: `真正值钱的，不是再多发几条内容，而是有人能帮你把内容、流量和客户承接真正跑成${assetNoun}。`,
      intensity: "light",
      smoothnessScore: 88
    },
    {
      id: createId("meat"),
      type: "服务融入型肉",
      text: `这也是为什么有些老板客户越来越稳，不是他突然更会说了，而是更早把AI获客、内容成交和客户承接这套链路装进了公司。`,
      intensity: "light",
      smoothnessScore: 90
    },
    {
      id: createId("meat"),
      type: "身份结果型肉",
      text: `${serviceLead}我们现在做的，本质上就是帮老板把这套获客内容链路搭起来，让客户不是刷过就走，而是刷完就想进一步来问。`,
      intensity: "strong",
      smoothnessScore: 82
    },
    {
      id: createId("meat"),
      type: "加深信任型肉",
      text: `如果你手里本来就有产品和服务，这种内容的意义不是热闹，而是先让客户信你，后面自然会想办法来找你。`,
      intensity: "light",
      smoothnessScore: 86
    }
  ];

  const finalItems = themedItems.length > 0 ? themedItems : items;

  return task.businessMode === "none"
    ? finalItems.filter((item) => item.intensity === "light").slice(0, 2)
    : finalItems;
}

export function buildMockMeat(task: TaskForm, profile: BaseProfile): MeatItem[] {
  const shared = profile.selfIntro.replace(/。$/g, "").trim();
  const serviceLead = shared ? `${shared}。` : "";
  const assetNoun = inferTaskAssetNoun(task, profile);
  const theme = inferHookTheme(task);
  const defaultRoleLine = `${serviceLead}我们现在做的，就是帮老板把内容、获客和客户承接这条链路真正搭起来。`;

  const themedItems: MeatItem[] =
    theme === "platform"
      ? [
          createMockMeatItem({
            type: "入口承接型肉",
            bridgeText: `真正值钱的，不是继续追这波热闹，而是把这波入口变化接成自己的${assetNoun}。`,
            serviceText: `${serviceLead}我们现在做的，就是帮老板把平台流量和客户承接接起来。`,
            actionPrepText: "你听到这里如果已经意识到入口老了，后面自然会想找一套能直接落地的做法。",
            intensity: "light",
            smoothnessScore: 92
          }),
          createMockMeatItem({
            type: "结果映射型肉",
            bridgeText: "很多老板后面能稳住，不是运气好，是更早把平台变化接成了自己的承接动作。",
            serviceText: "这不是多发几条的问题，是把流量进来以后怎么留下、怎么转成客户的问题。",
            actionPrepText: "你真想往下做，就一定会需要一套不是拍完就散的链路。",
            intensity: "light",
            smoothnessScore: 90
          }),
          createMockMeatItem({
            type: "服务承接型肉",
            bridgeText: `说到底，平台换入口，最后拼的还是谁先把${assetNoun}搭起来。`,
            serviceText: defaultRoleLine,
            actionPrepText: "所以真正有结果的人，到最后都会来找能把这条链路搭好的团队。",
            intensity: "strong",
            smoothnessScore: 84
          }),
          createMockMeatItem({
            type: "动作铺垫型肉",
            bridgeText: "内容本身不是目的，目的是先把信任和承接顺着内容长出来。",
            serviceText: "用户不是听完一句话就成交，而是在内容里先看到你这里有完整解法。",
            actionPrepText: "这样到最后他才会愿意评论、私信、点主页，而不是把你当广告划走。",
            intensity: "light",
            smoothnessScore: 88
          })
        ]
      : theme === "ai"
        ? [
            createMockMeatItem({
              type: "认知过桥型肉",
              bridgeText: `真正拉开差距的，不是会不会聊 AI，而是能不能把 AI 变成自己的${assetNoun}。`,
              serviceText: "很多老板后面客户越来越稳，不是突然更会拍了，是更早把 AI 获客链路装进公司了。",
              actionPrepText: "所以你听到这里，后面自然会想知道这套东西到底怎么落地。",
              intensity: "light",
              smoothnessScore: 92
            }),
            createMockMeatItem({
              type: "结果承接型肉",
              bridgeText: "AI 的价值，不是替你多写几句，而是把内容、线索和客户承接真正跑起来。",
              serviceText: `${serviceLead}我们现在做的，就是帮老板把 AI 获客这条内容链路搭起来。`,
              actionPrepText: "用户一旦意识到这里面是系统动作，后面就会想进一步来问。",
              intensity: "strong",
              smoothnessScore: 85
            }),
            createMockMeatItem({
              type: "信任沉淀型肉",
              bridgeText: "你不是缺一个新工具，你是缺一套能持续跑结果的动作系统。",
              serviceText: "这也是为什么有的人内容一发完就散，有的人发完以后客户会顺着内容来找。",
              actionPrepText: "后面真要做深，动作位就会很自然，不会突然变成硬卖。",
              intensity: "light",
              smoothnessScore: 89
            })
          ]
        : theme === "boss"
          ? [
              createMockMeatItem({
                type: "第二增长曲线型肉",
                bridgeText: `老板后面真正要拼的，是能不能把内容和客户承接跑成自己的${assetNoun}。`,
                serviceText: "很多老板后面能稳住盘子，不是突然不焦虑了，是更早把第二增长曲线搭起来了。",
                actionPrepText: "所以听到这里的人，后面往往会开始找能替自己搭这条线的做法。",
                intensity: "light",
                smoothnessScore: 90
              }),
              createMockMeatItem({
                type: "服务落地型肉",
                bridgeText: "说白了，老板缺的不是再听一个道理，而是把动作真正接进经营里。",
                serviceText: defaultRoleLine,
                actionPrepText: "只有这层铺平了，最后的评论、私信和主页动作才不会突兀。",
                intensity: "strong",
                smoothnessScore: 84
              }),
              createMockMeatItem({
                type: "信任过桥型肉",
                bridgeText: "内容真正的作用，是先让客户信你，再让客户顺着内容来找你。",
                serviceText: "不是靠一条视频直接成交，而是把后面的承接机会先铺出来。",
                actionPrepText: "这样最后你再收动作，用户才不会反感。",
                intensity: "light",
                smoothnessScore: 88
              })
            ]
          : [
              createMockMeatItem({
                type: "认知桥型肉",
                bridgeText: `真正值钱的，不是只看懂热闹，而是把内容和流量接成自己的${assetNoun}。`,
                serviceText: "很多结果不是突然来的，是前面已经把内容、信任和客户承接接起来了。",
                actionPrepText: "所以后面用户自然会想知道，这套动作到底怎么搭。",
                intensity: "light",
                smoothnessScore: 90
              }),
              createMockMeatItem({
                type: "服务承接型肉",
                bridgeText: "当用户开始把你当成解决方案，而不只是一个观点时，肉才算长出来。",
                serviceText: defaultRoleLine,
                actionPrepText: "铺到这里，最后再收动作，用户就不会觉得突然。",
                intensity: "strong",
                smoothnessScore: 84
              }),
              createMockMeatItem({
                type: "动作铺垫型肉",
                bridgeText: "肉不是突然卖，而是让用户在内容里先意识到你这里有他要的东西。",
                serviceText: "他先听懂你能解决什么，再决定要不要进一步来找你。",
                actionPrepText: "这样转化是顺着内容长出来的，不是硬塞进去的。",
                intensity: "light",
                smoothnessScore: 88
              })
            ];

  if (task.businessMode === "none") {
    return themedItems.filter((item) => item.intensity === "light").slice(0, 2);
  }

  if (task.businessMode === "light") {
    return themedItems.filter((item) => item.intensity !== "strong").slice(0, 3);
  }

  return themedItems;
}

export function buildMockCtas(task: TaskForm, profile: BaseProfile): CtaItem[] {
  const keyword = inferTaskKeyword(task, profile);
  if (task.ctaMode === "none") {
    return [
      {
        id: createId("cta"),
        type: "纯评论流量型",
        text: "如果你也有同样的感受，评论区留下厚德载物。",
        scenario: "纯流量 / 人设 / 认同感"
      },
      {
        id: createId("cta"),
        type: "纯评论流量型",
        text: "如果你也被这句话点醒了，评论区留一句看懂了。",
        scenario: "纯流量 / 认知 / 拉评论"
      },
      {
        id: createId("cta"),
        type: "纯评论流量型",
        text: "如果你也是这样的人，评论区打一个在。",
        scenario: "纯流量 / 筛人 / 低门槛"
      }
    ];
  }

  if (task.ctaMode === "comment") {
    return [
      {
        id: createId("cta"),
        type: "评论666互动型",
        text: "如果你想继续听下去，评论区留个666，我继续往下讲。",
        scenario: "热点 / 强互动 / 拉评论"
      },
      {
        id: createId("cta"),
        type: "评论666互动型",
        text: "这条要不要继续拆？评论区打一排666，我接着讲。",
        scenario: "热点 / 强互动 / 连续内容"
      },
      {
        id: createId("cta"),
        type: "评论666互动型",
        text: "如果你也想让我把这件事讲透，评论区留个666。",
        scenario: "互动 / 连载 / 拉评论"
      }
    ];
  }

  if (task.ctaMode === "keyword") {
    return [
      {
        id: createId("cta"),
        type: "评论关键词领资料型",
        text: buildKeywordLeadText(task, keyword),
        scenario: "趋势 / 数字资产 / AI增长 / 高意向"
      },
      {
        id: createId("cta"),
        type: "评论关键词领资料型",
        text: `如果你也想把这套东西真正跑起来，评论区留${keyword}，我把资料给你。`,
        scenario: "高意向 / 方法资料 / 评论承接"
      },
      {
        id: createId("cta"),
        type: "评论关键词领资料型",
        text: `看懂的人，评论区打${keyword}，我把完整路径发你。`,
        scenario: "关键词筛选 / 高意向"
      }
    ];
  }

  if (task.ctaMode === "profile") {
    return [
      {
        id: createId("cta"),
        type: "评论后主页承接型",
        text: "如果你想看完整打法，先在评论区留一句想学，再去主页看我第一条置顶。",
        scenario: "方法论 / 主页承接 / 半导流"
      },
      {
        id: createId("cta"),
        type: "评论后主页承接型",
        text: "如果你想继续深挖，先评论区打想看，再去主页看置顶那条。",
        scenario: "主页承接 / 评论触发"
      },
      {
        id: createId("cta"),
        type: "评论后主页承接型",
        text: "评论区先留一句想学，主页第一条置顶我已经讲得更透了。",
        scenario: "评论 + 主页置顶"
      }
    ];
  }

  return [
    {
      id: createId("cta"),
      type: "评论后资料承接型",
      text: "如果你真想拿资料，评论区直接打想要，我把完整内容发给你。",
      scenario: "强承接 / 资料发放 / 高意向"
    },
    {
      id: createId("cta"),
      type: "评论后资料承接型",
      text: "有结果需求的，评论区留一句要资料，我把那套方法发你。",
      scenario: "资料承接 / 结果导向"
    },
    {
      id: createId("cta"),
      type: "评论后资料承接型",
      text: "如果你是认真想做的，评论区打想要，我直接把资料给你。",
      scenario: "高意向 / 强承接"
    }
  ];
}

function tightenBusinessText(text: string) {
  return text
    .replace("很多老板其实已经看到了变化，只是还没把这件事系统化。", "很多老板不是没看到，而是一直没把这件事真正跑起来。")
    .replace("说到底，真正拉开差距的，还是你能不能把内容和流量沉淀成自己的", "后面真正能拉开生死线的，是你能不能把内容和流量沉成自己的")
    .replace("这也是为什么这两年有些老板表面看起来没怎么折腾，客户却越来越稳。不是因为运气，而是他们比别人更早把内容增长和获客这套事做成了系统。", "这也是为什么有些老板表面没怎么折腾，客户却越来越稳。不是运气，是他们更早把获客这件事跑成了机器。")
    .replace(/系统化跑起来/g, "狠狠干起来")
    .replace(/系统化/g, "成体系")
    .trim();
}

function buildSectionLabels(skeleton: SkeletonItem) {
  if (skeleton.id === "sk-hotspot") {
    return ["钩子", "事件", "判断", "落点", "收口"];
  }

  if (skeleton.id === "sk-story") {
    return ["钩子", "故事", "反转", "观点", "收口"];
  }

  if (skeleton.id === "sk-teach") {
    return ["钩子", "步骤一", "步骤二", "判断", "收口"];
  }

  return ["钩子", "变化", "判断", "落点", "收口"];
}

function ensureSentence(text: string) {
  const next = text.trim().replace(/[，、；;]+$/g, "").trim();
  if (!next) return "";
  return /[。！？!?]$/.test(next) ? next : `${next}。`;
}

function splitDraftSourceText(text: string) {
  const normalized = text.replace(/\s+/g, "").trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/[。！？!?]/)
    .flatMap((part) => {
      const trimmed = part.trim();
      if (!trimmed) return [];
      if (trimmed.length <= 34) return [trimmed];
      return trimmed.split(/[；;]/).flatMap((piece) => {
        const next = piece.trim();
        if (!next) return [];
        if (next.length <= 34) return [next];
        return next.split(/[，、]/).map((item) => item.trim()).filter((item) => item.length >= 5);
      });
    })
    .map((item) => item.trim())
    .filter((item) => item.length >= 5);

  return Array.from(new Set(sentences));
}

const HOTSPOT_META_ANGLE_PATTERN = /^(这条热点已经能往|这类(?:外部冲击|变化|内容|热点)|适合继续拆成|老板需要提前准备应对动作)/;

function sanitizeHotspotAngleForDraft(value: string) {
  const normalized = cleanDraftBeat(value || "");
  if (!normalized || HOTSPOT_META_ANGLE_PATTERN.test(normalized)) return "";
  return normalized;
}

function buildDraftSourcePool(task: TaskForm, hook: string) {
  const hotspotAngle = task.entryType === "hotspot" ? sanitizeHotspotAngleForDraft(task.hotspotAngle || "") : task.hotspotAngle;
  const sourceText =
    task.entryType === "hotspot"
      ? [task.sourceText, hotspotAngle].filter(Boolean).join("。")
      : task.entryType === "topic"
        ? [task.topicGoal, task.sourceText].filter(Boolean).join("。")
        : task.entryType === "boss_story"
          ? [task.sourceText, task.storyConclusion].filter(Boolean).join("。")
          : [task.sourceText, task.userNote].filter(Boolean).join("。");

  const hookLead = hook.replace(/[？?！!。，“”]/g, "").slice(0, 6);
  const raw = splitDraftSourceText(sourceText).filter((sentence) => {
    const normalized = sentence.replace(/[？?！!。，“”]/g, "");
    if (!normalized) return false;
    if (hookLead && normalized.includes(hookLead) && normalized.length <= 18) return false;
    if (isMarriageTopic(task) && /不结婚真的会很惨吗/.test(normalized)) return false;
    if (/^(补充素材|这条视频想说什么|任务理解|核心观点|切入角度)/.test(normalized)) return false;
    if (/^从.+切入.*落到.+/.test(normalized)) return false;
    if (HOTSPOT_META_ANGLE_PATTERN.test(normalized)) return false;
    if (/^(你等着看吧|先别划走|注意听好|别划走)$/.test(normalized)) return false;
    return true;
  });

  const merged: string[] = [];
  raw.forEach((sentence) => {
    const normalized = sentence.trim();
    if (!normalized) return;
    const last = merged[merged.length - 1] ?? "";
    const mergeBecauseLead = /^(从\d|202\d年|这两天|刚刚|其实|而且|但是|而是|然后|并且|重点是|重点不是|先|再|最后)/.test(normalized);
    const mergeBecauseTooShort = normalized.length <= 8 && last.length <= 18;

    if (merged.length > 0 && (mergeBecauseTooShort || mergeBecauseLead)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}，${normalized}`;
      return;
    }

    if (merged.length > 0 && /^(从\d|202\d年|这两天|刚刚)/.test(merged[merged.length - 1]) && merged[merged.length - 1].length <= 12) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}，${normalized}`;
      return;
    }

    merged.push(normalized);
  });

  return merged;
}

function cleanDraftBeat(text: string) {
  return text
    .replace(/^(其实|而且|但是|然后|所以|另外|还有|还有一个|最后|重点是|重点不是|说白了|我告诉你|我跟你说|讲透|讲清楚|告诉你|记住了|你等着看吧)[，、]?/, "")
    .replace(/\s+/g, "")
    .trim();
}

function shortenDraftBeat(text: string, maxLength = 44) {
  const normalized = cleanDraftBeat(text);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return ensureSentence(normalized);

  const parts = normalized
    .split(/[，、；]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return ensureSentence(normalized);
  }

  let current = "";
  for (const part of parts) {
    const candidate = current ? `${current}，${part}` : part;
    if (candidate.length > maxLength && current) break;
    current = candidate;
  }

  return ensureSentence(current || normalized);
}

function dedupeDraftLines(lines: string[]) {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.replace(/[，。！？!?、\s]/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickDraftSourceBeats(task: TaskForm, hook: string, limit = 6) {
  return dedupeDraftLines(
    buildDraftSourcePool(task, hook)
      .map((item) => shortenDraftBeat(item))
      .filter(Boolean)
  ).slice(0, limit);
}

function buildDraftFallbackBodyLines(
  task: TaskForm,
  skeleton: SkeletonItem,
  theme: HookTheme,
  modifier: string,
  analysis: string
) {
  if (isMarriageTopic(task)) {
    return [analysis, modifier];
  }

  if (skeleton.id === "sk-hotspot") {
    if (theme === "platform") {
      return [
        "这就不是普通活动，而是平台在把人往新入口里导。",
        "谁先盯住这种入口变化，谁后面更容易先吃到流量。"
      ];
    }
    return [modifier, analysis];
  }

  if (skeleton.id === "sk-teach") {
    if (theme === "ai") {
      return [
        "现在最关键的，不是知不知道AI，而是你敢不敢先把AI接进获客。",
        "谁先把这套工具换掉，谁后面的获客成本就更容易先降下来。"
      ];
    }
    return [modifier, analysis];
  }

  if (skeleton.id === "sk-story") {
    return [task.storyConclusion || modifier, analysis];
  }

  if (theme === "celebrity") {
    return [modifier, analysis];
  }

  if (theme === "ai") {
    return [modifier, analysis];
  }

  return [analysis, modifier];
}

function buildDraftTailParagraph(business: string, closeSummary: string, fallback = "") {
  const trimmedBusiness = business.trim();
  const trimmedSummary = closeSummary.trim();
  const trimmedFallback = fallback.trim();

  if (trimmedBusiness && trimmedSummary) {
    return `${ensureSentence(trimmedBusiness)}${ensureSentence(trimmedSummary)}`;
  }

  if (trimmedBusiness) return ensureSentence(trimmedBusiness);
  if (trimmedSummary) return ensureSentence(trimmedSummary);
  return ensureSentence(trimmedFallback);
}

function splitParagraphSentences(paragraph: string) {
  return paragraph.match(/[^。！？!?]+[。！？!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
}

function looksLikeDraftCtaSentence(text: string) {
  return /(评论区|留言|留个|留下|点个小红心|点亮|保存下来|分享给|主页|置顶|看一看|想学|想要|下方这行小字|到我主页)/.test(text);
}

function shortenAssemblyBusinessLine(text: string) {
  const firstSentence = splitParagraphSentences(text)[0]?.trim() ?? text.trim();
  if (!firstSentence) return "";
  if (firstSentence.length <= 36) return ensureSentence(firstSentence);

  const parts = firstSentence
    .replace(/[。！？!?]$/g, "")
    .split(/[，、；]/)
    .map((item) => item.trim())
    .filter(Boolean);

  let current = "";
  for (const part of parts) {
    const candidate = current ? `${current}，${part}` : part;
    if (candidate.length > 36 && current) break;
    current = candidate;
  }

  return ensureSentence(current || firstSentence);
}

function stripTrailingParagraphCta(paragraph: string) {
  return paragraph
    .replace(/，?趁现在还没划走.*$/g, "")
    .replace(/，?只要给这条视频.*$/g, "")
    .replace(/，?评论区.*$/g, "")
    .replace(/，?按照下方这行小字.*$/g, "")
    .replace(/，?到我主页.*$/g, "")
    .trim();
}

function appendSentenceToParagraph(paragraph: string, sentence: string) {
  const base = paragraph.trim();
  const addition = ensureSentence(sentence);
  if (!addition) return base;
  if (!base) return addition;

  const baseKey = base.replace(/[，。！？!?、\s]/g, "");
  const additionKey = addition.replace(/[，。！？!?、\s]/g, "");
  if (baseKey.includes(additionKey) || additionKey.includes(baseKey)) {
    return base;
  }

  const safeBase = /[。！？!?]$/.test(base) ? base : `${base}。`;
  return `${safeBase}${addition}`;
}

function inferBridgeConcept(task: TaskForm) {
  const text = getRelevantTaskText(task);
  if (/数字IP/.test(text)) return "数字IP";
  if (/数字资产/.test(text)) return "数字资产";
  if (/AI获客/.test(text)) return "AI获客链路";
  if (/内容增长|短视频|流量/.test(text)) return "内容获客链路";
  if (/私域|承接/.test(text)) return "客户承接";
  return inferTaskAssetNoun(task, defaultBaseProfile);
}

function buildDraftConceptBridge(task: TaskForm) {
  const theme = inferHookTheme(task);
  const concept = inferBridgeConcept(task);
  const strategy = analyzeTaskStrategy(task);
  const hotspotAngle = sanitizeHotspotAngleForDraft(task.hotspotAngle || "");

  if (task.entryType === "hotspot") {
    if (hotspotAngle) {
      return hotspotAngle;
    }

    if (strategy.hotspotType === "platform_change") {
      return "真正该盯的，不是表面热闹，而是平台动作背后的入口和分发变化。";
    }
    if (strategy.hotspotType === "risk_regulation") {
      return "真正该看的，不是情绪站队，而是这件事在提醒什么边界、代价和后续动作。";
    }
    if (strategy.hotspotType === "external_shock") {
      return "真正会传导到老板身上的，不是新闻标题本身，而是后面的成本、预期和客户动作。";
    }
    if (strategy.hotspotType === "social_heat") {
      return "真正值得拆的，不只是它为什么火，而是这波传播背后到底放大了什么信号。";
    }
    return "真正值得往下拆的，不是表面热度，而是这件事背后的变化和后续动作。";
  }

  if (isMarriageTopic(task)) {
    return "真正能托住一个人后半生的，不只是关系本身，而是你有没有选择权。";
  }

  if (isWealthEvolutionTask(task)) {
    return `说到底，真正值钱的不是你知道多少新词，而是你能不能把流量、内容和信任沉成自己的${concept}。`;
  }

  if (theme === "platform") {
    return `入口一换，真正值钱的，不是继续守在老地方，而是把这波流量接成自己的${concept}。`;
  }

  if (theme === "ai") {
    return `接下来真正拉开差距的，不是会不会聊AI，而是有没有把AI变成自己的${concept}。`;
  }

  if (theme === "boss") {
    return `老板后面拼的，也不只是多开一个店，而是有没有一套能持续发声、持续获客的${concept}。`;
  }

  if (theme === "celebrity") {
    return `说到底，真正变的不是某个职业，而是谁能把注意力沉成自己的长期${concept}。`;
  }

  if (theme === "spiritual") {
    return "说到底，人稳下来之后，才接得住机会，也才守得住关系和福气。";
  }

  if (theme === "asset") {
    return `未来真正值钱的，不是你听过多少新词，而是有没有把信任和流量沉成自己的${concept}。`;
  }

  return `真正要紧的，不是看懂热闹，而是先把能长期留下来的${concept}搭起来。`;
}

function buildLateServiceLine(task: TaskForm, business: string, closeSummary: string) {
  const paragraph = business.trim() ? appendSentenceToParagraph(business, closeSummary) : ensureSentence(closeSummary);
  if (!paragraph) return "";

  if (task.businessMode === "none") {
    return ensureSentence(closeSummary);
  }

  return paragraph;
}

function allocateSourceChunks(sentences: string[], stepCount: number) {
  const total = Math.max(1, stepCount);
  const buckets = Array.from({ length: total }, () => [] as string[]);
  if (sentences.length === 0) {
    return buckets;
  }

  sentences.forEach((sentence, index) => {
    const bucketIndex = Math.min(total - 1, Math.floor((index * total) / sentences.length));
    buckets[bucketIndex].push(sentence);
  });

  return buckets;
}

function chunkToParagraph(sentences: string[], maxSentences = 2) {
  const picked = sentences
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxSentences);

  if (picked.length === 0) return "";
  return picked.map((item) => ensureSentence(item)).join("");
}

function paragraphContainsText(paragraph: string, text: string) {
  const normalizedParagraph = paragraph.replace(/[，。！？!?、\s]/g, "");
  const normalizedText = text.replace(/[，。！？!?、\s]/g, "");
  return normalizedText ? normalizedParagraph.includes(normalizedText) : false;
}

function countParagraphSentences(paragraph: string) {
  return splitParagraphSentences(paragraph).length;
}

function buildOwnerPainParagraph(task: TaskForm) {
  const theme = inferHookTheme(task);

  if (isWealthEvolutionTask(task) || theme === "asset") {
    return "很多老板不是不努力，而是不会把内容、流量和客户沉到自己手里，不会拍、不会写、不会承接，最后只能一直给平台打工。";
  }

  if (theme === "platform") {
    return "很多人不是不知道入口变了，而是知道变了也没有承接动作，最后只能继续在老地方白忙。";
  }

  if (theme === "ai") {
    return "很多老板最卡的不是认不认可AI，而是工具太旧、动作太散，知道要做也跑不成系统。";
  }

  if (theme === "boss") {
    return "很多老板天天很忙，但忙的还是老办法，客户入口变了，动作却还停在过去。";
  }

  return "真正卡住人的，往往不是不努力，而是旧办法已经接不住新的结果。";
}

function buildProofParagraph(task: TaskForm) {
  if (isWealthEvolutionTask(task)) {
    return "为什么有些老板表面没怎么折腾，客户却越来越稳，不是运气好，而是更早把新资源接成了自己的长期资产。";
  }

  const theme = inferHookTheme(task);
  if (theme === "platform") {
    return "真正吃到结果的，往往不是最会讨论的人，而是最早把入口变化接成承接动作的人。";
  }

  if (theme === "ai") {
    return "真正拉开差距的，也不是谁说得最热闹，而是谁先把工具换成了能持续获客的系统。";
  }

  if (theme === "boss") {
    return "最后能跑出来的，往往不是更拼的人，而是更早把新路子系统化的人。";
  }

  return "真正能吃到结果的，往往不是喊得最响的人，而是最早把动作做起来的人。";
}

function buildWealthStepParagraph(
  task: TaskForm,
  step: SkeletonItem["steps"][number],
  conceptBridge: string,
  business: string,
  closeSummary: string
) {
  if (!isWealthEvolutionTask(task)) {
    return "";
  }

  const normalized = normalizeSkeletonStep(step);
  const sourceSentences = splitDraftSourceText(task.sourceText || "");
  const take = (pattern: RegExp) => sourceSentences.find((sentence) => pattern.test(sentence)) || "";
  const agriculture = take(/农业时代/);
  const industry = take(/工业时代/);
  const internet = take(/互联网时代/);
  const digital = take(/数字时代|数字资产|第四次变化/);
  const ownerPain = take(/很多老板不是不努力/);
  const proofLine = buildProofParagraph(task);

  if (normalized.name === "财富阶段展开") {
    return [agriculture, industry, internet, digital, "每一次财富洗牌，本质上都是资源核心在换。"]
      .filter(Boolean)
      .map((item) => ensureSentence(item))
      .join("");
  }

  if (normalized.name === "变现逻辑易位") {
    return [
      "你会发现，先赚到钱的人，从来都不是最辛苦的人，而是最早占住新资源的人。",
      "以前做生意可以靠地段、靠信息差、靠旧入口，后面真正拉开差距的，是谁先把新资源接到自己手里。"
    ]
      .map((item) => ensureSentence(item))
      .join("");
  }

  if (normalized.name === "资产概念重塑") {
    return [
      conceptBridge,
      "对普通老板来说，数字资产不是虚词，而是你能不能持续把内容、流量和客户沉成自己的长期能力。"
    ]
      .map((item) => ensureSentence(item))
      .join("");
  }

  if (normalized.name === "经营困局剖析") {
    return [
      ownerPain && ownerPain.length > 10 ? ownerPain : "很多老板不是不努力，而是努力还停在旧工具和旧动作上。",
      "不会拍、不会写、不懂规则，明明知道线上重要，却一直没有一套稳定跑内容和承接的动作，这才是最真实的卡点。"
    ]
      .map((item) => ensureSentence(item))
      .join("");
  }

  if (normalized.name === "AI解法桥") {
    return ["现在真正聪明的做法，不是继续用人力硬扛，而是让AI把内容、分发和获客这条链路先跑起来。", business]
      .filter(Boolean)
      .map((item) => ensureSentence(item))
      .join("");
  }

  if (normalized.name === "结果压实") {
    return [proofLine, closeSummary]
      .filter(Boolean)
      .map((item) => ensureSentence(item))
      .join("");
  }

  return "";
}

function buildStepFallbackLines(
  task: TaskForm,
  step: SkeletonItem["steps"][number],
  modifier: string,
  analysis: string,
  conceptBridge: string,
  business: string,
  closeSummary: string
) {
  const normalized = normalizeSkeletonStep(step);
  const hotspotAngle = task.entryType === "hotspot" ? sanitizeHotspotAngleForDraft(task.hotspotAngle || "") : "";
  const ownerPain = buildOwnerPainParagraph(task);
  const proofLine = buildProofParagraph(task);
  const stepName = normalized.name;

  if (normalized.role === "conflict") {
    return [extractFirstSentence(task.sourceText), modifier, analysis];
  }

  if (normalized.role === "event") {
    return [extractFirstSentence(task.sourceText), modifier, analysis];
  }

  if (normalized.role === "suspense") {
    return [
      "真正要紧的，从来不是表面那一下，而是后面会连续动很多东西。",
      "所以别急着下结论，后面这几层才是重点。"
    ];
  }

  if (normalized.role === "mapping") {
    if (/财富阶段|阶段展开/.test(stepName)) {
      return [modifier, analysis, "每一次资源更替，本质上都是财富分配规则在换。"];
    }
    return [hotspotAngle || modifier, analysis, closeSummary];
  }

  if (normalized.role === "risk") {
    return [modifier, closeSummary, analysis];
  }

  if (normalized.role === "reason") {
    if (/逻辑易位/.test(stepName)) {
      return [analysis, "以前拼的是旧入口，后面拼的是谁先占住新资源。", conceptBridge];
    }
    return [analysis, hotspotAngle || conceptBridge, closeSummary];
  }

  if (normalized.role === "bridge") {
    return [hotspotAngle || conceptBridge, analysis, ownerPain];
  }

  if (normalized.role === "identity") {
    return [ownerPain, analysis, closeSummary];
  }

  if (normalized.role === "solution") {
    return business ? [conceptBridge, business, proofLine] : [conceptBridge, proofLine, closeSummary];
  }

  if (normalized.role === "proof") {
    return business && normalized.allowMeat ? [proofLine, business, closeSummary] : [proofLine, closeSummary, analysis];
  }

  if (normalized.role === "reversal") {
    return [task.storyConclusion || analysis, proofLine, closeSummary];
  }

  if (normalized.role === "payoff") {
    return [modifier, analysis, closeSummary];
  }

  if (normalized.role === "landing") {
    return normalized.allowMeat && business ? [business, closeSummary, proofLine] : [closeSummary, proofLine, hotspotAngle || analysis];
  }

  return [modifier, analysis, conceptBridge, closeSummary];
}

function buildProgressionParagraph(
  task: TaskForm,
  step: SkeletonItem["steps"][number],
  sourceChunk: string[],
  modifier: string,
  analysis: string,
  conceptBridge: string,
  business: string,
  closeSummary: string
) {
  const normalizedStep = normalizeSkeletonStep(step);
  const minSentences = normalizedStep.minSentences ?? 2;
  const allowMeat = normalizedStep.allowMeat ?? false;
  const requireSource = normalizedStep.requireSource ?? false;
  const wealthParagraph = buildWealthStepParagraph(task, normalizedStep, conceptBridge, business, closeSummary);
  if (wealthParagraph) {
    return wealthParagraph;
  }
  let paragraph = chunkToParagraph(sourceChunk, requireSource ? Math.max(1, minSentences - 1) : 2);

  const add = (text: string) => {
    if (!text) return;
    if (!allowMeat && text === business) return;
    paragraph = appendSentenceToParagraph(paragraph, text);
  };

  const candidates = buildStepFallbackLines(task, normalizedStep, modifier, analysis, conceptBridge, business, closeSummary);
  for (const candidate of candidates) {
    if (countParagraphSentences(paragraph) >= minSentences) break;
    if (!candidate) continue;
    if (paragraphContainsText(paragraph, candidate)) continue;
    add(candidate);
  }

  if (allowMeat && business && !paragraphContainsText(paragraph, business) && countParagraphSentences(paragraph) < minSentences + 1) {
    add(business);
  }

  if (!paragraph) {
    paragraph = allowMeat ? buildLateServiceLine(task, business, closeSummary) : ensureSentence(modifier || analysis || closeSummary);
  }

  if (countParagraphSentences(paragraph) < minSentences && !paragraphContainsText(paragraph, closeSummary)) {
    add(closeSummary);
  }

  if (countParagraphSentences(paragraph) < minSentences && !paragraphContainsText(paragraph, normalizedStep.bridgeToNext || "")) {
    add(normalizedStep.bridgeToNext || "");
  }

  return paragraph;
}

function looksLikeBusinessParagraph(text: string) {
  return /(我们现在做的|帮老板|AI获客|内容链路|客户承接|系统|账号|AI员工|发号施令|方法发给你|进一步来问)/.test(text);
}

function buildViralDraftParagraphs(task: TaskForm, skeleton: SkeletonItem, meatPlan: DraftMeatPlan) {
  const sourceParagraphs = splitSourceParagraphs(task.sourceText || task.userNote);
  if (sourceParagraphs.length === 0) {
    return [];
  }

  const bodyParagraphs = sourceParagraphs
    .map((paragraph, index) => {
      const sentences = splitParagraphSentences(paragraph);
      if (sentences.length === 0) return "";

      if (index === 0) {
        return sentences.slice(1).join("").trim();
      }

      if (index === sourceParagraphs.length - 1) {
        return stripTrailingParagraphCta(paragraph);
      }

      return paragraph.trim();
    })
    .filter(Boolean);

  const normalizedSteps = skeleton.steps.length > 0 ? skeleton.steps : buildSourceCopySkeleton(task).steps;
  const cleaned = dedupeDraftLines(
    bodyParagraphs
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => ensureSentence(item))
  );
  return applyMeatPlanToParagraphs(cleaned, normalizedSteps, meatPlan);
}

function buildDraftAnalysis(task: TaskForm) {
  const theme = inferHookTheme(task);
  const strategy = analyzeTaskStrategy(task);

  if (task.entryType === "hotspot") {
    if (strategy.hotspotType === "platform_change") {
      return "平台每一次动作都不是随便试试，它改的往往是下一波流量入口和老板动作。";
    }
    if (strategy.hotspotType === "risk_regulation") {
      return "这类热点真正值钱的，不是跟着情绪下判断，而是先把具体边界、对象和代价看清。";
    }
    if (strategy.hotspotType === "external_shock") {
      return "外部变化一旦开打，真正会先传到老板身上的，通常都是成本、节奏和客户预期。";
    }
    if (strategy.hotspotType === "social_heat") {
      return "真正该拆的，不只是这件事为什么火，而是它放大的传播机制和后续动作。";
    }
    return "真正要紧的，不是把热点讲成道理，而是把它背后的变化、代价和动作拆清楚。";
  }

  if (isMarriageTopic(task)) {
    return "真正能托住晚年生活的，从来不只是婚姻，而是你的钱、身体和选择权。";
  }

  if (isWealthEvolutionTask(task)) {
    return "每一次财富洗牌，真正变的都不是口号，而是资源核心和变现逻辑本身。";
  }

  if (theme === "celebrity") {
    return "最尴尬的不是没机会，而是机会摆在眼前，很多人自己放不下旧身段。";
  }

  if (theme === "asset") {
    return "未来真正值钱的，不是你听过多少新词，而是你有没有把信任和流量沉成自己的资产。";
  }

  if (theme === "ai") {
    return "后面还能不能低成本拿客户，关键不是你今天多努力，而是你有没有把工具先换掉。";
  }

  if (theme === "platform") {
    return "平台每一次动作都不是随便试试，它真正改的，往往是下一波流量入口。";
  }

  if (theme === "spiritual") {
    return "很多人以为这是鸡汤，真到关键时刻才会发现，一个人稳不稳，真的会决定他能不能接住机会。";
  }

  if (theme === "boss") {
    return "老板真正输的，从来不是今天少赚一点，而是规则已经变了，你还舍不得换路。";
  }

  return "真正拉开差距的，往往不是谁知道得多，而是谁更早看懂变化，开始动。";
}

function buildDraftBusinessLine(task: TaskForm, meat: MeatItem | null) {
  if (!meat) {
    return "";
  }

  const tightened = tightenBusinessText(meat.text);
  if (task.entryType === "viral") {
    return shortenAssemblyBusinessLine(tightened);
  }
  return ensureSentence(tightened);
}

function buildDraftCloseSummary(task: TaskForm) {
  const theme = inferHookTheme(task);

  if (isMarriageTopic(task)) {
    return "这件事越早想明白，后面越不容易被焦虑绑着走。";
  }

  if (isWealthEvolutionTask(task)) {
    return "真正值钱的，不是继续守着旧办法，而是尽快把新资源接成自己的长期资产。";
  }

  if (theme === "celebrity") {
    return "人最怕的不是没风口，而是风口变了，自己还端着。";
  }

  if (theme === "platform") {
    return "入口一换，最先吃亏的就是还在老地方等流量的人。";
  }

  if (theme === "ai") {
    return "再不换工具，后面不是多花一点钱，是连客户入口都摸不到。";
  }

  if (theme === "spiritual") {
    return "一个人心稳不稳，到最后真的会决定他能不能把福气留住。";
  }

  if (theme === "boss") {
    return "路已经变了，老板慢半拍，很多时候都是真金白银。";
  }

  return "真正的差距，往往都是在别人还没反应过来的时候拉开的。";
}

function versionModifier(versionName: DraftItem["versionName"], task: TaskForm) {
  if (isMarriageTopic(task)) {
    if (versionName === "激进版") return "很多人把婚姻想成唯一答案，结果先把自己吓住了。";
    if (versionName === "判决版") return "结论很直接，拿婚姻当唯一保障，本身就不稳。";
    if (versionName === "更口语版") return "说白了，你怕的不是不结婚，你怕的是没人兜底。";
    if (versionName === "更像老板讲话版") return "我更愿意把这件事看成一笔长期配置，不是情绪决定，是现实决定。";
    return "很多人被这件事吓住，其实是把一种活法误当成了唯一活法。";
  }

  const theme = inferHookTheme(task);
  if (isWealthEvolutionTask(task)) {
    if (versionName === "激进版") return "很多人不是没听懂趋势，是听懂了也还在旧资源里打转。";
    if (versionName === "判决版") return "结论很直接，财富规则一换，守旧的人最先掉队。";
    if (versionName === "更口语版") return "说白了，时代都换资源了，你还拿老办法挣钱，肯定累。";
    if (versionName === "更像老板讲话版") return "我看这种变化很现实，资源一换，变现逻辑和经营动作就得一起换。";
    return "每一轮大变化，先吃到结果的，从来都不是最辛苦的人，而是最早占住新资源的人。";
  }

  if (theme === "celebrity") {
    if (versionName === "激进版") return "真正难的不是行业变了，是很多人知道变了还放不下身段。";
    if (versionName === "判决版") return "结论很直接，旧流量饭已经没有以前那么好吃了。";
    if (versionName === "更口语版") return "说白了，机会就在那儿，可有人就是拉不下脸。";
    if (versionName === "更像老板讲话版") return "我看这种事很简单，入口一换，成本一高，原来的打法就不成立了。";
    return "这碗饭最难的地方，从来不是竞争，而是旧逻辑已经接不住新机会了。";
  }

  if (theme === "platform") {
    if (versionName === "激进版") return "很多人只会盯着活动两个字，却没看见平台正在挪入口。";
    if (versionName === "判决版") return "结论很直接，谁看不懂平台动作，谁后面就更被动。";
    if (versionName === "更口语版") return "说白了，热闹不重要，入口在哪儿才重要。";
    if (versionName === "更像老板讲话版") return "我做判断先看平台把人往哪儿推，因为那才是后面的生意口子。";
    return "真正值得注意的，从来不是表面热闹，而是平台在把人和流量往哪边引。";
  }

  if (theme === "ai") {
    if (versionName === "激进版") return "很多老板不是没听过AI，是听过了还舍不得换工具。";
    if (versionName === "判决版") return "结论很直接，客户入口已经变了，老办法接不住了。";
    if (versionName === "更口语版") return "说白了，客户不是没有了，是你还在老地方找。";
    if (versionName === "更像老板讲话版") return "我看这件事很现实，谁先把工具换掉，谁后面的成本就更低。";
    return "现在最残酷的地方，不是客户少了，而是客户入口已经换了。";
  }

  if (theme === "spiritual") {
    if (versionName === "激进版") return "很多人吃亏，真不是能力差，是心一乱，什么都接不住。";
    if (versionName === "判决版") return "结论很直接，心不稳的人，大机会来了也抓不住。";
    if (versionName === "更口语版") return "说白了，修行最后修的不是形式，是一个人稳不稳。";
    if (versionName === "更像老板讲话版") return "我更看重一个人的底层稳定性，因为关键时刻那决定结果。";
    return "真正拉开人和人差距的，很多时候不是聪明，而是稳定。";
  }

  if (theme === "boss") {
    if (versionName === "激进版") return "很多老板最后出问题，不是能力不行，是明明看到变化还硬扛。";
    if (versionName === "判决版") return "结论很直接，旧路扛得越久，后面代价越大。";
    if (versionName === "更口语版") return "说白了，路都变了，你还拿老办法拼，肯定累。";
    if (versionName === "更像老板讲话版") return "我做生意只看一件事，这条路还值不值得继续重压。";
    return "老板最危险的时候，往往不是没努力，而是努力方向还没换。";
  }

  return versionName === "激进版"
    ? "我把话说重点，这种变化不是提醒，是洗牌。"
    : versionName === "判决版"
      ? "结论很直接，后面比的就是谁动得更早。"
      : versionName === "更口语版"
        ? "说白了，这事没那么复杂，就是你换不换。"
        : versionName === "更像老板讲话版"
          ? "我看这种事很现实，方向一变，动作就得立刻跟上。"
          : "很多时候，真正要紧的不是知道，而是开始动。";
}

function buildDraftBodyParagraphs(
  task: TaskForm,
  skeleton: SkeletonItem,
  _topic: string,
  modifier: string,
  analysis: string,
  meatPlan: DraftMeatPlan,
  closeSummary: string,
  hook: HookItem
) {
  const desiredCount = Math.max(4, Math.min(skeleton.steps.length, 6));
  const sourcePool = buildDraftSourcePool(task, hook.text).slice(0, 12);
  const sourceChunks = allocateSourceChunks(sourcePool, desiredCount);
  const conceptBridge = buildDraftConceptBridge(task);
  const normalizedSteps = skeleton.steps.slice(0, desiredCount).map((step) => normalizeSkeletonStep(step));

  const bodyParagraphs = normalizedSteps.map((step, index) =>
    buildProgressionParagraph(
      task,
      step,
      sourceChunks[index] ?? [],
      ensureSentence(modifier),
      ensureSentence(analysis),
      ensureSentence(conceptBridge),
      "",
      ensureSentence(closeSummary)
    )
  );

  const cleaned = dedupeDraftLines(
    bodyParagraphs
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => ensureSentence(item))
  );
  const withMeat = applyMeatPlanToParagraphs(cleaned, normalizedSteps, meatPlan);

  if (ensureSentence(closeSummary) && !withMeat.some((item) => paragraphContainsText(item, closeSummary))) {
    const lastIndex = Math.max(0, withMeat.length - 1);
    withMeat[lastIndex] = appendSentenceToParagraph(withMeat[lastIndex] ?? "", closeSummary);
  }

  return withMeat.slice(0, desiredCount);
}

function buildDraftTitle(task: TaskForm, topic: string, versionName: DraftItem["versionName"]) {
  if (containsWarShock(task)) {
    if (versionName === "激进版") return "这场变化不是新闻，是给老板的风险判决";
    if (versionName === "判决版") return "把安全感全押在线下的人，后面最危险";
    if (versionName === "更像老板讲话版") return "路已经变了，老板再慢半拍就晚了";
    return `${topic}这件事，正在狠狠干醒一批老板`;
  }

  if (versionName === "激进版") return `${topic}这件事，会先清掉一批人`;
  if (versionName === "判决版") return `看不懂${topic}的人，后面一定难受`;
  if (versionName === "更口语版") return `${topic}来了，别再当热闹看`;
  if (versionName === "更像老板讲话版") return `老板再慢半拍，${topic}这波就轮不到你`;
  return `${topic}不是机会消息，是洗牌通知`;
}

function formatStructuredScript(sections: Array<{ label: string; content: string }>) {
  return sections
    .filter((item) => item.content.trim())
    .map((item) => `【${item.label}】${item.content.trim()}`)
    .join("\n\n");
}

function buildDraftSections(
  task: TaskForm,
  skeleton: SkeletonItem,
  topic: string,
  hook: HookItem,
  modifier: string,
  analysis: string,
  business: string,
  closeSummary: string,
  closer: string
) {
  const labels = buildSectionLabels(skeleton);

  if (skeleton.id === "sk-hotspot") {
    const eventTitle = extractFirstSentence(task.sourceText) || `${topic}突发变化`;
    const angle = task.hotspotAngle || "从普通人资产焦虑切入，再落到数字资产和 AI 获客";
    return [
      { label: labels[0] ?? "爆点", content: hook.text },
      {
        label: labels[1] ?? "事件",
        content: `${eventTitle}。这不是给你看热闹的，是在告诉所有做生意的人：外部变量一旦开打，先碎的就是你以为最稳的安全感。`
      },
      {
        label: labels[2] ?? "判断",
        content: containsWarShock(task)
          ? "真正该被炸醒的，不是刷新闻的人，而是那些把资产、客户和退路全押在线下的人。"
          : modifier
      },
      {
        label: labels[3] ?? "落点",
        content: `${angle}。${analysis}${business ? ` ${business}` : ""}`
      },
      { label: labels[4] ?? "互动", content: closer }
    ];
  }

  if (skeleton.id === "sk-story") {
    return [
      { label: labels[0] ?? "钩子", content: hook.text },
      {
        label: labels[1] ?? "故事",
        content: "很多人只看到老板今天还站得住，却看不到他早就先被现实狠狠干醒过。门店会关，现金会卡，客户也会突然少掉。"
      },
      { label: labels[2] ?? "反转", content: modifier },
      {
        label: labels[3] ?? "观点",
        content: `${analysis}${business ? ` ${business}` : ""} ${closeSummary}`.trim()
      },
      { label: labels[4] ?? "收口", content: closer }
    ];
  }

  if (skeleton.id === "sk-teach") {
    return [
      { label: labels[0] ?? "钩子", content: hook.text },
      {
        label: labels[1] ?? "步骤一",
        content: `第一步，别把${topic}当热闹，你先看清它到底会先淘汰掉哪一批旧玩法。`
      },
      {
        label: labels[2] ?? "步骤二",
        content: "第二步，把内容、流量和信任沉到自己手里，不要把命全押在平台和运气上。"
      },
      {
        label: labels[3] ?? "判断",
        content: `${modifier}${business ? ` ${business}` : ""} ${closeSummary}`.trim()
      },
      { label: labels[4] ?? "收口", content: closer }
    ];
  }

  return [
    { label: labels[0] ?? "钩子", content: hook.text },
    {
      label: labels[1] ?? "变化",
      content: `${topic}不是一个新名词，它是在告诉你：旧办法还在硬撑，但旧红利已经没了。`
    },
    { label: labels[2] ?? "判断", content: modifier },
    {
      label: labels[3] ?? "落点",
      content: `${analysis}${business ? ` ${business}` : ""} ${closeSummary}`.trim()
    },
    { label: labels[4] ?? "收口", content: closer }
  ];
}

export function buildMockDrafts(
  task: TaskForm,
  profile: BaseProfile,
  hook: HookItem,
  skeleton: SkeletonItem,
  meat: MeatItem | null,
  cta: CtaItem
): DraftItem[] {
  const versions = ["标准版", "激进版", "判决版", "更口语版", "更像老板讲话版"] as const;
  const topic = extractCoreTerm(task);
  const closeSummary = buildDraftCloseSummary(task);

  return versions.map((versionName) => {
    const header = hook.text;
    const analysis = buildDraftAnalysis(task);
    const meatPlan = buildDraftMeatPlan(task, meat);
    const closer = cta.text;
    const modifier = versionModifier(versionName, task);
    const bodyParagraphs =
      task.entryType === "viral"
        ? buildViralDraftParagraphs(task, skeleton, meatPlan)
        : buildDraftBodyParagraphs(task, skeleton, topic, modifier, analysis, meatPlan, closeSummary, hook);
    const script = task.entryType === "viral" ? [hook.text, ...bodyParagraphs, closer].join("\n\n") : [hook.text, ...bodyParagraphs, closer].join("\n\n");

    return {
      id: createId("draft"),
      versionName,
      title: buildDraftTitle(task, topic, versionName),
      coverLine: header,
      script,
      subtitleScript: script
        .replace(/([。！？])/g, "$1\n")
        .replace(/\n{2,}/g, "\n")
        .trim(),
      selectedHookId: hook.id,
      selectedSkeletonId: skeleton.id,
      selectedMeatId: meat?.id ?? null,
      selectedCtaId: cta.id,
      platformFit: "视频号优先"
    };
  });
}

export function buildMockScore(draft: DraftItem, task: TaskForm): ScoreCard {
  const softPatterns = [/说到底/, /真正拉开差距/, /很多老板其实/, /你可以现在还没全做/, /先别急着卖/];
  const aiPenalty = draft.script.includes("系统化") ? 8 : 0;
  const softPenalty = softPatterns.filter((pattern) => pattern.test(draft.script)).length * 4;
  const hookBoost = draft.versionName === "激进版" || draft.versionName === "判决版" ? 4 : 0;
  const total = Math.max(70, 88 + hookBoost - aiPenalty - softPenalty);

  return {
    totalScore: total,
    summary: total >= 85 ? "当前版本够硬，可以直接进审核。" : "当前版本能用，但中段还可以更狠一点。",
    dimensions: [
      { label: "皮的强度", score: 84 + hookBoost },
      { label: "前三秒停留感", score: 80 + hookBoost },
      { label: "骨架流畅度", score: 88 },
      { label: "肉的丝滑度", score: task.businessMode === "none" ? 88 : 76 },
      { label: "导流清晰度", score: task.ctaMode === "none" ? 80 : 84 },
      { label: "平台适配度", score: 85 },
      { label: "风险控制", score: 78 },
      { label: "AI味控制", score: Math.max(62, 80 - aiPenalty - softPenalty) }
    ],
    issues: [
      task.businessMode === "strong" ? "业务露出要继续后移，避免观众刚进来就闻到卖感。" : "中段如果出现空判断，停留会掉得很快。",
      "结尾动作虽然清楚，但最好继续只保留一个动作。",
      "如果是热点内容，事实表达别讲太满。"
    ],
    suggestions: [
      "优先保留现在的爆皮，只动中段和收口。",
      "少用空词，多补对象、后果、代价。",
      "业务表达尽量写成结果，不要写成介绍。"
    ],
    replaceLines: [
      "把“系统化跑起来”改成“狠狠干起来”。",
      "把“真正拉开差距的”改成“后面先死的是谁”。",
      "把“先别急着卖”改成“先把评论区打起来”。"
    ]
  };
}

export const defaultTemplates: TemplateItem[] = [
  {
    id: createId("tpl"),
    type: "皮模板",
    scene: "趋势",
    title: "巨变预警型",
    content: "数字资产会淘汰99%的人。",
    tags: ["趋势", "高停留", "视频号"],
    useCount: 18
  },
  {
    id: createId("tpl"),
    type: "骨架模板",
    scene: "趋势",
    title: "趋势认知骨架",
    content: "爆点 -> 变化 -> 原因 -> 机会 -> 收口",
    tags: ["认知", "财富", "AI"],
    useCount: 13
  },
  {
    id: createId("tpl"),
    type: "肉模板",
    scene: "AI增长",
    title: "轻导流肉",
    content: "真正能抓住这波机会的，不是刷得更勤，而是更早把流量沉淀成自己的资产。",
    tags: ["轻肉", "丝滑", "数字资产"],
    useCount: 9
  },
  {
    id: createId("tpl"),
    type: "收口模板",
    scene: "关键词",
    title: "留关键词收口",
    content: "如果你也想知道怎么把流量真正沉淀下来，评论区打数字资产，我把方法发给你。",
    tags: ["关键词", "互动", "承接"],
    useCount: 23
  },
  // 移除战争模板
  {
    id: createId("tpl"),
    type: "皮模板",
    scene: "数字经济",
    title: "趋势预警型",
    content: "数字经济这件事出来，很多老板后背都凉了，真的没准备好。",
    tags: ["趋势", "数字资产", "老板焦虑"],
    useCount: 31
  },
  {
    id: createId("tpl"),
    type: "皮模板",
    scene: "资产焦虑",
    title: "安全感错觉型",
    content: "最先被打穿的，不是资产，是你对安全感的错觉。",
    tags: ["焦虑", "资产", "爆皮"],
    useCount: 27
  },
  {
    id: createId("tpl"),
    type: "皮模板",
    scene: "老板判断",
    title: "旧逻辑失效型",
    content: "旧逻辑已经死了，还在死磕的人会一起陪葬。",
    tags: ["老板", "判断", "高停留"],
    useCount: 34
  },
  {
    id: createId("tpl"),
    type: "皮模板",
    scene: "AI获客",
    title: "获客清场型",
    content: "再不做AI获客，你输的可能不是流量，是整个未来三年的客户入口。",
    tags: ["AI获客", "客户", "清场"],
    useCount: 29
  },
  {
    id: createId("tpl"),
    type: "收口模板",
    scene: "纯评论流量",
    title: "纯评论认同收口",
    content: "如果你也是这样想的，评论区留下厚德载物。",
    tags: ["评论", "纯流量", "认同"],
    useCount: 18
  },
  {
    id: createId("tpl"),
    type: "收口模板",
    scene: "评论666",
    title: "评论666收口",
    content: "如果你想我继续往下拆，评论区留个666。",
    tags: ["评论", "666", "互动"],
    useCount: 22
  },
  {
    id: createId("tpl"),
    type: "收口模板",
    scene: "评论领资料",
    title: "评论关键词领资料",
    content: "如果你也想拿这套方法，评论区打AI获客，我发给你。",
    tags: ["评论", "关键词", "资料"],
    useCount: 25
  }
];

export const defaultHistory: HistoryItem[] = [
  {
    id: createId("his"),
    entryType: "viral",
    businessMode: "light",
    ctaMode: "keyword",
    createdAt: new Date().toISOString(),
    snapshot: { ...defaultTask },
    workspace: null
  },
  {
    id: createId("his"),
    entryType: "boss_story",
    businessMode: "none",
    ctaMode: "comment",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    snapshot: {
      ...defaultTask,
      entryType: "boss_story",
      sourceText:
        "我曾经特别看重的一个员工，把账上的钱全部转走了。很多人都在劝我把他送进去，但我最后没有这么做。",
      storyConclusion: "高维度解决问题，很多时候比硬碰硬更有结果。",
      businessMode: "none",
      ctaMode: "comment"
    },
    workspace: null
  }
];

export function displayEntryType(entryType: EntryType) {
  return typeLabelMap[entryType];
}

export function displayBusinessMode(mode: BusinessMode) {
  return businessLabelMap[mode];
}

export function displayCtaMode(mode: CtaMode) {
  return ctaLabelMap[mode];
}
