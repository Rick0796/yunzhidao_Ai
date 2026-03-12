export const HOOK_CORE_CONCEPT_LINES = [
  "皮不是固定句库，而是基于内容做出来的注意力警报。",
  "短视频前三秒先打断，再展开；先让人停，再让人听。",
  "前4到8个字要先把锚点打下去，让观众马上知道这事不小。",
  "好皮的核心不是堆情绪，而是让人第一秒就想问：为什么？",
  "皮的底层结构通常是：锚点 + 判决/异常 + 后果/未闭合。"
];

export const HOOK_FRONTLOAD_RULE_LINES = [
  "第一小句优先前置锚点：人名、平台名、时间点、命令词、极端判断，至少占一个。",
  "禁止前半句平平无奇，后半句才突然发力。",
  "如果这个内容最强的不是时间，就不要硬写时间；如果最强的不是问句，就不要硬写问句。"
];

export const HOOK_FORMULA_RULE_LINES = [
  "时间型不能只报时间，时间后面必须立刻跟大动作、大后果或大变化。",
  "问句型要短、狠、直接，优先用“到底有多X”这类拷问结构，问完就收。",
  "判决型必须落到具体对象和具体下场，不能空喊趋势和变化。",
  "命令型和判决型宁可短一点，也不要后半句画蛇添足。",
  "优先从内容里找最能打人的点：名人/平台、异常反差、明确损失、具体数字、冲突后果。"
];

export const HOOK_BANNED_STYLE_LINES = [
  "禁止软起手：很多人还没意识到、我来说说我的判断、真正可怕的不是、说到底、归根结底。",
  "禁止解释型开头、总结型开头、说教型开头。",
  "禁止把重点放到后半句，前面先铺垫三秒。"
];

export const HOOK_CORRECT_EXAMPLE_LINES = [
  "AI获客这件事，老板再晚看懂，成本只会更高。",
  "平台入口一变，老办法拉客户会越来越难。",
  "不结婚到底有多惨？",
  "从2月1号开始，腾讯要发十亿红包了。"
];

export const HOOK_WRONG_EXAMPLE_LINES = [
  "很多人还没意识到，未来会有变化。",
  "我来说说我的判断，你听完再下结论。",
  "从今年开始，很多人可能会有一些变化。",
  "还靠老办法拉客户的人，根本没客户。"
];

const HOOK_SOFT_LEAD_PATTERNS = [
  /^(很多人|很多老板|有些人|有人|大多数人|绝大多数人)/,
  /^(我来|今天想|今天跟你|先说|先讲|我把话说|我想跟你)/,
  /^(真正可怕的不是|说到底|归根结底|本质上来说|不得不说|其实)/,
  /^(如果你刷到|当你看到|在如今|在当下|对于很多人来说)/
];

const HOOK_TIME_START_PATTERNS = [
  /^(从\d{1,2}月\d{1,2}(日|号)?开始)/,
  /^(从今天开始|从现在开始|今天|刚刚|这两天|一夜之间)/,
  /^(明年|今年|未来\d+年|未来三年|再过\d+年|202\d年)/
];

const HOOK_COMMAND_START_PATTERNS = [
  /^(一定要|必须|千万别|赶紧|别再|不要再)/,
  /^(老板一定要|老板必须|做生意的人必须|做老板的人必须)/,
  /^(想继续.+的人(必须|千万别)|还在线下.+的人(必须|别再)|想继续吃.+的人(千万别|别再))/
];

const HOOK_VAGUE_OBJECT_PATTERNS = /(这件事|这个变化|这种情况|老办法|旧办法|这一波|这波机会|一些变化)/;
const HOOK_ABSOLUTE_WORD_PATTERNS = /(绝对|根本|一定|彻底|马上|先|全部|都得|都会)/;
const HOOK_CONSEQUENCE_PATTERNS = /(没生意|没客户|倒闭|淘汰|掉量|掉单|掉队|来不及|买不起|不值钱|废纸|吃大亏|先输|先掉客户|先出局|先被洗掉|难了|惨了)/;
const HOOK_QUESTION_SIGNAL_PATTERNS = /(到底|有多|还能|多惨|多难|多狠|多危险|最怕|最惨|最难)/;

