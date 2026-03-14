/**
 * 统一关键词规则库
 * 所有模块的业务/平台/AI/监管关键词判断都从这里引用，避免各处维护不同版本
 */

export const BUSINESS_KEYWORDS = /(AI获客|数字IP|数字资产|私域|自动化|内容增长|流量增长|企业增长|老板增长|数字人|客户承接|获客链路)/i;
export const AI_KEYWORDS = /(AI|人工智能|AIGC|智能体|算法)/i;
export const REGULATION_KEYWORDS = /(风险|监管|合规|提醒|回应|代表|委员|专家|两会|政策|权益|替代|工作|岗位|司机|平台治理)/i;
export const PLATFORM_KEYWORDS = /(平台|腾讯|微信|抖音|小红书|快手|视频号|支付宝|规则|入口|改版|封禁|封号|流量口子|推荐机制)/i;
export const MACRO_KEYWORDS = /(油价|利率|汇率|战争|冲突|关税|供应链|黄金|楼市|房价|A股|股市|美股|原油|能源|出口|外贸)/i;
export const SOCIAL_HEAT_KEYWORDS = /(爆火|爆红|刷屏|热搜|走红|争议|围观|全网都在看|带火)/i;
export const AGGREGATE_KEYWORDS = /(今日热点|热点新闻|新闻摘要|早知道|盘点|合集|速览|汇总|看完)/i;
export const WEALTH_KEYWORDS = /(农业时代|工业时代|互联网时代|数字时代|财富洗牌|第四次变革|数字资产|资源更替|变现逻辑)/i;

/**
 * 判断文本是否包含直接业务锚点（AI/获客/数字资产等）
 * 用于 hotspot/viral 路径决定是否允许挂业务词
 */
export function hasDirectBusinessAnchor(text: string): boolean {
  return BUSINESS_KEYWORDS.test(text)
    || /(AI|人工智能).{0,12}(获客|流量|转化|客户|商业化|内容增长|数字人|企业增长|老板增长)/.test(text);
}

/**
 * 判断仿写爆款原文是否带业务锚点
 * 原文有业务词时才允许在改写版本中保留业务词
 */
export function viralHasBusinessAnchor(sourceText: string, userNote = ""): boolean {
  const text = [sourceText, userNote].join(" ");
  return /(AI获客|数字IP|数字资产|获客|流量|私域|自动化|内容增长|企业增长|老板增长|数字人|客户|订单|转化|系统|方法|训练营|公开课)/.test(text);
}
