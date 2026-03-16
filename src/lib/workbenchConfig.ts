import type { ApiSettings, BaseProfile, BusinessMode, CtaMode, EntryType, TaskForm } from "../types";

export type WorkbenchMode = "rewrite" | "original" | "compose" | "video";
export type OriginalEntryType = Exclude<EntryType, "viral">;
export type HotspotPlatformKey = "douyin" | "weibo" | "zhihu" | "baidu";
export type WorkbenchStep = 1 | 2 | 3 | 4;

export interface WorkbenchOption<T> {
  value: T;
  label: string;
  hint: string;
}

export interface StepConfigItem {
  step: WorkbenchStep;
  title: string;
  hint: string;
}

export interface WorkbenchCopy {
  eyebrow: string;
  title: string;
  description: string;
  step1Title: string;
  step1Subtitle: string;
  step2Title: string;
  step2Subtitle: string;
  step3Title: string;
  step3Subtitle: string;
  step4Title: string;
  step4Subtitle: string;
}

export const DEFAULT_ORIGINAL_ENTRY_TYPE: OriginalEntryType = "hotspot";
export const COMPACT_HOTSPOT_COLLAPSED_COUNT = 3;

export const ENTRY_OPTIONS: Array<WorkbenchOption<EntryType>> = [
  { value: "viral", label: "仿写爆款", hint: "拆同行爆款，改表达不改命题。" },
  { value: "hotspot", label: "蹭热点", hint: "借事件流量，快速落到自己的判断。" },
  { value: "topic", label: "主题创作", hint: "围绕一个认知点，直接做成系列。" },
  { value: "boss_story", label: "我的故事", hint: "讲老板经历、反转和认知。" },
];

export const BUSINESS_OPTIONS: Array<WorkbenchOption<BusinessMode>> = [
  { value: "none", label: "不挂业务", hint: "纯内容、纯流量、不提服务。" },
  { value: "light", label: "轻挂业务", hint: "中后段顺带提一下，不抢正文。" },
  { value: "strong", label: "明确挂业务", hint: "业务高度相关，结果导向更强。" },
];

export const CTA_OPTIONS: Array<WorkbenchOption<CtaMode>> = [
  { value: "comment", label: "评论互动", hint: "先把评论区做热。" },
  { value: "keyword", label: "评论关键词", hint: "把高意向用户筛出来。" },
  { value: "profile", label: "评论后看主页", hint: "适合主页有明确承接内容。" },
  { value: "lead", label: "评论后领资料", hint: "适合资料承接和转化。" },
  { value: "none", label: "不加收口", hint: "纯内容表达，不做导流。" },
];

export const HOTSPOT_PLATFORM_META: Record<HotspotPlatformKey, { label: string }> = {
  douyin: { label: "抖音热榜" },
  weibo: { label: "微博热搜" },
  zhihu: { label: "知乎热榜" },
  baidu: { label: "百度热搜" },
};

export function isOriginalEntryType(value: EntryType): value is OriginalEntryType {
  return value !== "viral";
}

export const ORIGINAL_ENTRY_OPTIONS: Array<WorkbenchOption<OriginalEntryType>> = ENTRY_OPTIONS.filter(
  (item): item is WorkbenchOption<OriginalEntryType> => item.value !== "viral",
);

export function getStepConfig(mode: WorkbenchMode): StepConfigItem[] {
  if (mode === "video") {
    return [];
  }

  if (mode === "compose") {
    return [
      { step: 1, title: "主题与爆点", hint: "先定主题或先抽一个开头，再开始自动匹配。" },
      { step: 2, title: "自动组装", hint: "系统会先按固定结构组一版。" },
      { step: 3, title: "逐块调整", hint: "每个小板块都能重配、删除或手动插入。" },
      { step: 4, title: "去重输出", hint: "按小板块或大板块去重后输出最终稿。" },
    ];
  }

  if (mode === "rewrite") {
    return [
      { step: 1, title: "上传原文", hint: "先上传爆款原文和改写要求。" },
      { step: 2, title: "看结构选皮", hint: "先看原文结构，再确定更炸的开头。" },
      { step: 3, title: "装配骨肉收口", hint: "顺着原文推进装配骨、塑品、肉和收口。" },
      { step: 4, title: "生成成品", hint: "输出完整改写正文和字幕稿。" },
    ];
  }

  return [
    { step: 1, title: "设定任务", hint: "先定热点/主题、内容方向和收口。" },
    { step: 2, title: "选择皮", hint: "先把开头打到位，确定前三秒。" },
    { step: 3, title: "选择骨肉收口", hint: "骨接住皮，肉放中后段，收口只做一个动作。" },
    { step: 4, title: "生成成品", hint: "输出完整正文和字幕稿，直接进人工筛选。" },
  ];
}