const HOOK_HARD_START_PATTERNS = [
  ...HOOK_TIME_START_PATTERNS,
  ...HOOK_COMMAND_START_PATTERNS,
  /^(出大瓜了|出大事了|真的破防了|彻底完了|完蛋了|要变天了)/,
  /^(不会.+的老板|不会.+的人|传统.+的老板|传统.+的人|还在.+的老板|还在.+的人|死守.+的老板|死守.+的人|线下守店的老板|老板最危险的时候|将来明星和网红|明星和网红|还端着的明星和网红)/,
  /^[\u4e00-\u9fa5A-Za-z0-9]{2,12}(沉默了|急了|慌了|完了|火了|翻盘了|变天了|破防了|顶不住了|扛不住了|没坐住|没绷住)/,
  /^[0-9一二三四五六七八九十两]+\s*(亿|万|块|元|天|年|家|个|倍)/,
  /^(腾讯|微信|抖音|小红书|快手|支付宝|京东|英伟达|特斯拉|马斯克|刘强东|雷军|黄仁勋|李亚鹏|许家印|段永平|明星|网红|老板|普通人|婚姻|不结婚|AI|数字资产|现金|国际油价|油价|金价|A股|楼市|房价|特朗普|伊朗|美国|人民币|黄金)/
];

export function buildHookPromptRuleLines(options?: { allowBusinessKeywords?: boolean }) {
  const allowBusinessKeywords = options?.allowBusinessKeywords ?? false;

  return [
    "【皮的底层概念】",
    ...HOOK_CORE_CONCEPT_LINES,
    "",
    "【前置爆点规则】",
    ...HOOK_FRONTLOAD_RULE_LINES,
    "",
    "【结构规则】",
    ...HOOK_FORMULA_RULE_LINES,
    "",
    "【严禁写法】",
    ...HOOK_BANNED_STYLE_LINES,
    "",
    allowBusinessKeywords
      ? "如果任务本身就在讲 AI 获客、平台变化、数字资产，这些词可以直接出现，但必须先有警报感，不要先解释。"
      : "仿写爆款时，如果原文没有业务词，不要强塞 AI 获客、数字资产、私域沉淀等业务词。"
  ];
}

export function buildHookExampleLines() {
  return [
    "【统一正确示范】",
    ...HOOK_CORRECT_EXAMPLE_LINES.map((item) => `- ${item}`),
    "",
    "【统一错误示范】",
    ...HOOK_WRONG_EXAMPLE_LINES.map((item) => `- ${item}`)
  ];
}

export function getHookFirstClause(text: string) {
  return (text.split(/[，。！？?]/)[0] ?? text).trim();
}

export function isStrongQuestionHook(text: string) {
  const firstClause = getHookFirstClause(text);
  return /^[^，。！？?]{4,22}[？?]$/.test(text.trim()) && HOOK_QUESTION_SIGNAL_PATTERNS.test(firstClause);
}

export function hasSoftHookLead(text: string) {
  return HOOK_SOFT_LEAD_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

export function hasHardHookStart(text: string) {
  const normalized = text.trim();
  const firstClause = getHookFirstClause(normalized);

  return HOOK_HARD_START_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(firstClause));
}

export function matchesHookFormula(text: string) {
  const normalized = text.trim();
  const firstClause = getHookFirstClause(normalized);

  return (
    hasHardHookStart(normalized) ||
    isStrongQuestionHook(normalized) ||
    (HOOK_ABSOLUTE_WORD_PATTERNS.test(firstClause) && HOOK_CONSEQUENCE_PATTERNS.test(normalized))
  );
}

