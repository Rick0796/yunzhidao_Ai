import { buildMockCtas, buildMockDrafts, buildMockHooks, buildMockMeat, buildMockSkeletons, defaultBaseProfile } from "../src/lib/mock";
import { TaskForm } from "../src/types";

declare const process: { exit(code?: number): void };

const tasks: TaskForm[] = [
  {
    entryType: "viral",
    entryTypeChosen: true,
    sourceText:
      "2026年新时代到来一定要牢记这条路子。最新爆出来的消息一定要听好，如果你现在正在床上躺着，那你先不要起来，先把这条视频看完，要不然我怕你理解不了。2025年过后，2026年，中国最好做的生意开始出现了一场真正的大变革悄然来临，财富将迎来大洗牌。\n\n20年前的风口是地产，十年前的风口是淘宝，五年前的风口是微商，而未来将会是人工智能的主场。如果你错过了前三个，那么人工智能的风口，你千万别错过。\n\n我们可以利用AI带来的效率优势，在产业里面击败其他竞争对手。现在已经不是你想不想学人工智能的问题了，是学得快不快。谁先抓住人工智能，谁就是数字时代的新贵。",
    userNote: "",
    hotspotAngle: "",
    topicGoal: "",
    storyConclusion: "",
    businessMode: "light",
    businessModeChosen: true,
    ctaMode: "keyword",
    ctaModeChosen: true
  },
  {
    entryType: "hotspot",
    entryTypeChosen: true,
    sourceText: "从2月1号开始，腾讯要在一个很多人还没注意到的地方派发十亿现金红包，这次的红包不在微信，而是通过腾讯的AI应用元宝来发。",
    userNote: "",
    hotspotAngle: "从平台动作和少数人知道的机会切入",
    topicGoal: "",
    storyConclusion: "",
    businessMode: "light",
    businessModeChosen: true,
    ctaMode: "keyword",
    ctaModeChosen: true
  },
  {
    entryType: "topic",
    entryTypeChosen: true,
    sourceText: "",
    userNote: "",
    hotspotAngle: "",
    topicGoal: "讲透老板一定要尽快把AI装进获客链路，不然会先掉客户",
    storyConclusion: "",
    businessMode: "strong",
    businessModeChosen: true,
    ctaMode: "lead",
    ctaModeChosen: true
  },
  {
    entryType: "boss_story",
    entryTypeChosen: true,
    sourceText: "我把一个卷走公司几百万的人放过了，后来他反过来帮我赚回了更多钱。",
    userNote: "",
    hotspotAngle: "",
    topicGoal: "",
    storyConclusion: "把恨转成爱，有时候比把人送进去更值钱。",
    businessMode: "none",
    businessModeChosen: true,
    ctaMode: "comment",
    ctaModeChosen: true
  },
  {
    entryType: "topic",
    entryTypeChosen: true,
    sourceText:
      "很多人都知道数字时代来了，但真正值钱的东西，99%的人还没看懂。农业时代最值钱的是土地，工业时代真正值钱的是机器和工厂，互联网时代真正值钱的是流量。现在第四次变化已经开始了，真正值钱的是数字资产。很多老板不是不努力，而是不会拍、不会写、不懂规则，明明知道线上重要，却没有一套能稳定跑起来的内容获客系统。现在真正聪明的做法，不是继续用人力硬扛，而是用AI把这套获客系统跑起来。",
    userNote: "",
    hotspotAngle: "",
    topicGoal: "讲透财富资源如何从土地、机器、流量切换到数字资产，再自然落到AI获客系统",
    storyConclusion: "",
    businessMode: "light",
    businessModeChosen: true,
    ctaMode: "keyword",
    ctaModeChosen: true
  },
  {
    entryType: "hotspot",
    entryTypeChosen: true,
    sourceText:
      "两会节目集中回应AI“龙虾”应用风险、AI替代工作和网约车监管问题，代表委员讨论算法边界、平台责任和司机权益保障。",
    userNote: "",
    hotspotAngle: "从老板视角切到AI合规使用边界",
    topicGoal: "",
    storyConclusion: "",
    businessMode: "light",
    businessModeChosen: true,
    ctaMode: "keyword",
    ctaModeChosen: true
  }
];