export function getWorkbenchCopy(mode: WorkbenchMode): WorkbenchCopy {
  if (mode === "video") {
    return {
      eyebrow: "视频分析",
      title: "视频分析工作台",
      description: "上传短视频，AI 自动提取脚本，一键导入爆款仿写工作台。",
      step1Title: "", step1Subtitle: "",
      step2Title: "", step2Subtitle: "",
      step3Title: "", step3Subtitle: "",
      step4Title: "", step4Subtitle: "",
    };
  }

  if (mode === "compose") {
    return {
      eyebrow: "文案组合",
      title: "文案组合工作台",
      description: "按固定结构自动组装，再逐块替换、插入和去重。",
      step1Title: "步骤 1 / 主题与爆点",
      step1Subtitle: "先给主题或先给一个爆点，系统再开始整篇匹配。",
      step2Title: "步骤 2 / 自动组装",
      step2Subtitle: "先出一版完整结构稿，再看哪里需要补强。",
      step3Title: "步骤 3 / 逐块调整",
      step3Subtitle: "每个小板块都能重配、删除或手动插入。",
      step4Title: "步骤 4 / 去重输出",
      step4Subtitle: "按小板块或大板块去重后输出最终稿。",
    };
  }

  if (mode === "rewrite") {
    return {
      eyebrow: "爆款仿写",
      title: "爆款仿写工作台",
      description: "上传爆款原文，先看原文结构，再装配皮、骨、肉和完整改写成品。",
      step1Title: "步骤 1 / 上传原文",
      step1Subtitle: "先点开任务设置，再把爆款原文和补充要求填进去。",
      step2Title: "步骤 2 / 看结构选皮",
      step2Subtitle: "先看原文结构，再确定更能抓人的开头。",
      step3Title: "步骤 3 / 装配骨肉收口",
      step3Subtitle: "顺着原文推进装配骨、塑品、肉和收口。",
      step4Title: "步骤 4 / 生成成品",
      step4Subtitle: "这里直接出完整改写正文和字幕稿。",
    };
  }

  return {
    eyebrow: "热点 / 主题创作",
    title: "热点 / 主题创作工作台",
    description: "先定内容任务，再按步骤生成皮、骨、肉和完整成品。",
    step1Title: "步骤 1 / 设定任务",
    step1Subtitle: "先点开任务设置，再把热点、主题或故事素材填进去。",
    step2Title: "步骤 2 / 选择皮",
    step2Subtitle: "第一句话先抓住人，后面才接得住。",
    step3Title: "步骤 3 / 选择骨肉收口",
    step3Subtitle: "骨负责推进，肉放中后段，收口只留一个动作。",
    step4Title: "步骤 4 / 生成成品",
    step4Subtitle: "这里直接出完整正文和字幕稿。",
  };
}

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

export function displayEntryType(entryType: EntryType): string {
  return typeLabelMap[entryType];
}

export function displayBusinessMode(mode: BusinessMode): string {
  return businessLabelMap[mode];
}

export function displayCtaMode(mode: CtaMode): string {
  return ctaLabelMap[mode];
}

export const defaultApiSettings: ApiSettings = {
  useLiveApi: true,
  baseUrl: "/ai-api/v1",
  apiKey: "sk-ZUl7JB6pCYDywsuMnAH5tcewOxfqPYYv8WYKCgeOcKWoMQB9",
  mainModel: "gemini-3-flash",
  batchModel: "gemini-3-flash",
  polishModel: "gemini-3-flash",
  imageModel: "gemini-2.5-flash",
  requestTimeoutMs: 120000
};

export const defaultBaseProfile: BaseProfile = {
  selfIntro: "我帮助老板、创业者、企业操盘手，用 AI 把内容增长、流量增长、获客增长系统化跑起来。",
  targetAudience: "老板、创业者、企业操盘手、实体老板、想通过 AI 做内容获客的人",
  coreKeywords: "AI获客, 内容增长, 数字资产, 私域沉淀, 企业增长"
};

export const defaultTask: TaskForm = {
  entryType: "viral",
  entryTypeChosen: false,
  sourceText: "就在大家都在准备回家过年过节的时候，世界正在发生巨大变化。微信和支付宝躺赢的时代结束了，国家接连扔出两个王炸，海南封关、数字人民币交易飙升，这都在释放一个信号：物理世界的边界正在打破，数字时代强势来临。",
  userNote: "",
  hotspotAngle: "从普通人资产焦虑切入，落到数字资产和 AI 获客",
  topicGoal: "用趋势认知的方式讲透数字资产为什么重要",
  storyConclusion: "老板之所以能穿越周期，不是运气好，而是更早把内容和流量变成自己的资产。",
  businessMode: "light",
  businessModeChosen: false,
  ctaMode: "keyword",
  ctaModeChosen: false
};