export function getHookLeadScore(text: string) {
  const normalized = text.trim();
  const firstClause = getHookFirstClause(normalized);
  let score = 0;

  if (!normalized) return 0;
  if (hasSoftHookLead(normalized)) score -= 40;
  if (hasHardHookStart(normalized)) score += 24;
  if (isStrongQuestionHook(normalized)) score += 20;
  if (/^(腾讯|微信|抖音|小红书|快手|支付宝|京东|马斯克|刘强东|雷军|黄仁勋|李亚鹏|明星|网红|将来明星和网红|不结婚|婚姻|学佛的人|修行的人|不会.+的老板|传统.+的老板|还在.+的老板)/.test(firstClause)) {
    score += 16;
  }
  if (HOOK_ABSOLUTE_WORD_PATTERNS.test(firstClause)) score += 14;
  if (HOOK_CONSEQUENCE_PATTERNS.test(normalized)) score += 16;
  if (HOOK_TIME_START_PATTERNS.some((pattern) => pattern.test(firstClause))) score += 10;
  if (HOOK_COMMAND_START_PATTERNS.some((pattern) => pattern.test(firstClause))) score += 12;
  if (/[\d一二三四五六七八九十两]+(亿|万|块|元|天|年|家|个|倍|%)/.test(firstClause)) score += 8;
  if (/(国际油价|油价|金价|A股|楼市|房价|特朗普|伊朗|美国|人民币|黄金)/.test(firstClause)) score += 12;
  if (/(24小时|一夜之间).*(暴跌|暴涨|大跌|大涨|被处理|换人|停运)/.test(firstClause)) score += 14;
  if (/(暴跌|暴涨|大跌|大涨).*\d+%/.test(firstClause)) score += 12;
  if (/^[\u4e00-\u9fa5A-Za-z0-9]{2,12}(沉默了|急了|慌了|完了|火了|翻盘了|变天了|破防了|顶不住了|扛不住了)/.test(firstClause)) {
    score += 18;
  }
  if (HOOK_VAGUE_OBJECT_PATTERNS.test(firstClause) && !HOOK_CONSEQUENCE_PATTERNS.test(firstClause)) score -= 12;
  if (/^(真的破防了|出大瓜了|出大事了)[，,]/.test(normalized)) score -= 6;
  if (firstClause.length >= 5 && firstClause.length <= 16) score += 8;
  if (firstClause.length > 20) score -= 10;
  if ((normalized.match(/[，,]/g) ?? []).length >= 2) score -= 8;
  if (matchesHookFormula(normalized)) score += 8;

  return score;
}

export function isAlarmStyleHook(text: string) {
  const normalized = text.trim();
  return !hasSoftHookLead(normalized) && getHookLeadScore(normalized) >= 32;
}

export function explainHookLead(text: string) {
  const normalized = text.trim();
  const firstClause = getHookFirstClause(normalized);
  const reasons: string[] = [];

  if (hasHardHookStart(normalized)) reasons.push("前置锚点");
  if (isStrongQuestionHook(normalized)) reasons.push("拷问感");
  if (HOOK_TIME_START_PATTERNS.some((pattern) => pattern.test(firstClause))) reasons.push("时间压迫");
  if (HOOK_COMMAND_START_PATTERNS.some((pattern) => pattern.test(firstClause))) reasons.push("命令感");
  if (HOOK_ABSOLUTE_WORD_PATTERNS.test(firstClause)) reasons.push("绝对化判决");
  if (HOOK_CONSEQUENCE_PATTERNS.test(normalized)) reasons.push("具体后果");
  if (/[\d一二三四五六七八九十两]+(亿|万|块|元|天|年|家|个|倍|%)/.test(firstClause)) reasons.push("数字冲击");
  if (hasSoftHookLead(normalized)) reasons.push("软起手");

  return reasons;
}

export function sortHooksByLeadScore<T extends { text: string }>(items: T[]) {
  return [...items].sort((left, right) => getHookLeadScore(right.text) - getHookLeadScore(left.text));
}
