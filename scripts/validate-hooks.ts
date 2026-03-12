import { explainHookLead, getHookLeadScore, hasSoftHookLead, isAlarmStyleHook } from "../src/lib/hookEngine";
import { buildMockHooks } from "../src/lib/mock";
import { TaskForm } from "../src/types";

declare const process: { exit(code?: number): void };

type SampleCase = {
  name: string;
  expectedTopPattern: RegExp;
  expectedAnyPattern?: RegExp;
  task: TaskForm;
};

const sampleCases: SampleCase[] = [
  {
    name: "名人/大人物开场",
    expectedTopPattern: /^(刘强东|马斯克|黄仁勋|明星|网红|于文红|将来明星和网红|这两天，明星和网红)/,
    task: {
      entryType: "viral",
      entryTypeChosen: true,
      sourceText:
        "将来明星和网红都会很可怜，你等着看吧，明星以后可能会越来越不值钱，代言被网红抢走，电影没人看，短剧成本又扛不住。",
      userNote: "",
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
    name: "平台大厂开场",
    expectedTopPattern: /^(腾讯|微信|刚刚|从2月1号开始)/,
    task: {
      entryType: "hotspot",
      entryTypeChosen: true,
      sourceText:
        "从2月1号开始，腾讯要在一个很多人还没注意到的地方派发十亿现金红包，这次的红包不在微信，而是通过腾讯的AI应用元宝来发。",
      userNote: "",
      hotspotAngle: "从平台动作和少数人知道的机会切入",
      topicGoal: "",
      storyConclusion: "",
      businessMode: "light",
      businessModeChosen: true,
      ctaMode: "keyword",
      ctaModeChosen: true
    }
  },
  {
    name: "命令/人群开场",
    expectedTopPattern: /^(刚刚|从今年开始|AI|老板一定要|一定要|不会AI获客的老板|传统拉客户的老板)/,
    task: {
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
    }
  },
  {
    name: "修行/认知开场",
    expectedTopPattern: /^(一定要跟学佛的人做朋友|学佛的人|修行的人)/,
    task: {
      entryType: "topic",
      entryTypeChosen: true,
      sourceText: "",
      userNote: "",
      hotspotAngle: "",
      topicGoal: "一定要跟学佛的人做朋友，因为他们有智慧、有底线、有慈悲",
      storyConclusion: "",
      businessMode: "none",
      businessModeChosen: true,
      ctaMode: "comment",
      ctaModeChosen: true
    }
  },
  {
    name: "争议问句开场",
    expectedTopPattern: /^(不结婚到底有多惨|不结婚|婚姻)/,
    expectedAnyPattern: /到底有多/,
    task: {
      entryType: "viral",
      entryTypeChosen: true,
      sourceText:
        "不结婚真的会很惨吗？现在老是说你不结婚以后老了死在家里都没有人知道，其实我感觉人生最可靠的还是钱。",
      userNote: "",
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
    name: "热点事件不硬桥业务",
    expectedTopPattern: /^(国际油价|油价|24小时)/,
    task: {
      entryType: "hotspot",
      entryTypeChosen: true,
      sourceText: "国际油价单日巨震30%，从120美元高位回落到80美元附近，外界讨论集中在油价波动和企业成本变化。",
      userNote: "",
      hotspotAngle: "从数字IP角度切入",
      topicGoal: "",
      storyConclusion: "",
      businessMode: "light",
      businessModeChosen: true,
      ctaMode: "keyword",
      ctaModeChosen: true
    }
  },
  {
    name: "监管热点先打事件",
    expectedTopPattern: /^(两会|AI|代表|委员|网约车)/,
    task: {
      entryType: "hotspot",
      entryTypeChosen: true,
      sourceText:
        "两会节目集中回应AI“龙虾”应用风险、AI替代工作和网约车监管问题，代表委员都在讨论算法边界和平台责任。",
      userNote: "",
      hotspotAngle: "从数字IP角度切入",
      topicGoal: "",
      storyConclusion: "",
      businessMode: "light",
      businessModeChosen: true,
      ctaMode: "keyword",
      ctaModeChosen: true
    }
  }
];

let failed = false;

for (const sample of sampleCases) {
  const hooks = buildMockHooks(sample.task);
  const topHooks = hooks.slice(0, 3);
  const topHook = topHooks[0];
  const alarmCount = topHooks.filter((item) => isAlarmStyleHook(item.text)).length;

  console.log(`\n=== ${sample.name} ===`);
  topHooks.forEach((hook, index) => {
    console.log(
      `${index + 1}. [${hook.type}] ${hook.text} | lead=${getHookLeadScore(hook.text)} | ${explainHookLead(hook.text).join("、")}`
    );
  });

  if (!sample.expectedTopPattern.test(topHook.text)) {
    failed = true;
    console.error(`首条不符合预期锚点：${topHook.text}`);
  }

  if (sample.expectedAnyPattern && !topHooks.some((item) => sample.expectedAnyPattern?.test(item.text))) {
    failed = true;
    console.error(`前3条没有出现目标结构：${sample.expectedAnyPattern}`);
  }

  if (sample.name === "命令/人群开场" && topHooks.some((item) => /(老办法|开始难受|迟早先没客户|根本没客户)/.test(item.text))) {
    failed = true;
    console.error("命令/判决组仍然出现了你明确否掉的模糊句式");
  }

  if (sample.name === "热点事件不硬桥业务" && topHooks.some((item) => /(数字IP|数字资产|AI获客|私域)/.test(item.text))) {
    failed = true;
    console.error("热点事件组仍然在第一层硬桥接业务词");
  }

  if (sample.name === "监管热点先打事件" && topHooks.some((item) => /(数字IP|数字资产|AI获客|私域|系统方案)/.test(item.text))) {
    failed = true;
    console.error("监管热点组仍然在第一层硬桥接业务词");
  }

  if (alarmCount < 2) {
    failed = true;
    console.error(`前3条警报型皮不足 2 条，当前只有 ${alarmCount} 条`);
  }

  if (getHookLeadScore(topHook.text) < 42) {
    failed = true;
    console.error(`首条 lead score 过低：${getHookLeadScore(topHook.text)}`);
  }

  if (hasSoftHookLead(topHook.text)) {
    failed = true;
    console.error(`首条出现软起手：${topHook.text}`);
  }
}

if (failed) {
  console.error("\nHook validation failed.");
  process.exit(1);
}

console.log("\nAll hook validation cases passed.");
