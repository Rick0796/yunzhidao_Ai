import { ApiSettings, BaseProfile, GenerationSource, TaskForm } from "../types";
import { buildHookPromptRuleLines } from "./hookEngine";
import { normalizeBaseUrl } from "./http";
import { extractJsonBlock, normalizeMessageContent } from "./modelResponse";
import { displayBusinessMode, displayCtaMode } from "./workbenchConfig";
import { analyzeTaskStrategy, formatTaskStrategyLines } from "./taskStrategy";



export function buildSystemPrompt(profile: BaseProfile) {
  return [
    "你是团队内部短视频内容工作台的文案生成引擎。",
    "你的目标不是写散文，而是产出可以直接送去做数字人口播的短视频文案：短句、口语化、前三秒抓人、中段持续推进、结尾只保留一个动作。",
    "",
    "=== 总原则 ===",
    "1. 所有输出都必须紧贴用户提供的主题、热点、参考文案和任务要求，不能编造新人物、新事件、新公司、新结论。",
    "2. 皮负责抓停，骨负责推进，肉负责自然植入，收口只做一个动作。",
    "3. 你不是在压缩提纲，而是在重建推进。每一段都必须承担明确任务。",
    "4. 禁止写成“摘要 + 广告”：不能一句世界观、两句卖点、直接收口。",
    "5. 最终文案要适合数字人口播，优先短句、结果感、画面感、代入感。",
    "",
    "=== 皮（开头钩子）规则 ===",
    ...buildHookPromptRuleLines({ allowBusinessKeywords: true }),
    "",
    "=== 骨（中段推进）规则 ===",
    "1. 骨架不是步骤标签，而是推进职责链。每一段都要回答：这一段为什么存在，它把观众推进到了哪一步。",
    "2. 如果某一段只有结论，没有事实、解释、画面、代入、转折或结果压实，这一段就是无效段。",
    "3. 中段前两段优先使用素材里的事实、对象、动作、时间点、平台名，不要一上来就讲抽象大道理。",
    "4. 未完成事实承接前，不要提前进入概念升维。",
    "5. 未完成用户困局代入前，不要提前插入服务肉。",
    "6. 如果内容属于财富演化、行业变化、趋势认知类，必须体现“旧资源失效 → 新资源接管 → 用户困局 → 解法出现”的顺序。",
    "7. 如果内容里出现农业时代、工业时代、互联网时代、数字时代、平台入口变化等线索，不能只列标签，必须讲出递进关系和变现逻辑易位。",
    "8. 中段至少要持续兑现三层以上：事实承接、判断升级、原因解释、概念桥、结果落点。",
    "9. 禁止写成：钩子一句 → 两句空判断 → 直接卖产品。",
    "10. 不是所有热点都能强挂业务。必须先判断热点类型和桥接强度，再决定能不能挂肉、挂到什么程度。",
    "11. 风险监管型、公共讨论型热点，优先讲边界、影响和经营认知，不要第一句就卖AI获客、数字资产或数字分身。",
    "",
    "=== 肉（业务植入）规则 ===",
    "1. 肉必须放在中后段，只能在认知桥或困局代入之后出现。",
    "2. 先有概念桥/塑品，再有服务肉，不要从热点或观点直接跳产品。",
    "3. 肉要像内容里自然长出来的一句结果判断，不要像产品说明书。",
    "4. 肉要讲清楚：你是谁，你帮别人解决什么问题，为什么别人会想进一步找你。",
    "5. 可以讲方法、系统、服务、陪跑、代运营、获客链路，但不要连续硬卖两三句。",
    "6. 最理想的感觉是：观众会觉得你懂他的处境，所以愿意继续问你。",
    "",
    "=== 仿写爆款额外规则 ===",
    "1. 必须保留参考文案的核心命题、关键元素和论证方向。",
    "2. 优先保留原文段落骨架和推进顺序，不要把长文压成四五段摘要。",
    "3. 允许改表达、改情绪、改切入口，但不能改成另一个主题。",
    "4. 如果原文没有业务词，不要强塞业务词；如果原文本身就在讲业务，也仍然要先抓注意力。",
    "",
    "=== 业务背景 ===",
    `我是谁、做什么：${profile.selfIntro}`,
    `目标客户：${profile.targetAudience}`,
    `核心关键词：${profile.coreKeywords}`,
    "",
    "只返回要求的 JSON 结构，不要解释，不要额外文字。"
  ].join("\n");
}

