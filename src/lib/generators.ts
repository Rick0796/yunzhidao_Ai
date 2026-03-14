import {
  BaseProfile,
  CtaItem,
  DecomposeResult,
  DraftItem,
  GenerationSource,
  HookItem,
  MeatItem,
  ScoreCard,
  SkeletonItem,
  TaskForm,
  ApiSettings
} from "../types";
import {
  buildMockCtas,
  buildMockDecompose,
  buildMockDrafts,
  buildMockHooks,
  buildMockMeat,
  buildMockScore,
  buildMockSkeletons,
  splitSourceParagraphs
} from "./mock";
import { buildHookExampleLines, buildHookPromptRuleLines } from "./hookEngine";
import { generateJson } from "./llm";
import { formatSkeletonExecutionLines, getSkeletonMeatStartIndex } from "./skeletons";
import { analyzeTaskStrategy, formatTaskStrategyLines } from "./taskStrategy";

function buildEntryWorkflowInstruction(entryType: TaskForm["entryType"]) {
  if (entryType === "hotspot") {
    return "这是热点任务，优先写事件冲击、你的判断和评论互动，不要按参考爆款照抄。";
  }
  if (entryType === "topic") {
    return "这是主题任务，优先围绕核心观点推进，不依赖外部素材也要能成稿。";
  }
  if (entryType === "boss_story") {
    return "这是老板经历任务，优先写冲突、代价、反转和老板自己的认知。";
  }
  return "这是参考爆款任务，优先拆结构、轻改表达、做去重，保留原文停留感和推进骨架。";
}

function buildHookStructureGuide(task: TaskForm) {
  const guideSkeleton = buildMockSkeletons(task)[0];
  if (!guideSkeleton) return [];

  const firstStep = guideSkeleton.steps[0];
  const secondStep = guideSkeleton.steps[1];

  return [
    "【结构先行参考】",
    `当前最优先的推进骨架参考是：${guideSkeleton.name}。`,
    firstStep ? `第一段职责：${firstStep.name}｜${firstStep.segmentTask || firstStep.purpose}` : "",
    secondStep ? `第二段要接：${secondStep.name}｜${secondStep.segmentTask || secondStep.purpose}` : "",
    "皮只负责前三秒抓人，但必须服务第一段职责。",
    "如果第一段是事件承接/风险承接，皮就先打事件、人物、平台、时间、冲突或异常，不要抢跑去讲方法。",
    "如果第一段是财富阶段/逻辑切换，皮可以先打时代变化、旧逻辑失效、结果判决，但不能慢慢解释。",
    "禁止出现这种错法：皮在讲业务结论，正文第一段却还在补事件事实。"
  ].filter(Boolean);
}

function sourceHasDirectBusinessAnchor(text: string) {
  return /(AI获客|数字IP|数字资产|获客|流量|私域|自动化|平台变化|内容增长|企业增长|老板增长|数字人|客户|订单|转化)/.test(text)
    || /(AI|人工智能).{0,12}(获客|流量|转化|客户|商业化|内容增长|数字人|企业增长|老板增长)/.test(text);
}

