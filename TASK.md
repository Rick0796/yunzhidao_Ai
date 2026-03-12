# 当前任务

## 本轮目标
生成第一版内部短视频内容增长工作流系统骨架。

## 当前阶段说明
现在先不要追求复杂功能，也不要追求全自动。
先把真实流程里的“结构、状态、后台、网页适配层、下载能力”搭起来。

## 本轮需要完成
1. 项目目录结构
2. 数据库表设计
3. workflow / agent 模块骨架
4. 简单内部后台骨架
5. 配置文件示例
6. README

## 当前要做的模块
1. trend_discovery_agent
   - 从禅妈妈、飞瓜等数据网站收集候选视频
   - 支持热点事件视频池和同行业爆款视频池
   - 记录平台、链接、账号、发布时间、点赞、评论、分享等基础数据

2. content_extraction_agent
   - 提取原视频文案
   - 存储标题、链接、平台、作者、发布时间、互动数据、原始文案
   - 可补充钩子、结构标签、受众标签、适配标签

3. rewrite_routing_agent
   - 判断内容进入“热点改写模式”还是“行业改写模式”
   - 为后续文案生成准备背景信息

4. rewrite_agent
   - 接入凡哥科技网站：`https://fange-technology.vercel.app/`
   - 使用“短视频文案分析”能力
   - 输入原视频文案
   - 输入个人/业务背景介绍
   - 输入具体需求（可选）
   - 每次生成 3 条文案
   - 支持重新生成和生成更多
   - 存储多个改写版本

5. avatar_video_agent
   - 把选中的文案送入数字人网站
   - 跟踪视频任务状态
   - 生成后下载到本地
   - 保存视频地址、本地路径和任务结果

6. quality_check_agent
   - 存储基础检查结果
   - 检查文案与视频结果是否完整
   - 判断是否进入人工审核

7. reporting_agent
   - 汇总每日工作流数据
   - 支持后台统计展示和复盘

## 当前状态机
请实现以下状态：
- discovered
- metrics_checked
- extracted
- rewrite_routed
- rewritten
- rewrite_selected
- video_pending
- video_done
- downloaded
- review_pending
- approved
- published
- failed
- archived

## 当前数据表
请创建以下数据表：
- sources
- content_candidates
- extracted_contents
- rewrites
- video_jobs
- review_tasks
- published_results
- workflow_runs
- system_logs

## 建议补充字段
第一版建议重点覆盖这些真实业务字段：
- `source_site`
- `source_platform`
- `source_url`
- `author_name`
- `publish_time`
- `likes_count`
- `comments_count`
- `shares_count`
- `favorites_count`
- `original_script`
- `background_profile`
- `rewrite_mode`
- `rewrite_batch_no`
- `variant_no`
- `selected_rewrite_id`
- `video_remote_url`
- `video_local_path`
- `review_result`
- `publish_notes`

## 当前后台需求
后台至少包含：
- 今日发现数量
- 今日数据筛选通过数量
- 今日提取数量
- 今日改写数量
- 今日视频生成数量
- 今日下载数量
- 待审核列表
- 失败任务列表
- 已发布记录
- 单条任务详情页

## 当前技术偏好
优先：
- Python
- FastAPI
- SQLAlchemy
- SQLite
- 简单后台
- 后续可扩展 PostgreSQL

## 当前重要要求
- 不要只停留在 mock
- 能接真实网页流程的地方优先接真实流程
- 需要预留 mock 适配器作为兜底
- 请先支持以下适配器：
  - 内容来源适配器（禅妈妈 / 飞瓜）
  - 文案网站适配器（凡哥科技）
  - 数字人网站适配器
- 所有结构都要方便后续替换成更稳定的真实接口
- 允许生成后下载视频到本地工作目录

## 当前完成标准
完成的定义是：
- 项目可以本地运行
- 数据库结构已经实现
- workflow 骨架完整
- 至少能用 mock 或半自动方式跑通完整流程
- 后台能展示基础数据
- README 写清楚如何启动、如何接真实网页、如何扩展