function buildEntryFocus(task: TaskForm) {
  if (task.entryType === "hotspot") {
    return [
      "任务理解：这是热点任务。",
      "优先理解事件本身、传播点和用户为什么会停留。",
      "重点使用热点内容和切入角度，不要平铺直叙。"
    ].join("\n");
  }

  if (task.entryType === "topic") {
    return [
      "任务理解：这是主题创作任务。",
      "优先围绕核心观点推进，让每一段都服务同一个判断。",
      "补充素材只是辅助，没有素材也要能独立成稿，但不能空泛。"
    ].join("\n");
  }

  if (task.entryType === "boss_story") {
    return [
      "任务理解：这是我的故事任务。",
      "优先提炼冲突、代价、反转、觉醒和老板自己的认知。",
      "不要按新闻口吻来写，要像本人自己在讲。"
    ].join("\n");
  }

  return [
    "任务理解：这是仿写爆款任务。",
    "优先拆结构、改表达、保留停留感，不要原样复述参考文案。"
  ].join("\n");
}

export function buildTaskContext(task: TaskForm) {
  const strategy = analyzeTaskStrategy(task);
  const common = [
    `入口方式：${task.entryType === "viral" ? "仿写爆款" : task.entryType === "hotspot" ? "蹭热点" : task.entryType === "topic" ? "主题创作" : "我的故事"}`,
    `挂业务方式：${displayBusinessMode(task.businessMode)}`,
    `收口方式：${displayCtaMode(task.ctaMode)}`,
    "内容策略：",
    ...formatTaskStrategyLines(strategy)
  ];

  if (task.entryType === "hotspot") {
    return [
      ...common,
      `热点内容：${task.sourceText || "无"}`,
      `切入角度：${task.hotspotAngle || "无"}`,
      buildEntryFocus(task)
    ].join("\n");
  }

  if (task.entryType === "topic") {
    return [
      ...common,
      `这条视频想说什么：${task.topicGoal || "无"}`,
      `补充素材：${task.sourceText || "无"}`,
      buildEntryFocus(task)
    ].join("\n");
  }

  if (task.entryType === "boss_story") {
    return [
      ...common,
      `经历口述：${task.sourceText || "无"}`,
      `想传达的结论：${task.storyConclusion || "无"}`,
      buildEntryFocus(task)
    ].join("\n");
  }

  // viral: 原文已在 instruction 里完整传入，这里只传补充要求避免重复
  return [
    ...common,
    `补充要求：${task.userNote || "无"}`,
    buildEntryFocus(task)
  ].join("\n");
}

export async function generateJson<T>({
  settings,
  profile,
  task,
  instruction,
  schemaHint,
  model,
  maxTokens,
  fallback
}: {
  settings: ApiSettings;
  profile: BaseProfile;
  task: TaskForm;
  instruction: string;
  schemaHint: string;
  model?: string;
  maxTokens?: number;
  fallback: T;
}): Promise<GenerationSource<T>> {
  if (!settings.useLiveApi) {
    return {
      data: fallback,
      source: "local",
      message: "未开启实时 API，已切换到本地智能生成。"
    };
  }

  // 前端比后端(120s)早10秒中止，避免 signal aborted without reason
  const frontendTimeout = Math.max(30000, settings.requestTimeoutMs - 10000);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), frontendTimeout);

  try {
    const randomSeed = Math.random().toString(36).substring(7);

    const response = await fetch(`${normalizeBaseUrl(settings.baseUrl || "/api")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Prompt-Version": "copy-workbench-v2026-03-11",
        "X-Task-Entry": task.entryType,
        "X-Request-Id": `${Date.now()}-${randomSeed}`
      },
      body: JSON.stringify({
        model: model || settings.mainModel,
        temperature: 0.75,
        top_p: 0.9,
        max_tokens: maxTokens ?? 4000,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(profile)
          },
          {
            role: "user",
            content: [
              buildTaskContext(task),
              "",
              instruction,
              "",
              `[生成批次: ${randomSeed}]`,
              "只返回合法 JSON，不要 markdown，不要解释，不要多余文字。",
              `输出结构：${schemaHint}`
            ].join("\n")
          }
        ]
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw);
    }

    const parsed = JSON.parse(raw);
    const content = normalizeMessageContent(parsed?.choices?.[0]?.message?.content);

    if (!content) {
      throw new Error("模型未返回可解析文本内容。");
    }

    let data: T;
    try {
      data = JSON.parse(content) as T;
    } catch {
      const jsonText = extractJsonBlock(content);
      data = JSON.parse(jsonText) as T;
    }

    return {
      data,
      source: "api"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "API 调用失败，已自动回退到 mock。";
    const friendlyMessage = message.includes("429")
      ? "API 当前被限流（429），本次先回退到 mock 结果。"
      : message.includes("模型未返回可解析文本内容")
        ? "模型这次没有按要求返回结构化内容，本次先回退到 mock 结果。"
        : error instanceof Error
          ? `API 调用失败，已自动回退到 mock：${error.message.slice(0, 120)}`
          : "API 调用失败，已自动回退到 mock。";

    return {
      data: fallback,
      source: "local",
      message: friendlyMessage
    };
  } finally {
    window.clearTimeout(timer);
  }
}




