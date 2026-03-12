import type { SkeletonItem, SkeletonStep, SkeletonStepRole } from "../types";

const VALID_ROLES: SkeletonStepRole[] = [
  "event",
  "mapping",
  "risk",
  "reason",
  "bridge",
  "identity",
  "solution",
  "proof",
  "landing",
  "conflict",
  "reversal",
  "payoff",
  "suspense",
  "generic"
];

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeStringArray(items: string[] | undefined, fallback: string[]) {
  const next = (items ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

  return next.length > 0 ? next : fallback;
}

export function inferSkeletonStepRole(stepName: string): SkeletonStepRole {
  if (/经营困局|老板困局|用户困局|代入|处境|卡点/.test(stepName)) return "identity";
  if (/AI解法|解法桥|方案桥|概念桥.*AI|新工具|方法落点|方案落点/.test(stepName)) return "solution";
  if (/结果压实|结果验证|案例印证|现实映射与结果压实|结果映射/.test(stepName)) return "proof";
  if (/悬念/.test(stepName)) return "suspense";
  if (/第一层兑现|第二层兑现|关键答案|答案兑现/.test(stepName)) return "payoff";
  if (/事件|冲击|消息|动作/.test(stepName)) return "event";
  if (/财富阶段|阶段展开|现实映射|现实切口|判断打底|逻辑易位/.test(stepName)) return "mapping";
  if (/代价|风险|后果|对照后果|代价展开/.test(stepName)) return "risk";
  if (/原因|拆解|机制/.test(stepName)) return "reason";
  if (/概念重塑|新认知桥|认知桥|一念转向/.test(stepName)) return "bridge";
  if (/动作落点|解法落点|结果落点|收束落点|认知压实/.test(stepName)) return "landing";
  if (/冲突/.test(stepName)) return "conflict";
  if (/结果反转|反转/.test(stepName)) return "reversal";
  return "generic";
}

function defaultSegmentTask(role: SkeletonStepRole, stepName: string) {
  if (role === "event") return "先接住素材里的关键事实，让观众知道到底发生了什么。";
  if (role === "mapping") return /财富阶段|阶段展开/.test(stepName) ? "把资源更替讲出递进感，不能只列标签。" : "把事实和用户现实连起来，先承接再升级。";
  if (role === "risk") return "把继续沿用旧方法的代价和后果放大。";
  if (role === "reason") return /逻辑易位/.test(stepName) ? "明确过去靠什么、现在靠什么，完成旧逻辑到新逻辑的切换。" : "解释为什么会变成这样，不要只甩判断。";
  if (role === "bridge") return /概念重塑/.test(stepName) ? "先重定义关键概念，再把观众带向新的理解。" : "把前面的事实推到新的认知桥上。";
  if (role === "identity") return "让老板或目标用户代入自己的真实困局，先代入再谈解法。";
  if (role === "solution") return "在完成认知和困局后，再自然带出方法、系统或服务。";
  if (role === "proof") return "把前面的判断压到现实结果、案例感或经营结果上。";
  if (role === "landing") return "把整段收束到一个明确判断或动作方向。";
  if (role === "conflict") return "先把最拧巴、最危险的冲突摊开。";
  if (role === "reversal") return "讲清楚关键变化是怎么发生反转的。";
  if (role === "payoff") return "把前面吊起的问题逐层兑现。";
  if (role === "suspense") return "继续吊住问题，让观众愿意听下一段。";
  return "承接上一段，继续推进，不要停在空结论。";
}

function defaultMinSentences(role: SkeletonStepRole, stepName: string) {
  if (role === "landing") return 1;
  if (role === "solution" || role === "proof") return 2;
  if (/财富阶段|阶段展开/.test(stepName)) return 3;
  if (/逻辑易位|概念重塑|经营困局/.test(stepName)) return 2;
  return role === "suspense" ? 2 : 2;
}

function defaultMustInclude(role: SkeletonStepRole, stepName: string) {
  if (role === "event") return ["事实", "对象/动作"];
  if (role === "mapping") return /财富阶段|阶段展开/.test(stepName) ? ["阶段变化", "资源更替"] : ["现实对象", "影响映射"];
  if (role === "risk") return ["代价", "后果"];
  if (role === "reason") return /逻辑易位/.test(stepName) ? ["旧逻辑", "新逻辑"] : ["原因", "机制"];
  if (role === "bridge") return /概念重塑/.test(stepName) ? ["新定义", "认知转折"] : ["新认知", "桥接句"];
  if (role === "identity") return ["老板困局", "真实卡点"];
  if (role === "solution") return ["方法线索", "结果方向"];
  if (role === "proof") return ["现实结果", "判断压实"];
  if (role === "landing") return ["最终判断"];
  if (role === "conflict") return ["冲突", "危险信号"];
  if (role === "reversal") return ["转折", "变化结果"];
  if (role === "payoff") return ["问题兑现", "关键答案"];
  if (role === "suspense") return ["悬念", "继续追问"];
  return ["素材事实", "判断推进"];
}

function defaultForbidden(role: SkeletonStepRole, stepName: string) {
  if (role === "solution") return ["提前硬卖", "连续讲服务", "脱离前文"];
  if (role === "identity") return ["直接卖方案", "空喊焦虑", "只讲自己"];
  if (role === "bridge") return /概念重塑/.test(stepName) ? ["直接等于产品", "只讲术语", "跳过旧逻辑"] : ["概念空转", "直接卖服务", "脱离素材"];
  if (role === "mapping") return /财富阶段|阶段展开/.test(stepName) ? ["只列标签", "跳过递进", "直接卖服务"] : ["只下结论", "脱离现实", "提前卖服务"];
  if (role === "event") return ["抽象说教", "跳过事实", "提前卖服务"];
  if (role === "risk") return ["空喊危机", "不讲代价", "直接给方案"];
  if (role === "reason") return ["只给结论", "重复上段", "硬切业务"];
  if (role === "proof") return ["空口号", "重复卖点", "无结果感"];
  if (role === "landing") return ["重复前文", "再开新话题", "加长广告"];
  return ["只下结论", "跳段", "脱离素材"];
}

function defaultBridge(role: SkeletonStepRole, stepName: string) {
  if (role === "event") return "把事件影响转到用户现实。";
  if (role === "mapping") return /财富阶段|阶段展开/.test(stepName) ? "从阶段变化过桥到规则已经换了。" : "从现实映射过桥到代价或逻辑变化。";
  if (role === "risk") return "从代价过桥到为什么会变成这样。";
  if (role === "reason") return /逻辑易位/.test(stepName) ? "把旧逻辑和新逻辑切开后，再重塑关键概念。" : "从原因过桥到新认知。";
  if (role === "bridge") return /概念重塑/.test(stepName) ? "让观众先理解新概念，再代入自己的处境。" : "从认知桥过到用户困局。";
  if (role === "identity") return "先让用户代入，再让解法出现。";
  if (role === "solution") return "解法出现后，要用结果把它压实。";
  if (role === "proof") return "把结果压实后再收束。";
  if (role === "landing") return "把判断落回动作或下一步。";
  if (role === "conflict") return "把冲突摊开后，再讲代价和原因。";
  if (role === "reversal") return "把反转讲清后，再压成带得走的认知。";
  if (role === "payoff") return "兑现后继续向最关键的一层推进。";
  if (role === "suspense") return "悬念吊住后，要尽快给事实回报。";
  return "继续往下一层推进，不要停在空话上。";
}

function defaultAllowMeat(role: SkeletonStepRole) {
  return role === "solution" || role === "proof" || role === "landing";
}

function defaultRequireSource(role: SkeletonStepRole, stepName: string) {
  if (/财富阶段|阶段展开/.test(stepName)) return true;
  return role === "event" || role === "mapping" || role === "conflict" || role === "payoff";
}

export function normalizeSkeletonStep(
  step: Partial<SkeletonStep> | null | undefined,
  fallback?: Partial<SkeletonStep> | null
): SkeletonStep {
  const name = step?.name?.trim() || fallback?.name?.trim() || "正文推进";
  const inferredRole = inferSkeletonStepRole(name);
  const fallbackRole = fallback?.role && VALID_ROLES.includes(fallback.role) ? fallback.role : undefined;
  const role = step?.role && VALID_ROLES.includes(step.role) ? step.role : fallbackRole ?? inferredRole;
  const purpose = step?.purpose?.trim() || fallback?.purpose?.trim() || defaultSegmentTask(role, name);
  const targetWords = clampInteger(
    Number.isFinite(step?.targetWords) ? Number(step?.targetWords) : Number.isFinite(fallback?.targetWords) ? Number(fallback?.targetWords) : 65,
    30,
    160
  );
  const segmentTask = step?.segmentTask?.trim() || fallback?.segmentTask?.trim() || defaultSegmentTask(role, name);
  const minSentences = clampInteger(
    Number.isFinite(step?.minSentences) ? Number(step?.minSentences) : Number.isFinite(fallback?.minSentences) ? Number(fallback?.minSentences) : defaultMinSentences(role, name),
    1,
    5
  );
  const mustInclude = normalizeStringArray(step?.mustInclude, normalizeStringArray(fallback?.mustInclude, defaultMustInclude(role, name)));
  const forbidden = normalizeStringArray(step?.forbidden, normalizeStringArray(fallback?.forbidden, defaultForbidden(role, name)));
  const bridgeToNext = step?.bridgeToNext?.trim() || fallback?.bridgeToNext?.trim() || defaultBridge(role, name);
  const allowMeat = typeof step?.allowMeat === "boolean" ? step.allowMeat : typeof fallback?.allowMeat === "boolean" ? fallback.allowMeat : defaultAllowMeat(role);
  const requireSource =
    typeof step?.requireSource === "boolean"
      ? step.requireSource
      : typeof fallback?.requireSource === "boolean"
        ? fallback.requireSource
        : defaultRequireSource(role, name);

  return {
    name,
    purpose,
    targetWords,
    role,
    segmentTask,
    minSentences,
    mustInclude,
    forbidden,
    bridgeToNext,
    allowMeat,
    requireSource
  };
}

export function createSkeletonStep(
  step: Pick<SkeletonStep, "name" | "purpose" | "targetWords"> & Partial<SkeletonStep>
) {
  return normalizeSkeletonStep(step);
}

export function getSkeletonMeatStartIndex(skeleton: SkeletonItem) {
  return skeleton.steps.findIndex((step) => normalizeSkeletonStep(step).allowMeat);
}

export function formatSkeletonExecutionLines(skeleton: SkeletonItem) {
  return skeleton.steps.map((step, index) => {
    const normalized = normalizeSkeletonStep(step);
    const mustInclude = normalized.mustInclude?.join("、") || "素材事实";
    const forbidden = normalized.forbidden?.join("、") || "空结论";
    return `${index + 1}. ${normalized.name}｜任务：${normalized.segmentTask}｜至少${normalized.minSentences}句｜必须：${mustInclude}｜禁止：${forbidden}｜承上：${normalized.bridgeToNext}｜${normalized.allowMeat ? "允许挂肉" : "禁止挂肉"}｜${normalized.requireSource ? "先用素材事实" : "可做判断延展"}`;
  });
}

export function formatSkeletonCardDescription(skeleton: SkeletonItem) {
  const normalizedSteps = skeleton.steps.map((step) => normalizeSkeletonStep(step));
  const preview = normalizedSteps
    .slice(0, 2)
    .map((step, index) => `${index + 1}步${step.name}：${step.segmentTask}`)
    .join(" ");
  const meatStart = getSkeletonMeatStartIndex(skeleton);
  const meatHint = meatStart >= 0 ? `业务从第${meatStart + 1}步后再进。` : "先讲内容，再决定要不要挂肉。";
  return [skeleton.summary, preview, meatHint].filter(Boolean).join(" ");
}