const bannedStepPattern = /(钩子|爆点|开头|收口|互动|CTA|结尾)/i;
const bannedDraftPattern = /(【[^】]+】|脚本如下|正文[:：]|字幕稿[:：]|创作说明|镜头|时长)/;
const servicePattern = /(我们现在做的|帮老板|进一步来找你|方法发给你|完整内容发给你)/;

let failed = false;

for (const task of tasks) {
  const skeletons = buildMockSkeletons(task);

  console.log(`\n=== ${task.entryType} ===`);
  skeletons.forEach((skeleton) => {
    const stepNames = skeleton.steps.map((step) => step.name);
    console.log(`骨架：${skeleton.name} -> ${stepNames.join(" → ")}`);

    if (stepNames.some((name) => bannedStepPattern.test(name))) {
      failed = true;
      console.error(`骨架仍然混入了开头/收口语义：${skeleton.name}`);
    }

    if (task.entryType !== "viral" && stepNames.length < 4) {
      failed = true;
      console.error(`非仿写骨架步骤过少，无法形成递进：${skeleton.name}`);
    }

    skeleton.steps.forEach((step) => {
      if (!step.segmentTask || !step.minSentences || !step.mustInclude?.length || !step.forbidden?.length) {
        failed = true;
        console.error(`骨架步骤缺少推进元数据：${skeleton.name} / ${step.name}`);
      }
    });
  });

  if (/数字资产/.test(task.sourceText + task.topicGoal) && skeletons[0]?.id !== "sk-wealth") {
    failed = true;
    console.error(`财富演化类任务没有优先命中财富演化骨架：${task.topicGoal}`);
  }

  if (/AI“龙虾”|网约车监管|算法边界/.test(task.sourceText + task.topicGoal) && skeletons[0]?.id !== "sk-risk") {
    failed = true;
    console.error(`监管边界类任务没有优先命中风险监管骨架：${task.sourceText}`);
  }

  const hook = buildMockHooks(task)[0];
  const skeleton = skeletons[0];
  const meat = task.businessMode === "none" ? null : buildMockMeat(task, defaultBaseProfile)[0] ?? null;
  const cta = buildMockCtas(task, defaultBaseProfile)[0];
  const drafts = buildMockDrafts(task, defaultBaseProfile, hook, skeleton, meat, cta);

  drafts.forEach((draft, index) => {
    const paragraphs = draft.script.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    const earlyBody = paragraphs.slice(1, 3).join("\n");
    const lateBody = paragraphs.slice(3, -1).join("\n");
    console.log(`成品${index + 1}：首段=${paragraphs[0]} | 末段=${paragraphs[paragraphs.length - 1]}`);

    if (bannedDraftPattern.test(draft.script) || bannedDraftPattern.test(draft.subtitleScript)) {
      failed = true;
      console.error(`成品仍然带标签或注释：${draft.versionName}`);
    }

    if (paragraphs[0] !== hook.text) {
      failed = true;
      console.error(`成品首段没有原样接住皮：${draft.versionName}`);
    }

    if (paragraphs[paragraphs.length - 1] !== cta.text) {
      failed = true;
      console.error(`成品末段没有原样落到收口：${draft.versionName}`);
    }

    if (task.entryType !== "viral" && paragraphs.length < 6) {
      failed = true;
      console.error(`非仿写成品段落过少，推进不够：${draft.versionName}`);
    }

    if (task.businessMode !== "none" && servicePattern.test(earlyBody)) {
      failed = true;
      console.error(`业务露出过早，仍然有硬卖风险：${draft.versionName}`);
    }

    const meatSnippet = meat?.text.slice(0, 10) ?? "";

    if (task.businessMode !== "none" && !(servicePattern.test(lateBody) || (meatSnippet && lateBody.includes(meatSnippet)))) {
      failed = true;
      console.error(`业务露出没有落到中后段：${draft.versionName}`);
    }

    if (/数字资产/.test(task.sourceText + task.topicGoal) && !/(农业时代|工业时代|互联网时代|数字时代|数字资产)/.test(draft.script)) {
      failed = true;
      console.error(`财富演化案例没有保住核心阶段素材：${draft.versionName}`);
    }
  });
}

if (failed) {
  console.error("\nStructure validation failed.");
  process.exit(1);
}

console.log("\nAll structure validation cases passed.");
