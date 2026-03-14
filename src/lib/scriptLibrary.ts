export interface ScriptSectionItem {
  originalId: string;
  theme: string;
  primaryDirection: string;
  secondaryDirection: string;
  audience: string;
  materialId: string;
  sourceKey: string;
  type: string;
  index: number | null;
  sourceIndex: number | null;
  label: string;
  orderIndex: number;
  content: string;
  entityTag?: string;
  topicFamily?: string;
  bindingScope?: string;
}

export interface ScriptSectionResponse {
  items: ScriptSectionItem[];
  count: number;
  filters: {
    primaryDirection: string;
    secondaryDirection: string;
    sectionType: string;
    limit: number;
  };
}

function normalizeMetaText(...parts: Array<string | undefined>) {
  return parts
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function containsMarkers(text: string, markers: string[]) {
  return markers.some((marker) => text.includes(marker.toLowerCase()));
}

function inferLocalEntityTag(item: ScriptSectionItem) {
  const text = normalizeMetaText(item.theme, item.secondaryDirection, item.content, item.entityTag);
  if (containsMarkers(text, ["马斯克", "musk", "spacex", "特斯拉"])) return "musk";
  if (containsMarkers(text, ["马云", "蚂蚁"])) return "jack_ma";
  if (containsMarkers(text, ["大力老师", "周老师", "云智道", "技术顾问团", "我们公司"])) return "brand";
  return item.entityTag || "none";
}

function inferLocalTopicFamily(item: ScriptSectionItem) {
  // secondaryDirection is a document-level routing label and can pollute every block
  // into the same family (for example "训练营导流"). For per-block matching we infer
  // family mainly from the section text itself.
  const text = normalizeMetaText(item.theme, item.primaryDirection, item.content);

  if (containsMarkers(text, ["训练营", "直播课", "公开课", "直播入口", "我要学习", "财道营"])) return "ai_training_offer";
  if (containsMarkers(text, ["全面ai化", "涨粉1.2亿", "全流程自动化", "技术顾问团", "真实落地的系统"])) return "ai_system_proof";
  if (containsMarkers(text, ["普通老百姓", "买不起", "不是房子"])) return "wealth_priority_shift";
  if (containsMarkers(text, ["不是在吹牛", "风险提示书", "越听越后背发凉"])) return "risk_alert";
  if (containsMarkers(text, ["新的财富风口在哪里", "接下来这五分钟很重要", "我做的预言全都会兑现"])) return "hook_prediction_confidence";
  if (containsMarkers(text, ["下面这些话可能不讨喜", "早三年走出焦虑", "影响接下来几十年"])) return "hook_hard_truth";
  if (containsMarkers(text, ["全球80亿人都不知道的秘密", "99%的人还蒙在鼓里"])) return "hook_global_secret";
  if (containsMarkers(text, ["如果今天你看懂了", "正在经历的负债", "过得最轻松的一批人"])) return "hook_watch_carefully";
  if (containsMarkers(text, ["微商会火", "直播会爆", "买黄金", "趋势从来不会等人"])) return "trend_history_validation";
  if (containsMarkers(text, ["30年前", "未来人人有手机", "不用带现金", "最后让所有人不得不接受"])) return "trend_historical_analogy";
  if (containsMarkers(text, ["89年的时候", "开工厂太牛了", "错过了互联网", "跟上时代走"])) return "trend_factory_shift";
  if (containsMarkers(text, ["数字资产", "硬通货", "数字时代"])) return "ai_digital_asset";
  if (containsMarkers(text, ["效率系统", "应用场景", "变现逻辑", "能力重估"])) return "ai_efficiency_system";
  if (containsMarkers(text, ["会用ai", "驾驭机器", "想象力", "创造力", "共情力"])) return "ai_capability_moat";
  if (containsMarkers(text, ["创业者还是打工人", "全面地去了解和拥抱ai", "巨大的红利"])) return "ai_adoption_call";
  if (containsMarkers(text, ["没有方向", "进入ai这个行业", "不需要投钱", "不需要资源", "愿意动手"])) return "ai_low_barrier_entry";
  if (containsMarkers(text, ["窗口期", "从零开始的人", "原来的轨道上"])) return "ai_window_period";
  if (containsMarkers(text, ["创业财富指南", "国家已经把底牌亮出来了", "未来就是ai"])) return "ai_epoch_signal";
  if (containsMarkers(text, ["超级个体", "平台加超级个体", "自己就能烙饼"])) return "ai_super_individual";
  if (containsMarkers(text, ["情绪价值缺口", "做数字游民", "最贵的生意", "内容就是新的种子"])) return "ai_method_guidance";
  if (containsMarkers(text, ["岗位", "淘汰", "文案", "程序员", "设计师", "铁饭碗", "白领"])) return "ai_job_replacement";
  if (containsMarkers(text, ["被裁员的恐惧", "找工作更难了", "如果你还不会使用ai", "会被这个社会淘汰"])) return "ai_job_threat";
  if (containsMarkers(text, ["赛道", "情绪经济", "长寿经济", "黄金窗口期"])) return "ai_track_selection";
  if (containsMarkers(text, ["分水岭", "别踩", "风险", "清醒", "提醒"])) return "risk_alert";
  if (containsMarkers(text, ["起跑线上", "没有划走", "愿意主动改变命运"])) return "cta_no_scroll_winner";
  if (containsMarkers(text, ["直播时代", "视频带货", "最赚钱最暴利", "第四次工业革命", "浪尖上冲浪"])) return "ai_big_opportunity";
  if (containsMarkers(text, ["春晚", "机器人表演", "脊背发凉"])) return "spring_festival_robot_signal";
  if (containsMarkers(text, ["排雷", "救火", "闯险境", "办公室里面那些算账填表"])) return "robotics_application_case";
  if (containsMarkers(text, ["字节", "豆包", "文心一言", "数字人直播", "便利店都用上了ai收银"])) return "ai_platform_signal";
  if (containsMarkers(text, ["数字ai人", "一键学会德文", "克隆了我的形象", "纯被动收入"])) return "ai_digital_avatar_case";
  if (containsMarkers(text, ["复活亲人", "老照片复活", "音容笑貌"])) return "ai_memory_revival";
  if (containsMarkers(text, ["mid journey", "证件照", "结婚照", "古装照", "五张你的素颜照"])) return "ai_image_generation_case";
  if (containsMarkers(text, ["特斯拉的工厂", "华为工厂", "无人机器人送", "萝卜快跑"])) return "ai_factory_automation_case";
  if (containsMarkers(text, ["57岁", "负债400多万", "半年多时间", "五六百"])) return "ai_turnaround_case";
  if (containsMarkers(text, ["马斯克", "agi", "2030", "智慧总和", "超音速海啸"])) return "musk_agi_prophecy";
  if (containsMarkers(text, ["马斯克", "发钱", "智能密度", "能源和算力", "钱就不重要了", "成本几乎归零"])) return "musk_ai_economy";
  if (containsMarkers(text, ["马斯克", "三到七年", "过渡期", "断崖式", "还剩多少时间"])) return "musk_transition_anxiety";
  if (containsMarkers(text, ["马斯克", "手术", "外科医生", "共享记忆", "机器人医生"])) return "musk_surgery_case";
  if (containsMarkers(text, ["spacex", "火箭", "第一性原理", "电池成本", "特斯拉"])) return "musk_spacex_case";
  if (containsMarkers(text, ["资产配置", "黄金", "信托", "显性资产", "隐形资产", "防火墙", "财产险"])) return "wealth_asset_allocation";

  return item.topicFamily || "general";
}

function inferLocalBindingScope(item: ScriptSectionItem) {
  const text = normalizeMetaText(item.content, item.audience, item.secondaryDirection);
  if (containsMarkers(text, ["孩子", "家长", "父母", "家庭教育"])) return "family";
  if (containsMarkers(text, ["婚姻", "夫妻", "情感", "伴侣"])) return "relationship";
  if (containsMarkers(text, ["老板", "创业者", "企业", "公司"])) return "business";
  return item.bindingScope || "general";
}

export function enrichScriptSectionItem(item: ScriptSectionItem): ScriptSectionItem {
  return {
    ...item,
    entityTag: item.entityTag && item.entityTag !== "none" ? item.entityTag : inferLocalEntityTag(item),
    topicFamily: item.topicFamily && item.topicFamily !== "general" ? item.topicFamily : inferLocalTopicFamily(item),
    bindingScope: item.bindingScope && item.bindingScope !== "general" ? item.bindingScope : inferLocalBindingScope(item)
  };
}

function normalizeBaseUrl(baseUrl: string) {
  return (baseUrl || "/api").replace(/\/+$/, "");
}

export async function fetchScriptSections(
  baseUrl: string,
  options?: {
    primaryDirection?: string;
    secondaryDirection?: string;
    sectionType?: string;
    limit?: number;
  }
) {
  const params = new URLSearchParams();
  if (options?.primaryDirection) params.set("primaryDirection", options.primaryDirection);
  if (options?.secondaryDirection) params.set("secondaryDirection", options.secondaryDirection);
  if (options?.sectionType) params.set("sectionType", options.sectionType);
  if (options?.limit) params.set("limit", String(options.limit));

  const query = params.toString();
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/library/sections${query ? `?${query}` : ""}`);
  const payload = (await response.json().catch(() => null)) as ScriptSectionResponse | { detail?: string } | null;

  if (!response.ok || !payload || !("items" in payload)) {
    const detail = payload && "detail" in payload ? payload.detail : null;
    throw new Error(typeof detail === "string" && detail.trim() ? detail : "素材库读取失败");
  }

  return {
    ...payload,
    items: payload.items.map(enrichScriptSectionItem)
  };
}