function splitViralReferenceParagraphs(task: TaskForm) {
  const sourceParagraphs = splitSourceParagraphs(task.sourceText || task.userNote);
  return sourceParagraphs
    .map((paragraph, index) => {
      const sentences = paragraph.match(/[^。！？!?]+[。！？!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
      if (!sentences.length) return "";
      if (index === 0) return sentences.slice(1).join("").trim();
      if (index === sourceParagraphs.length - 1) {
        return paragraph
          .replace(/，?趁现在还没划走.*$/g, "")
          .replace(/，?只要给这条视频.*$/g, "")
          .replace(/，?评论区.*$/g, "")
          .replace(/，?按照下方这行小字.*$/g, "")
          .replace(/，?到我主页.*$/g, "")
          .trim();
      }
      return paragraph.trim();
    })
    .filter(Boolean)
    .slice(0, 8);
}

function buildViralParagraphGuide(task: TaskForm) {
  if (task.entryType !== "viral") return "";
  const paragraphs = splitViralReferenceParagraphs(task);
  if (!paragraphs.length) return "";
  return [
    "【原文段落对照】",
    "除第一句钩子外，后续正文请尽量和下面这些原文段落一一对应去重改写：",
    ...paragraphs.map((paragraph, index) => `${index + 1}. ${paragraph}`),
  ].join("\n");
}

export async function runDecompose(
  settings: ApiSettings,
  profile: BaseProfile,
  task: TaskForm
): Promise<GenerationSource<DecomposeResult>> {
  const fallback = buildMockDecompose(task, profile);
  return generateJson({
    settings,
    profile,
    task,
    fallback,
    instruction:
      `请拆解这条素材，先判断核心命题、开头类型、核心冲突，再告诉我原文前三秒为什么不够炸。重点按“注意力警报”来分析皮：前4到8个字有没有先打锚点，有没有先下判决，有没有具体后果，有没有让人想问为什么。然后给出更炸的新皮、合适骨架、是否挂肉、怎么收口。风险提示务必具体。${buildEntryWorkflowInstruction(task.entryType)}`,
    schemaHint: JSON.stringify(
      {
        taskName: "string",
        summary: "string",
        hookAnalysis: { type: "string", example: "string", logic: "string" },
        skeletonAnalysis: { name: "string", steps: ["string"], why: "string" },
        meatAnalysis: { fit: "none|light|strong", reason: "string", example: "string" },
        ctaAnalysis: { type: "string", example: "string", reason: "string" },
        emotion: "string",
        reusablePoints: ["string"],
        risks: ["string"]
      },
      null,
      2
    )
  });
}

export async function runHookGeneration(
  settings: ApiSettings,
  profile: BaseProfile,
  task: TaskForm
): Promise<GenerationSource<{ items: HookItem[] }>> {
  const fallback = { items: buildMockHooks(task) };

  let coreContent = "";
  let entrySpecificInstruction = "";

  if (task.entryType === "viral") {
    coreContent = task.sourceText || "";
    entrySpecificInstruction = [
      "【仿写爆款要求】",
      "1. 先提炼原文最能打人的核心元素：人名、平台、时间、数字、事件、结论、后果。",
      "2. 3条钩子的核心命题必须一致，只能改表达强度、切入口和人群指向，不能改成别的主题。",
      "3. 如果原文没有业务词，不要强塞业务词。",
      "4. 严禁编造原文没有的人物、事件、热点和结论。"
    ].join("\n");
  } else if (task.entryType === "hotspot") {
    coreContent = task.sourceText || "";
    const sourceHasBusinessAnchor = sourceHasDirectBusinessAnchor(coreContent);
    entrySpecificInstruction = [
      "【蹭热点要求】",
      "1. 开头必须直接借热点本身的人物、平台、时间或冲突点，不要绕远。",
      "2. 先打时效性和异常感，再引出你的判断。",
      "3. 如果用户另外选了切入方向，第一句也先打事件本身，不要上来硬塞数字IP、数字资产、AI获客。",
      "4. 能说“24小时暴跌”“刚刚被处理”“高位暴跌”“突然换人”，就不要写成报告腔和新闻腔。",
      "5. 不要用“闪崩”“逻辑重构”“唯一确定性”这种太像黑话或广告判决的词，除非原素材里就有。",
      "6. 不要编无关热点，必须基于用户提供的内容。",
      sourceHasBusinessAnchor ? "7. 这条热点本身就带业务线索，可以自然提AI、增长、数字资产，但第一句仍然要先打事件。" : "7. 这条热点素材本身没有业务词，钩子第一句禁止硬塞AI获客、数字IP、数字资产、私域等业务词。"
    ].join("\n");
  } else if (task.entryType === "topic") {
    coreContent = task.topicGoal || "";
    entrySpecificInstruction = [
      "【主题创作要求】",
      "1. 先提炼核心观点里的冲突、代价、反差或结论，再决定开头怎么打。",
      "2. 不要为了炸而乱编故事，必须围绕核心观点。",
      "3. 如果这个主题更适合判决，就直接下判决；如果更适合拷问，就直接问。"
    ].join("\n");
  } else {
    coreContent = task.sourceText || "";
    entrySpecificInstruction = [
      "【我的故事要求】",
      "1. 开头优先打经历里的冲突、损失、反转或一句狠结论。",
      "2. 像老板本人开口，不要像新闻播报。",
      "3. 不要编无关故事，必须基于用户提供的经历内容。"
    ].join("\n");
  }

  return generateJson({
    settings,
    profile,
    task,
    fallback,
    instruction: [
      "请生成 3 条强力开头钩子（皮）。",
      "",
      "【核心内容】",
      coreContent,
      "",
      "先读内容，再提炼锚点。不要先选公式，再硬套内容。",
      "你要做的是：从这段内容里找最适合拿来打前三秒的那个点，而不是把同一套句式反复套上去。",
      "",
      ...buildHookStructureGuide(task),
      "",
      entrySpecificInstruction,
      "",
      "【通用要求】",
      "- 皮不是总结，不是观点概述，也不是慢慢铺垫；皮就是第一秒的注意力武器。",
      "- 最好前4到10个字就先打锚点或判决，让人立刻想问：为什么？真的假的？跟我有什么关系？",
      "- 每条钩子都必须是第一句话就能抓住人的句子，要像判决、爆料、命令、预警、拷问或异常发现。",
      ...buildHookPromptRuleLines({
        allowBusinessKeywords:
          task.entryType === "viral" ? false : task.entryType === "hotspot" ? sourceHasDirectBusinessAnchor(task.sourceText || "") : true
      }),
      "- 3条可以有不同注意力入口，但必须都跟这条内容强相关；如果某种入口不适合这个内容，就不要硬凑。",
      "- 每条钩子的 text 字段只写那一句开头，不要写后续内容。",
      "- type 字段写这条钩子的注意力逻辑名称（中文），例如：名人判决型、平台异动型、时间压迫型、拷问型、人群判决型、反差型。",
      "- riskLevel 写「低」「中」「高」，score 写 1-100 整数，platformFit 写「视频号」「抖音」或「通用」。",
      "",
      ...buildHookExampleLines(),
      "",
      "【生成步骤】",
      "1. 先从内容里提炼最强锚点：人名、平台、时间、数字、冲突、结论、后果。",
      "2. 再判断这条内容更适合哪种入口：判决、拷问、异常、时间压迫、命令、反差。",
      "3. 最后再写句子，保证前半句就有力，不能重点在后半句才出现。",
      "",
      "【严禁事项】",
      task.entryType === "viral"
        ? "- 仿写爆款时，严禁额外塞入原文没有的业务关键词和外部热点。"
        : "- 如果任务本身就在讲 AI 获客、数字资产、平台变化，这些词可以直接用，但不能空喊概念。",
      "- 严禁写“绝对没生意”“一定倒闭”这种脱离事实的判死刑句子。",
      "- 严禁编造原文中没有的人物、事件、热点和结论。",
      "- 严禁使用创作说明、括号注释、时长说明。"
    ].join("\n"),
    schemaHint: JSON.stringify(
      {
        items: [
          {
            id: "string",
            text: "string",
            type: "string",
            platformFit: "string",
            riskLevel: "低|中|高",
            score: 85
          }
        ]
      },
      null,
      2
    )
  });
}

export async function runSkeletonGeneration(
  settings: ApiSettings,
  profile: BaseProfile,
  task: TaskForm
): Promise<GenerationSource<{ items: SkeletonItem[] }>> {
  const fallback = { items: buildMockSkeletons(task) };
  const strategy = analyzeTaskStrategy(task);

  const entrySpecificHint =
    task.entryType === "viral"
      ? "仿写爆款：优先拆原文段落怎么推进，尽量保留原文中段顺序和层级，骨只写中段，不写开头和结尾。"
      : task.entryType === "hotspot"
      ? "蹭热点：骨应该先接住热点，再映射现实、升级风险、过桥到新认知，最后才落方法。"
      : task.entryType === "topic"
      ? "主题创作：骨应该让观点一层层往下压，每一段都要有内容兑现，不要空转。"
      : "我的故事：骨应该把冲突、代价、转向、反转、认知串起来。";

  return generateJson({
    settings,
    profile,
    task,
    fallback,
    instruction: [
      "请推荐 3 套最适合当前任务的短视频推进职责骨架。",
      "",
      entrySpecificHint,
      "",
      "【当前内容策略】",
      ...formatTaskStrategyLines(strategy),
      "",
      "【核心要求】",
      "- 骨只负责中段结构，不包含钩子，不包含收口，不包含互动，不包含CTA。",
      task.entryType === "viral" ? "- 仿写爆款时，第一套骨架优先按原文段落顺序拆，允许 4 到 8 个中段步骤。" : "- 每套骨架给 4 到 6 个中段步骤，哪怕是金句型也不能只有一句判断。",
      "- steps 字段必须详细列出每一步的推进职责，不要只给提纲标签。",
      "- 每一步必须输出这些字段：name、purpose、targetWords、role、segmentTask、minSentences、mustInclude、forbidden、bridgeToNext、allowMeat、requireSource。",
      "- role 只能从这些值里选：event、mapping、risk、reason、bridge、identity、solution、proof、landing、conflict、reversal、payoff、suspense、generic。",
      "- segmentTask 要写清楚这一段具体负责推进什么，不能写空话。",
      "- minSentences 写 1 到 5 的整数。除收束落点外，通常不要低于 2。",
      "- mustInclude 写 1 到 3 个本段必须出现的内容元素，例如：事实、对象动作、代价、旧逻辑、新逻辑、老板困局、方法线索。",
      "- forbidden 写 1 到 3 个本段绝对不能做的事，例如：只下结论、提前卖服务、脱离素材、重复前段。",
      "- bridgeToNext 要写清这一步完成后，下一步应该推进到什么问题。",
      "- allowMeat 只有中后段才允许为 true。前半段默认 false。",
      "- requireSource=true 表示这一段必须优先吃用户素材里的事实，不要空讲概念。",
      "- 步骤名称要像中段推进模块，例如：现实切口、代价放大、原因拆开、悬念承接、关键答案、现实映射、新认知桥、解法落点、结果反转、认知压实、财富阶段展开、变现逻辑易位、资产概念重塑、经营困局剖析。",
      "- 禁止出现这些步骤名称：钩子、爆点、开头、收口、互动、CTA、结尾、标题。",
      "- 骨架本质是留人推进链，不是题材标签。每一步都必须让观众继续想听下一句。",
      "- 你不是在压缩提纲，而是在设计推进链。每一步都要明确：为什么存在、推进到哪里、下一步怎么接。",
      "- 如果某一步只有结论，没有事实、解释、代入、转折或结果压实，这一步就算失败。",
      "- 骨架里必须考虑中后段如何先做概念桥/塑品，再决定要不要落服务肉，不能钩子后两句就卖。",
      "- 如果是财富演化、行业变化、趋势认知类内容，必须体现“旧资源失效 → 新资源接管 → 用户困局 → 解法出现”的顺序。",
      strategy.bridgeStrength === "weak"
        ? "- 当前内容桥接强度偏弱，骨架默认不要强挂业务，优先做事实承接、风险/影响映射和认知升级。"
        : strategy.bridgeStrength === "medium"
          ? "- 当前内容桥接强度为中，只允许在中后段轻落业务，不要把业务写成这条热点的重点。"
          : "- 当前内容桥接强度较强，可以在完成事实承接和认知过桥后自然带出业务。",
      "- 骨架要符合当前入口类型的特点，不要千篇一律，也不要写成一句话。",
      "",
      buildEntryWorkflowInstruction(task.entryType)
    ].join("\n"),
    schemaHint: JSON.stringify(
      {
        items: [
          {
            id: "string",
            name: "string",
            scenario: "string",
            summary: "string",
            steps: [
              {
                name: "string",
                purpose: "string",
                targetWords: 20,
                role: "mapping",
                segmentTask: "string",
                minSentences: 2,
                mustInclude: ["string"],
                forbidden: ["string"],
                bridgeToNext: "string",
                allowMeat: false,
                requireSource: true
              }
            ]
          }
        ]
      },
      null,
      2
    )
  });
}

export async function runMeatGeneration(
  settings: ApiSettings,
  profile: BaseProfile,
  task: TaskForm
): Promise<GenerationSource<{ items: MeatItem[] }>> {
  const fallback = { items: buildMockMeat(task, profile) };
  const strategy = analyzeTaskStrategy(task);

  const entrySpecificHint =
    task.entryType === "viral"
      ? "仿写爆款：如果原文有业务植入，参考它那种丝滑植入方式；如果没有，也要给出自然不突兀的轻肉方案。"
      : task.entryType === "hotspot"
      ? "蹭热点：业务植入要自然，从热点映射到你的业务，不要硬转，要让人感觉你是顺着这个事件把解决方案带出来。"
      : task.entryType === "topic"
      ? "主题创作：业务植入要像解决方案，不要像广告，要让用户觉得你真的能帮他解决这个问题。"
      : "我的故事：业务植入要像老板的认知总结和方法沉淀，不要像推销。";

  return generateJson({
    settings,
    profile,
    task,
    fallback,
    instruction: [
      "请生成适合当前任务的业务植入表达（肉）。",
      "",
      entrySpecificHint,
      "",
      "【当前内容策略】",
      ...formatTaskStrategyLines(strategy),
      "",
      "【核心要求】",
      "- 肉的定义：把自己的产品、服务、方法、能力丝滑地放进正文里。",
      "- 肉必须保证丝滑、像内容、不要硬广、不要像说明书。",
      "- 肉最好分成两层理解：前面先有概念桥/塑品，后面再有服务肉，不要直接从热点或观点跳产品。",
      "- 肉要让用户知道：你是谁，你帮别人解决什么问题，为什么他后面会想进一步找你。",
      "- 轻肉可以只是一句结果判断；强肉可以更明确，但也不能连续硬卖。",
      strategy.allowedBusinessMode === "none"
        ? "- 当前任务默认不适合挂业务，请优先给不挂肉/认知桥版本，不要强卖。"
        : strategy.allowedBusinessMode === "light"
          ? "- 当前任务最多只允许轻肉，最多 1 句结果型或认知桥型表达，不要出现重服务推销。"
          : "- 当前任务可正常挂肉，但也必须先有概念桥，再有服务肉。",
      "- 所有 type 字段必须是中文。",
      "- intensity 字段写 none（不挂肉）、light（轻肉）、strong（强肉）。",
      "- smoothnessScore 字段写 1-100 整数，表示丝滑度。",
      "- 必须分别输出 bridgeText、serviceText、actionPrepText 三个字段：bridgeText 负责过桥，serviceText 负责服务/角色承接，actionPrepText 负责给最终动作位铺垫。",
      "",
      buildEntryWorkflowInstruction(task.entryType)
    ].join("\n"),
    schemaHint: JSON.stringify(
      {
        items: [
          {
            id: "string",
            type: "string",
            text: "string",
            bridgeText: "string",
            serviceText: "string",
            actionPrepText: "string",
            intensity: "none|light|strong",
            smoothnessScore: 80
          }
        ]
      },
      null,
      2
    )
  });
}

export async function runCtaGeneration(
  settings: ApiSettings,
  profile: BaseProfile,
  task: TaskForm
): Promise<GenerationSource<{ items: CtaItem[] }>> {
  const fallback = { items: buildMockCtas(task, profile) };

  const entrySpecificHint =
    task.entryType === "viral"
      ? "仿写爆款：参考原文的收口方式，但要更清晰、更有行动指引。"
      : task.entryType === "hotspot"
      ? "蹭热点：收口要快速导流，利用热点的讨论氛围引导评论。"
      : task.entryType === "topic"
      ? "主题创作：收口要像邀请，让用户参与讨论或获取更多内容。"
      : "我的故事：收口要像老板的邀请，让用户感受到真诚和价值。";

  return generateJson({
    settings,
    profile,
    task,
    fallback,
    model: settings.batchModel || settings.mainModel,
    instruction: [
      "请生成 5 条不同风格的导流结尾（收口）。",
      "",
      entrySpecificHint,
      "",
      "【核心要求】",
      "- 每条收口都必须是一个短句，最好一句话就收住。",
      "- 所有收口都必须以评论区动作作为第一动作。",
      "- 可以是纯评论互动，也可以是评论后领资料、评论后看主页。",
      '- 不要脱离评论区直接导流（比如直接说"关注我"、"私信我"）。',
      "- 不要在一条收口里同时塞点赞、收藏、转发、关注四五个动作。",
      "- 所有 type 和 scenario 字段必须是中文。",
      '- type 字段写收口类型（如"评论区互动型"、"关键词领资料型"）。',
      '- scenario 字段写适用场景（如"评论区 / 视频号"、"私域导流 / 抖音"）。',
      "",
      buildEntryWorkflowInstruction(task.entryType)
    ].join("\n"),
    schemaHint: JSON.stringify(
      {
        items: [
          {
            id: "string",
            type: "string",
            text: "string",
            scenario: "string"
          }
        ]
      },
      null,
      2
    )
  });
}

export async function runDraftGeneration(
  settings: ApiSettings,
  profile: BaseProfile,
  task: TaskForm,
  hook: HookItem,
  skeleton: SkeletonItem,
  meat: MeatItem | null,
  cta: CtaItem
): Promise<GenerationSource<{ items: DraftItem[] }>> {
  const fallback = { items: buildMockDrafts(task, profile, hook, skeleton, meat, cta) };
  const skeletonExecutionLines = formatSkeletonExecutionLines(skeleton);
  const meatStartIndex = getSkeletonMeatStartIndex(skeleton);
  const strategy = analyzeTaskStrategy(task);

  const viralParagraphGuide = buildViralParagraphGuide(task);
  const selectedParts = [
    `已选钩子：${hook.text}`,
    `已选骨架：${skeleton.name}（${skeleton.steps.map(s => s.name).join(" → ")}）`,
    "内容策略：",
    ...formatTaskStrategyLines(strategy),
    "骨架执行单：",
    ...skeletonExecutionLines,
    viralParagraphGuide,
    meat ? `已选肉：桥层：${meat.bridgeText || ""} / 服务层：${meat.serviceText || ""} / 动作铺垫：${meat.actionPrepText || ""}` : "不挂肉",
    `已选收口：${cta.text}`
  ].filter(Boolean).join("\n");

  return generateJson({
    settings,
    profile,
    task,
    fallback,
    model: settings.batchModel || settings.mainModel,
    instruction: [
      "请基于用户选中的皮、骨、肉、收口，生成 5 个不同版本的完整短视频文案。",
      "",
      selectedParts,
      "",
      "=== 结构约束 ===",
      "1. 第一段必须原样使用已选钩子作为第一句，一个字都不能改。",
      "2. 不能在钩子前加任何铺垫或解释。",
      "3. 中段严格按照已选骨架的顺序推进，但不要把骨架步骤名称写进正文。",
      `4. 当前骨架是：${skeleton.steps.map((s) => s.name).join(" → ")}`,
      "5. 你不是在压缩提纲，而是在重建推进。必须完成当前步骤职责后，才能进入下一步。",
      "6. 如果某一段只有结论，没有事实、解释、代入、转折、结果中的任一层，这一段视为失败，必须重写。",
      "7. 中段前两段优先使用素材里的事实、对象、动作、时间点、平台名，不要一上来就讲世界观。",
      "8. 骨是中段结构，所以正文不能把所有重点都堆到最后一段，更不能钩子后两句就开始卖。",
      "9. 最后一段必须原样使用已选收口作为最后一句。",
      "",
      "=== 推进硬规则 ===",
      "1. 每一步至少满足骨架执行单里的句数要求，不能偷段、并段、跳段。",
      "2. 如果步骤 requireSource=true，优先复用或改写用户素材，不要脱离素材自由发挥。",
      "3. 如果步骤里出现“财富阶段展开 / 逻辑易位 / 概念重塑”这类职责，必须讲出递进关系，不能只列名词标签。",
      "4. 如果步骤里有“经营困局 / 用户代入”，必须先让用户代入，再出现解决方案。",
      "5. 禁止把整篇写成‘一句世界观 + 两句卖点 + 直接收口’的摘要广告稿。",
      strategy.bridgeStrength === "weak"
        ? "6. 当前热点桥接强度偏弱，中段禁止把公共议题硬改成业务主张，优先做事实承接、风险升级和经营映射。"
        : strategy.bridgeStrength === "medium"
          ? "6. 当前热点桥接强度为中，允许在中后段轻落业务，但不能把业务写成这条内容的主命题。"
          : "6. 当前内容桥接强度较强，但也必须先完成事实承接和认知过桥，再出现解法。",
      "",
      "【肉（业务植入）】",
      meat
        ? `1. 只能放在中后段自然植入${meatStartIndex >= 0 ? `，最早从第${meatStartIndex + 1}步开始` : ""}\n2. 在 allowMeat=false 的步骤里，禁止出现产品、服务、系统、我们做的、我帮你、方法发给你这类业务句\n3. 先有概念桥/塑品，再有服务肉，不要从热点或观点直接跳产品\n4. 要像内容的一部分，不要像硬广\n5. 要让用户知道你能解决什么问题，并想进一步来找你\n6. ${strategy.allowedBusinessMode === "none" ? "当前内容不适合挂肉，如所选肉过重，请自动弱化成认知桥或直接忽略。" : strategy.allowedBusinessMode === "light" ? "当前内容最多只允许轻肉，最多 1 句，不要抢掉正文主线。" : "最多 1 到 2 句，不要抢掉正文主线。"}`
        : "1. 不挂肉，全程不提业务\n2. 专注讲内容本身，不要引导到产品或服务",
      "",
      "=== 内容来源规则 ===",
      "1. 所有正文必须严格基于当前任务内容来写，不能外扩到用户没给的人物、事件、热点和故事。",
      "2. 仿写爆款时，要保留参考文案的核心命题和论证方向，只改表达，不改主题。",
      "2.1 仿写正文要逐段贴着原文走，尽量一段对应一段，不要把多段压成一段摘要。",
      "2.2 每一段都只做轻微去重，优先保留原句式、原爆点、原数字、原后果和原判断。",
      "3. 热点任务要用热点本身做推进，不要空泛说教。",
      "4. 老板故事要基于经历口述，不要编出额外桥段。",
      "5. 不能只让第一句和最后一句贴题，中段每一步也必须继续使用用户给的参考内容、事实、判断和方向，不要写成通用模板句式。",
      "6. 中段前两段优先复用或改写素材里的事实、对象、动作、时间点、平台名、人物名，不要一上来就写抽象判断。",
      "7. 如果素材里有2到4个连续信息点，就按那个顺序往下推，不要把所有判断都塞到最后。",
      "8. 中段必须持续给内容回报：事实承接、判断升级、原因解释、概念桥、结果落点，至少要占到其中3层以上。",
      `9. 以下跳转禁止出现：${strategy.forbiddenJumps.join("；")}`,
      "",
      "=== 字数与节奏 ===",
      "- 句子尽量短，单句优先控制在 12 到 28 个字；一旦超过 30 个字，主动断成两句。",
      "- 口播感优先，宁可多断句，也不要写成长条说明文。",
      task.entryType === "viral"
        ? "【仿写爆款】\n- 严格按原文的段落结构和推进顺序写，段落数尽量保持不变\n- 总字数尽量保持在原文的90%到110%，每一段字数也尽量贴着原文\n- 句数尽量贴着原文，原文是长句就继续长句，原文是短句就继续短句\n- 原文的爆点、判决句、反问句、数字、后果和三点式结构，能保留就尽量保留\n- 改写只做轻微调词、去重、换表达，不要改骨架，不要新增新的论证层，不要偷字"
      : task.entryType === "hotspot"
        ? "【蹭热点】\n- 600-900字\n- 先事件，后映射，再升级风险，再过桥到新认知，最后再落点"
        : task.entryType === "topic"
        ? "【主题创作】\n- 500-800字\n- 围绕核心观点层层推进，每一段都要有内容兑现，不依赖外部素材也不能空泛"
        : "【我的故事】\n- 600-900字\n- 冲突、代价、转向、反转、认知都要落到画面感上",
      "",
      "=== 输出格式 ===",
      "1. 必须输出：versionName、title、coverLine、script、subtitleScript",
      "2. script 只写纯正文，不要写【钩子】【判断】这类标签，不要写注释，不要写创作说明。",
      "3. subtitleScript 只写纯字幕分行，不要加任何前缀、标签和注释。",
      "4. 禁止出现括号注释、镜头词、时长说明、创作提示、系统语。",
      "",
      "=== 版本差异 ===",
      "- 版本1（标准版）：按照骨架标准展开，情绪中性，适合大众",
      "- 版本2（激进版）：情绪更强烈，判断更犀利，用词更冲击",
      "- 版本3（判决版）：像下判决书一样，语气坚定，结论明确",
      "- 版本4（口语版）：更像聊天，多用短句、反问、停顿，接地气",
      "- 版本5（老板版）：像老板自己讲话，有经验感、有决策感、有格局感",
      "- 每个版本的中段展开和语言力度都要不同，不能只改几个词",
      "",
      buildEntryWorkflowInstruction(task.entryType)
    ].join("\n"),
    schemaHint: JSON.stringify(
      {
        items: [
          {
            id: "string",
            versionName: "标准版 / 激进版 / 判决版 / 口语版 / 老板版",
            title: "string",
            coverLine: "string",
            script: "string",
            subtitleScript: "string",
            selectedHookId: hook.id,
            selectedSkeletonId: skeleton.id,
            selectedMeatId: meat?.id ?? null,
            selectedCtaId: cta.id,
            platformFit: "视频号优先"
          }
        ]
      },
      null,
      2
    )
  });
}

export async function runDraftScore(
  settings: ApiSettings,
  profile: BaseProfile,
  task: TaskForm,
  draft: DraftItem
): Promise<GenerationSource<ScoreCard>> {
  const fallback = buildMockScore(draft, task);
  return generateJson({
    settings,
    profile,
    task,
    fallback,
    model: settings.polishModel || settings.mainModel,
    instruction: [
      "请从皮的强度、前三秒停留感、骨架流畅度、肉的丝滑度、导流清晰度、平台适配度、风险控制、AI味控制这 8 个维度给当前文案打分。",
      "同时给出问题提示、优化建议、可替换句。",
      `当前文案如下：\n${draft.script}`
    ].join("\n"),
    schemaHint: JSON.stringify(
      {
        totalScore: 85,
        summary: "string",
        dimensions: [{ label: "string", score: 80 }],
        issues: ["string"],
        suggestions: ["string"],
        replaceLines: ["string"]
      },
      null,
      2
    )
  });
}




