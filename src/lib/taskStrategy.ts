import type { BridgeStrength, BusinessMode, HotspotType, TaskForm, TaskStrategy } from "../types";
import { AI_KEYWORDS, AGGREGATE_KEYWORDS, BUSINESS_KEYWORDS, MACRO_KEYWORDS, PLATFORM_KEYWORDS, REGULATION_KEYWORDS, SOCIAL_HEAT_KEYWORDS, WEALTH_KEYWORDS } from "./keywords";

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function splitFacts(text: string) {
  return cleanText(text)
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 6)
    .slice(0, 6);
}

function containsAnyKeyword(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function capBusinessMode(requested: BusinessMode, allowed: BusinessMode): BusinessMode {
  const rank: Record<BusinessMode, number> = { none: 0, light: 1, strong: 2 };
  return rank[requested] <= rank[allowed] ? requested : allowed;
}

function deriveRelevantText(task: TaskForm) {
  if (task.entryType === "hotspot") {
    return cleanText([task.sourceText, task.hotspotAngle].filter(Boolean).join("。"));
  }
  if (task.entryType === "topic") {
    return cleanText([task.topicGoal, task.sourceText].filter(Boolean).join("。"));
  }
  if (task.entryType === "boss_story") {
    return cleanText([task.sourceText, task.storyConclusion].filter(Boolean).join("。"));
  }
  return cleanText([task.sourceText, task.userNote].filter(Boolean).join("。"));
}

function pickHotspotType(task: TaskForm, text: string): HotspotType {
  if (task.entryType === "viral") return "generic";
  if (WEALTH_KEYWORDS.test(text)) return "trend_shift";
  if (task.entryType === "hotspot" && AGGREGATE_KEYWORDS.test(text)) return "mixed_digest";
  if (AI_KEYWORDS.test(text) && REGULATION_KEYWORDS.test(text)) return "risk_regulation";
  if (REGULATION_KEYWORDS.test(text) && /(平台|司机|权益|行业|代表|委员|节目)/.test(text)) return "risk_regulation";
  if (PLATFORM_KEYWORDS.test(text)) return "platform_change";
  if (MACRO_KEYWORDS.test(text)) return "external_shock";
  if (SOCIAL_HEAT_KEYWORDS.test(text)) return "social_heat";
  if (task.entryType === "topic") return "trend_shift";
  return "generic";
}

function getTypeLabel(type: HotspotType) {
  if (type === "risk_regulation") return "风险 / 监管型";
  if (type === "platform_change") return "平台 / 入口型";
  if (type === "external_shock") return "外部冲击型";
  if (type === "social_heat") return "传播热议型";
  if (type === "mixed_digest") return "盘点混合型";
  if (type === "trend_shift") return "趋势认知型";
  return "通用型";
}

function getBridgeStrengthLabel(strength: BridgeStrength) {
  if (strength === "strong") return "强桥接";
  if (strength === "medium") return "中桥接";
  if (strength === "weak") return "弱桥接";
  return "不桥接";
}

function inferAllowedBusinessMode(task: TaskForm, type: HotspotType, relevantText: string): { bridgeStrength: BridgeStrength; allowedBusinessMode: BusinessMode } {
  const hasBusinessAnchor = BUSINESS_KEYWORDS.test(relevantText) || BUSINESS_KEYWORDS.test(task.hotspotAngle || "");

  if (task.entryType === "viral") {
    return { bridgeStrength: hasBusinessAnchor ? "strong" : "medium", allowedBusinessMode: task.businessMode };
  }

  if (type === "risk_regulation") {
    return {
      bridgeStrength: AI_KEYWORDS.test(relevantText) ? "medium" : "weak",
      allowedBusinessMode: capBusinessMode(task.businessMode, "light")
    };
  }

  if (type === "platform_change") {
    return {
      bridgeStrength: hasBusinessAnchor ? "strong" : "medium",
      allowedBusinessMode: capBusinessMode(task.businessMode, hasBusinessAnchor ? "strong" : "light")
    };
  }

  if (type === "external_shock") {
    return {
      bridgeStrength: /(企业|老板|经营|成本|外贸|获客|流量)/.test(relevantText) ? "medium" : "weak",
      allowedBusinessMode: capBusinessMode(task.businessMode, "light")
    };
  }

  if (type === "social_heat") {
    return {
      bridgeStrength: hasBusinessAnchor ? "medium" : "weak",
      allowedBusinessMode: capBusinessMode(task.businessMode, "light")
    };
  }

  if (type === "mixed_digest") {
    return {
      bridgeStrength: "weak",
      allowedBusinessMode: capBusinessMode(task.businessMode, "none")
    };
  }

  if (type === "trend_shift") {
    return {
      bridgeStrength: hasBusinessAnchor || task.entryType === "topic" ? "strong" : "medium",
      allowedBusinessMode: capBusinessMode(task.businessMode, hasBusinessAnchor || task.entryType === "topic" ? "strong" : "light")
    };
  }

  if (task.entryType === "boss_story") {
    return { bridgeStrength: "medium", allowedBusinessMode: capBusinessMode(task.businessMode, "light") };
  }

  if (task.entryType === "topic") {
    return { bridgeStrength: hasBusinessAnchor ? "strong" : "medium", allowedBusinessMode: capBusinessMode(task.businessMode, "light") };
  }

  return { bridgeStrength: hasBusinessAnchor ? "medium" : "weak", allowedBusinessMode: capBusinessMode(task.businessMode, "light") };
}

function buildStrategyDetails(task: TaskForm, type: HotspotType, relevantText: string) {
  const facts = splitFacts(task.entryType === "topic" ? [task.topicGoal, task.sourceText].filter(Boolean).join("。") : task.sourceText).slice(0, 3);

  if (type === "risk_regulation") {
    return {
      summary: "这类内容先接住节目或公共议题里的具体问题，再转到经营边界和认知升级，不适合第一句就卖AI获客。",
      recommendedSkeletonIds: ["sk-risk", "sk-mapping", "sk-judge"],
      mustHoldFacts: facts.length > 0 ? facts : ["先保住节目里讨论的具体风险和监管问题。"],
      safeInferences: [
        "AI议题已经从技术圈进入公共治理和行业讨论层面。",
        "经营者需要同时关注效率、边界和合规风险。",
        "真正危险的不是不会用AI，而是只看效率、不看规则。"
      ],
      forbiddenJumps: [
        "不要把节目讨论改写成已经落地的明确政策。",
        "不要直接写成AI已经重构所有获客逻辑。",
        "不要第一段就落数字分身、数字资产、AI获客系统。"
      ],
      writingRules: [
        "先写节目讨论的具体问题，再升级到经营判断。",
        "前两段优先保住事实和讨论焦点。",
        "业务如果要出现，只能轻落到合规、稳定、可持续动作。"
      ]
    };
  }

  if (type === "platform_change") {
    return {
      summary: "这类内容更适合先承接平台动作，再映射流量入口、获客路径和承接动作的变化。",
      recommendedSkeletonIds: ["sk-mapping", "sk-risk", "sk-judge"],
      mustHoldFacts: facts.length > 0 ? facts : ["先保住平台动作和变化本身。"],
      safeInferences: [
        "平台动作通常对应流量入口和分发逻辑的变化。",
        "经营者要更快把入口变化接成承接动作。",
        "谁先适配平台变化，谁更容易吃到后续结果。"
      ],
      forbiddenJumps: [
        "不要把平台小动作夸成行业终局。",
        "不要先讲抽象趋势，忘了平台本身的动作。",
        "不要一上来就卖系统，先讲入口变化。"
      ],
      writingRules: [
        "第一层先写平台动作和变化对象。",
        "第二层再讲流量入口和老板动作。",
        "业务桥接可以出现，但必须先完成事件承接。"
      ]
    };
  }

  if (type === "external_shock") {
    return {
      summary: "这类内容更适合先接外部冲击，再讲对成本、供应链、经营节奏的影响，不适合直接判决行业终局。",
      recommendedSkeletonIds: ["sk-mapping", "sk-risk", "sk-judge"],
      mustHoldFacts: facts.length > 0 ? facts : ["先保住价格、战争、利率等外部变化事实。"],
      safeInferences: [
        "外部波动会传导到企业成本和经营节奏。",
        "真正的经营重点是提高确定性和抗波动能力。",
        "老板更该关注成本变化、客户入口和现金流安全。"
      ],
      forbiddenJumps: [
        "不要直接写成某个时代已经彻底结束。",
        "不要把宏观波动直接硬拐成数字IP营销广告。",
        "不要夸大成必然性结局。"
      ],
      writingRules: [
        "先讲冲击，再讲对象，再讲经营映射。",
        "不要一上来就讲世界观和方法论。",
        "如果桥业务，也只能轻落到经营动作和确定性资产。"
      ]
    };
  }

  if (type === "social_heat") {
    return {
      summary: "这类内容更适合先解释为什么会爆，再映射传播机制和行业启发，不适合强做政策结论。",
      recommendedSkeletonIds: ["sk-mapping", "sk-suspense", "sk-judge"],
      mustHoldFacts: facts.length > 0 ? facts : ["先保住爆火对象和传播点。"],
      safeInferences: [
        "情绪共鸣、反差和传播机制会推高话题热度。",
        "内容创作者和老板可以借这类案例看传播逻辑。",
        "真正能拿走的价值，是传播启发和内容打法。"
      ],
      forbiddenJumps: [
        "不要把围观热点写成宏大政策判断。",
        "不要第一句就强扯业务转化。",
        "不要把单个案例上升成行业定论。"
      ],
      writingRules: [
        "先讲爆火点，再讲传播原因。",
        "再往老板和内容视角延展。",
        "业务桥接以启发为主，不要硬卖。"
      ]
    };
  }

  if (type === "mixed_digest") {
    return {
      summary: "这类盘点型内容信息杂，应该先挑一个最强事实单点展开，不要把多个不相干事件硬拼成一条大判断。",
      recommendedSkeletonIds: ["sk-suspense", "sk-mapping", "sk-judge"],
      mustHoldFacts: facts.length > 0 ? facts.slice(0, 1) : ["先抓一个最强事实展开。"],
      safeInferences: ["先单点切入，再延展判断，别同时讲太多线。"],
      forbiddenJumps: [
        "不要把不同领域新闻硬揉成一个结论。",
        "不要在盘点型热点上强卖业务。",
        "不要跳过事实，直接下宏大判断。"
      ],
      writingRules: [
        "优先选一个最强事实，不要全盘端上。",
        "先把一个点讲透，再谈老板启发。",
        "默认不挂肉。"
      ]
    };
  }

  if (type === "trend_shift") {
    return {
      summary: "这类内容适合讲旧逻辑失效、新逻辑接管，再自然落到老板困局和解法出现。",
      recommendedSkeletonIds: ["sk-wealth", "sk-judge", "sk-suspense"],
      mustHoldFacts: facts.length > 0 ? facts : ["先保住趋势变化和核心命题。"],
      safeInferences: [
        "规则切换时，最先富起来的是最早占住新资源的人。",
        "旧资源失效后，经营动作也要一起换。",
        "概念必须先讲透，再带出方法和系统。"
      ],
      forbiddenJumps: [
        "不要把趋势标签写成一句提纲。",
        "不要没讲清逻辑就直接上产品。",
        "不要只有结论，没有递进。"
      ],
      writingRules: [
        "至少完成三层推进：事实/阶段、逻辑切换、老板困局。",
        "解法只能出现在认知桥和困局之后。",
        "不要写成摘要广告稿。"
      ]
    };
  }

  return {
    summary: task.entryType === "boss_story" ? "这类内容更适合先保住真实冲突，再讲认知转向和结果压实。" : "这类内容先保住事实或观点主轴，再一层层推进判断和落点。",
    recommendedSkeletonIds: task.entryType === "boss_story" ? ["sk-story", "sk-judge", "sk-quote"] : ["sk-judge", "sk-suspense", "sk-quote"],
    mustHoldFacts: facts.length > 0 ? facts : ["先保住用户给出的核心事实或观点。"],
    safeInferences: ["所有延展都应建立在现有素材上，先承接再判断。"],
    forbiddenJumps: ["不要把中段写成空判断堆砌。", "不要过早卖产品或服务。"],
    writingRules: ["先事实/观点，再原因/代价，再桥接/落点。"]
  };
}

export function analyzeTaskStrategy(task: TaskForm): TaskStrategy {
  const relevantText = deriveRelevantText(task);
  const hotspotType = pickHotspotType(task, relevantText);
  const { bridgeStrength, allowedBusinessMode } = inferAllowedBusinessMode(task, hotspotType, relevantText);
  const details = buildStrategyDetails(task, hotspotType, relevantText);

  return {
    hotspotType,
    hotspotTypeLabel: getTypeLabel(hotspotType),
    bridgeStrength,
    bridgeStrengthLabel: getBridgeStrengthLabel(bridgeStrength),
    entryFocus: task.entryType === "viral" ? "source_copy" : task.entryType === "boss_story" ? "story_first" : hotspotType === "trend_shift" ? "logic_first" : "fact_first",
    allowedBusinessMode,
    summary: details.summary,
    recommendedSkeletonIds: details.recommendedSkeletonIds,
    mustHoldFacts: details.mustHoldFacts,
    safeInferences: details.safeInferences,
    forbiddenJumps: details.forbiddenJumps,
    writingRules: details.writingRules
  };
}

export function formatTaskStrategyLines(strategy: TaskStrategy) {
  return [
    `内容分型：${strategy.hotspotTypeLabel}`,
    `桥接强度：${strategy.bridgeStrengthLabel}`,
    `允许挂肉：${strategy.allowedBusinessMode === "none" ? "不挂肉" : strategy.allowedBusinessMode === "light" ? "只允许轻肉" : "可正常挂肉"}`,
    `策略结论：${strategy.summary}`,
    `必须保住：${strategy.mustHoldFacts.join("；") || "无"}`,
    `可做判断：${strategy.safeInferences.join("；") || "无"}`,
    `禁止跳转：${strategy.forbiddenJumps.join("；") || "无"}`,
    `推进要求：${strategy.writingRules.join("；") || "无"}`
  ];
}
