# 重构计划

## 目标目录结构

```
项目根目录/
├── apps/
│   ├── webapp/                    # 系统 A: Web 应用
│   │   ├── frontend/              # React 前端
│   │   │   ├── src/
│   │   │   ├── package.json
│   │   │   └── vite.config.ts
│   │   └── backend/               # FastAPI 后端
│   │       ├── main.py
│   │       ├── script_library.py
│   │       ├── free_search.py
│   │       └── requirements.txt
│   │
│   ├── devbot/                    # 系统 B: Telegram 开发机器人
│   │   ├── telegram_devbot.py
│   │   ├── devbot_ai.py
│   │   ├── devbot_executor.py
│   │   ├── devbot_config.py
│   │   ├── devbot_store.py
│   │   ├── devbot_telegram.py
│   │   ├── requirements.txt
│   │   └── README.md
│   │
│   └── video_workflow/            # 系统 C: 短视频工作流 (未来)
│       └── README.md
│
├── packages/                      # 共享代码
│   └── shared/
│       ├── types.py               # 共享类型定义
│       └── utils.py               # 共享工具函数
│
├── api/                           # Vercel API 路由 (保持现状)
│   └── (现有文件)
│
├── data/                          # 持久化数据
├── runtime/                       # 运行时数据
└── docs/                          # 文档
    ├── ARCHITECTURE.md
    ├── DEPLOYMENT.md
    └── DEVELOPMENT.md
```

## 迁移步骤

### 阶段 1: 准备工作 (1-2 小时)
1. 创建新目录结构
2. 提取共享代码到 packages/shared/
3. 创建架构文档

### 阶段 2: 迁移 Web 应用 (2-3 小时)
1. 移动前端代码到 apps/webapp/frontend/
2. 移动后端代码到 apps/webapp/backend/
3. 更新导入路径
4. 测试构建和运行

### 阶段 3: 迁移 Telegram Bot (1-2 小时)
1. 移动所有 devbot_*.py 到 apps/devbot/
2. 创建独立的 requirements.txt
3. 更新配置文件路径
4. 测试 bot 功能

### 阶段 4: 更新部署配置 (1 小时)
1. 更新 vercel.json
2. 更新 package.json scripts
3. 创建部署文档

### 阶段 5: 验证和清理 (1 小时)
1. 运行所有测试
2. 删除旧文件
3. 更新 README

## 风险评估
- 低风险：目录移动，不改变代码逻辑
- 中风险：导入路径需要仔细更新
- 缓解措施：逐步迁移，每步都测试

## 回滚计划
- 使用 git 分支进行重构
- 保留原始代码直到新结构验证通过
