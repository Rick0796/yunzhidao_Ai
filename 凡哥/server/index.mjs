import "dotenv/config";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import helmet from "helmet";
import multer from "multer";
import bcrypt from "bcryptjs";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();

const PORT = Number(process.env.PORT || 8787);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5173";
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 2048);
const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), "server", "data", "db.json");
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const INLINE_THRESHOLD = 5 * 1024 * 1024;

let runtimeApiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();

app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: false,
  })
);
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  dest: path.join(process.cwd(), "server", "uploads"),
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
  },
});

const ensureDb = () => {
  if (!fs.existsSync(path.dirname(DB_FILE))) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = {
      users: [],
      sessions: [],
      settings: {},
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf8");
  }
};

const readDb = () => {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw || "{}");
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {},
  };
};

const writeDb = (db) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const makeToken = () => crypto.randomBytes(32).toString("hex");

const createSession = (db, userId) => {
  const rawToken = makeToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const record = {
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    tokenHash,
    createdAt: Date.now(),
    expiresAt,
  };

  db.sessions = db.sessions.filter((session) => session.expiresAt > Date.now());
  db.sessions.push(record);
  writeDb(db);
  return rawToken;
};

const serializeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
});

const authRequired = (req, res, next) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "请先登录" });
  }

  const token = auth.slice(7).trim();
  if (!token) return res.status(401).json({ message: "请先登录" });

  const db = readDb();
  const tokenHash = hashToken(token);
  const session = db.sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > Date.now());
  if (!session) {
    return res.status(401).json({ message: "登录已过期，请重新登录" });
  }

  const user = db.users.find((item) => item.id === session.userId);
  if (!user) {
    return res.status(401).json({ message: "账号不存在" });
  }

  req.user = serializeUser(user);
  next();
};

const safeJsonParse = (text) => {
  if (!text) return null;
  let cleaned = String(text).trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
};

const defaultVideoStructure = {
  coreProposition: "内容核心价值不明确，建议补充具体主张。",
  openingType: "开场类型不明确，建议补充钩子设计。",
  conflictStructure: "冲突结构不明确，建议补充对比点。",
  progressionLogic: "推进逻辑不明确，建议补充分层表达。",
  psychologicalHook: "心理钩子不明确，建议补充情绪抓手。",
  climaxSentence: "高潮句不明确，建议补充记忆点。",
  languageFeatures: "语言风格不明确，建议补充口语风格说明。",
  emotionalCurve: "情绪曲线不明确，建议补充情绪递进设计。",
  viewerReward: "观看回报不明确，建议补充用户收益。",
};

const normalizeVideoStructure = (value) => {
  if (!value || typeof value !== "object") return defaultVideoStructure;
  return {
    coreProposition: value.coreProposition || defaultVideoStructure.coreProposition,
    openingType: value.openingType || defaultVideoStructure.openingType,
    conflictStructure: value.conflictStructure || defaultVideoStructure.conflictStructure,
    progressionLogic: value.progressionLogic || defaultVideoStructure.progressionLogic,
    psychologicalHook: value.psychologicalHook || defaultVideoStructure.psychologicalHook,
    climaxSentence: value.climaxSentence || defaultVideoStructure.climaxSentence,
    languageFeatures: value.languageFeatures || defaultVideoStructure.languageFeatures,
    emotionalCurve: value.emotionalCurve || defaultVideoStructure.emotionalCurve,
    viewerReward: value.viewerReward || defaultVideoStructure.viewerReward,
  };
};

const normalizeAnalysisResult = (raw, fileUri, isDeep = false) => {
  const timestamps = Array.isArray(raw?.timestamps)
    ? raw.timestamps.map((item) => {
        const seconds = Number.isFinite(item?.seconds) ? Number(item.seconds) : 0;
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return {
          time: item?.time || `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`,
          seconds,
          description: item?.description || "关键片段",
        };
      })
    : [];

  return {
    summary: raw?.summary || "未提取到摘要，请重试。",
    visualFeatures: Array.isArray(raw?.visualFeatures)
      ? raw.visualFeatures.map((item) => ({
          feature: item?.feature || "视觉特征",
          description: item?.description || "暂无描述",
        }))
      : [],
    videoStructure: normalizeVideoStructure(raw?.videoStructure),
    timestamps: isDeep ? timestamps : [],
    viralContent: {
      copies: [],
      script: raw?.script || raw?.viralContent?.script || "未提取到完整脚本。",
    },
    fileUri,
  };
};

const buildAnalysisPrompt = (mode) => {
  const isDeep = mode === "DEEP";
  const deepPart = isDeep
    ? `\n额外要求（深度模式）：\n1. 必须返回 5-8 个 timestamps（time, seconds, description）。\n2. 对视频结构给出完整营销拆解。`
    : "";

  return `
你是一名短视频内容分析专家，请只输出 JSON，不要输出任何解释文字。

字段要求：
1. summary: 视频摘要（中文）。
2. script: 尽可能完整提取视频口播或旁白内容（中文）。
3. visualFeatures: 数组，每项包含 feature 和 description。
4. videoStructure: 对象，包含 coreProposition/openingType/conflictStructure/progressionLogic/psychologicalHook/climaxSentence/languageFeatures/emotionalCurve/viewerReward。
5. ${isDeep ? "timestamps: 关键时间点数组。" : "timestamps 可省略。"}

输出质量要求：
1. 仅使用简体中文。
2. 不要使用“未提取”“未知”等占位语，信息不足时给出合理推断。
3. 结果必须是合法 JSON。
${deepPart}
`;
};

const ensureApiKey = () => {
  const db = readDb();
  const key = (db.settings?.geminiApiKey || runtimeApiKey || "").trim();
  if (!key) {
    throw new Error("后端未配置 Gemini API Key，请设置 GEMINI_API_KEY 环境变量或通过管理员接口更新。", { cause: "NO_API_KEY" });
  }
  return key;
};

const uploadFileToGemini = async (filePath, mimeType, displayName, ai) => {
  const fileData = await ai.files.upload({
    file: filePath,
    config: { displayName, mimeType: mimeType || "video/mp4" },
  });

  if (!fileData?.name || !fileData?.uri) {
    throw new Error("文件上传成功但未返回可用的文件标识");
  }

  let state = fileData.state;
  let attempts = 0;

  while (state === "PROCESSING") {
    attempts += 1;
    if (attempts > 240) {
      throw new Error("视频在 Gemini 文件服务中处理超时");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const status = await ai.files.get({ name: fileData.name });
    state = status?.state;
    if (state === "FAILED") {
      throw new Error("Gemini 文件处理失败");
    }
  }

  if (state !== "ACTIVE") {
    throw new Error(`Gemini 文件状态异常：${state || "UNKNOWN"}`);
  }

  return fileData.uri;
};

const resolveVideoPart = async ({
  ai,
  filePath,
  mimeType,
  displayName,
  existingFileUri,
}) => {
  if (existingFileUri) {
    return {
      fileUri: existingFileUri,
      part: { fileData: { mimeType: mimeType || "video/mp4", fileUri: existingFileUri } },
    };
  }

  if (!filePath) {
    throw new Error("未提供视频文件");
  }

  const stat = fs.statSync(filePath);
  if (stat.size > INLINE_THRESHOLD) {
    const fileUri = await uploadFileToGemini(filePath, mimeType, displayName, ai);
    return {
      fileUri,
      part: { fileData: { mimeType: mimeType || "video/mp4", fileUri } },
    };
  }

  const base64 = fs.readFileSync(filePath).toString("base64");
  return {
    fileUri: undefined,
    part: {
      inlineData: {
        data: base64,
        mimeType: mimeType || "video/mp4",
      },
    },
  };
};

const analyzeVideoByGemini = async ({ filePath, mimeType, displayName, mode, cachedUri }) => {
  const apiKey = ensureApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const isDeep = mode === "DEEP";

  const resolved = await resolveVideoPart({
    ai,
    filePath,
    mimeType,
    displayName,
    existingFileUri: cachedUri,
  });

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      role: "user",
      parts: [resolved.part, { text: buildAnalysisPrompt(mode) }],
    },
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: isDeep ? 8192 : 4096,
      thinkingConfig: { thinkingBudget: isDeep ? 2048 : 0 },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          script: { type: Type.STRING },
          visualFeatures: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                feature: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["feature", "description"],
            },
          },
          videoStructure: {
            type: Type.OBJECT,
            properties: {
              coreProposition: { type: Type.STRING },
              openingType: { type: Type.STRING },
              conflictStructure: { type: Type.STRING },
              progressionLogic: { type: Type.STRING },
              psychologicalHook: { type: Type.STRING },
              climaxSentence: { type: Type.STRING },
              languageFeatures: { type: Type.STRING },
              emotionalCurve: { type: Type.STRING },
              viewerReward: { type: Type.STRING },
            },
            required: [
              "coreProposition",
              "openingType",
              "conflictStructure",
              "progressionLogic",
              "psychologicalHook",
              "climaxSentence",
              "languageFeatures",
              "emotionalCurve",
              "viewerReward",
            ],
          },
          timestamps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                seconds: { type: Type.NUMBER },
                description: { type: Type.STRING },
              },
              required: ["time", "seconds", "description"],
            },
          },
        },
        required: ["summary", "script", "visualFeatures", "videoStructure"],
      },
    },
  });

  const parsed = safeJsonParse(response.text || "");
  if (!parsed) throw new Error("AI 返回内容无法解析为 JSON");
  return normalizeAnalysisResult(parsed, resolved.fileUri, isDeep);
};

const generateSoraPromptsByGemini = async ({ filePath, mimeType, displayName, existingFileUri, count, analysisSummary }) => {
  const apiKey = ensureApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const resolved = await resolveVideoPart({
    ai,
    filePath,
    mimeType,
    displayName,
    existingFileUri,
  });

  const prompt = `
你是一名 AIGC 导演，请基于视频内容输出 ${count} 条可直接用于生成数字人短视频的提示词。
输出 JSON 数组，每项格式为：
{"title":"提示词标题","fullPrompt":"完整提示词"}
要求：
1. 仅使用简体中文。
2. 明确镜头、人物动作、场景、光线、节奏、画面比例。
3. 不要输出 markdown。
${analysisSummary ? `参考视频摘要：${analysisSummary}` : ""}
`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: { parts: [resolved.part, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            fullPrompt: { type: Type.STRING },
          },
          required: ["title", "fullPrompt"],
        },
      },
    },
  });

  const parsed = safeJsonParse(response.text || "");
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  if (!list.length) throw new Error("未生成有效的 Sora 提示词");
  return list.map((item, idx) => ({
    title: item?.title || `提示词 ${idx + 1}`,
    fullPrompt: item?.fullPrompt || item?.prompt || "",
  }));
};

const generateViralCopiesByGemini = async ({ originalScript, count }) => {
  const apiKey = ensureApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
你是一名短视频增长文案专家。
请基于以下原始脚本，输出 ${count} 条不同风格的爆款文案。
原始脚本：
${originalScript}

返回 JSON 数组，格式：
[{"text":"文案1"}, {"text":"文案2"}]
要求：
1. 仅简体中文。
2. 适合抖音/视频号。
3. 不要表情符号，不要 markdown。
`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { text: { type: Type.STRING } },
          required: ["text"],
        },
      },
    },
  });

  const parsed = safeJsonParse(response.text || "");
  if (!Array.isArray(parsed)) throw new Error("爆款文案返回格式异常");
  return parsed.map((item) => item?.text || "").filter(Boolean);
};

const analyzeCopyByGemini = async ({ originalCopy, industry, needs, userBackground }) => {
  const apiKey = ensureApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
你是短视频获客文案专家，请对文案进行底层拆解并生成 3 条新脚本。
用户背景：${userBackground || "未提供"}
行业：${industry || "通用"}
需求：${needs || "提升转化"}

请输出 JSON 对象，格式如下：
{
  "analysis": {
    "hook": "...",
    "contrast": "...",
    "value": "...",
    "trust": "...",
    "cta": "...",
    "targetAudience": "...",
    "sellingPoints": "..."
  },
  "generatedScripts": [
    { "title": "文案 1", "content": "..." },
    { "title": "文案 2", "content": "..." },
    { "title": "文案 3", "content": "..." }
  ]
}

待分析文案：
${originalCopy}
`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          analysis: {
            type: Type.OBJECT,
            properties: {
              hook: { type: Type.STRING },
              contrast: { type: Type.STRING },
              value: { type: Type.STRING },
              trust: { type: Type.STRING },
              cta: { type: Type.STRING },
              targetAudience: { type: Type.STRING },
              sellingPoints: { type: Type.STRING },
            },
            required: ["hook", "contrast", "value", "trust", "cta", "targetAudience", "sellingPoints"],
          },
          generatedScripts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
              },
              required: ["title", "content"],
            },
          },
        },
        required: ["analysis", "generatedScripts"],
      },
    },
  });

  const parsed = safeJsonParse(response.text || "");
  if (!parsed) throw new Error("文案分析结果解析失败");
  return parsed;
};

const refineCopyByGemini = async ({ currentResult, userInstruction, userBackground }) => {
  const apiKey = ensureApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
你是短视频文案优化专家。
请在以下已有分析结果基础上，根据用户的新要求生成 3 条优化脚本。
用户背景：${userBackground || "未提供"}
用户要求：${userInstruction}
当前结果：
${JSON.stringify(currentResult)}

只返回 JSON：
{
  "generatedScripts": [
    { "title": "优化文案 1", "content": "..." },
    { "title": "优化文案 2", "content": "..." },
    { "title": "优化文案 3", "content": "..." }
  ]
}
`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          generatedScripts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
              },
              required: ["title", "content"],
            },
          },
        },
        required: ["generatedScripts"],
      },
    },
  });

  const parsed = safeJsonParse(response.text || "");
  if (!parsed) throw new Error("优化结果解析失败");
  return parsed;
};

const chatWithContextByGemini = async ({ context, history, message, isReplacementMode }) => {
  const apiKey = ensureApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const roleHint = isReplacementMode ? "可按用户要求输出可替换的新内容" : "回答问题即可";

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [
        {
          text: [
            "你是短视频运营助理，只用简体中文回答。",
            roleHint,
            "上下文：",
            context,
            ...(history || []).map((item) => `${item.role === "user" ? "用户" : "助手"}: ${item.text}`),
            `用户: ${message}`,
          ].join("\n"),
        },
      ],
    },
    config: {
      maxOutputTokens: 2048,
    },
  });

  return response.text || "暂时没有可用回复，请稍后再试。";
};

const chatWithVideoByGemini = async ({ history, message, filePath, mimeType, displayName, analysisSummary, existingFileUri }) => {
  const apiKey = ensureApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const resolved = await resolveVideoPart({
    ai,
    filePath,
    mimeType,
    displayName,
    existingFileUri,
  });

  const context = analysisSummary
    ? `你已经完成了这个视频的分析摘要：${analysisSummary}`
    : "请根据视频内容回答用户问题。";

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [
        resolved.part,
        {
          text: [
            "你是短视频内容分析助手，请用简体中文回答。",
            context,
            ...(history || []).map((item) => `${item.role === "user" ? "用户" : "助手"}: ${item.text}`),
            `用户: ${message}`,
          ].join("\n"),
        },
      ],
    },
    config: {
      maxOutputTokens: 2048,
    },
  });

  return {
    reply: response.text || "暂时没有可用回复，请稍后重试。",
    fileUri: resolved.fileUri,
  };
};

const removeUploadedFile = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore
  }
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, hasGeminiKey: Boolean((runtimeApiKey || "").trim()) });
});

app.post("/auth/register", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ message: "姓名、邮箱、密码不能为空" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "密码至少 6 位" });
    }

    const db = readDb();
    const exists = db.users.some((u) => u.email === email);
    if (exists) {
      return res.status(409).json({ message: "该邮箱已注册" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      email,
      passwordHash,
      createdAt: Date.now(),
    };
    db.users.push(user);

    const token = createSession(db, user.id);
    return res.json({ token, user: serializeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "注册失败" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.status(400).json({ message: "邮箱和密码不能为空" });
    }

    const db = readDb();
    const user = db.users.find((u) => u.email === email);
    if (!user) return res.status(401).json({ message: "邮箱或密码错误" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "邮箱或密码错误" });

    const token = createSession(db, user.id);
    return res.json({ token, user: serializeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "登录失败" });
  }
});

app.post("/auth/logout", authRequired, (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.slice(7).trim();
    const tokenHash = hashToken(token);

    const db = readDb();
    db.sessions = db.sessions.filter((item) => item.tokenHash !== tokenHash);
    writeDb(db);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "退出失败" });
  }
});

app.post("/admin/gemini-key", (req, res) => {
  const adminSecret = String(process.env.ADMIN_SECRET || "").trim();
  const incoming = String(req.headers["x-admin-secret"] || "").trim();

  if (!adminSecret || incoming !== adminSecret) {
    return res.status(403).json({ message: "管理员认证失败" });
  }

  const apiKey = String(req.body?.apiKey || "").trim();
  if (!apiKey) {
    return res.status(400).json({ message: "apiKey 不能为空" });
  }

  const db = readDb();
  db.settings.geminiApiKey = apiKey;
  writeDb(db);
  runtimeApiKey = apiKey;
  return res.json({ ok: true });
});

app.post("/api/analyze-video", authRequired, upload.single("file"), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const mode = req.body?.mode === "DEEP" ? "DEEP" : "FAST";
    const cachedUri = String(req.body?.cachedUri || "").trim() || undefined;

    const data = await analyzeVideoByGemini({
      filePath,
      mimeType: req.file?.mimetype || "video/mp4",
      displayName: req.file?.originalname || "video.mp4",
      mode,
      cachedUri,
    });

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error?.message || "视频分析失败" });
  } finally {
    await removeUploadedFile(filePath);
  }
});

app.post("/api/generate-sora-prompts", authRequired, upload.single("file"), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const existingFileUri = String(req.body?.existingFileUri || "").trim() || undefined;
    const count = Math.min(10, Math.max(1, Number(req.body?.count || 1)));
    const analysisSummary = String(req.body?.analysisSummary || "").trim() || undefined;

    const prompts = await generateSoraPromptsByGemini({
      filePath,
      mimeType: req.file?.mimetype || "video/mp4",
      displayName: req.file?.originalname || "video.mp4",
      existingFileUri,
      count,
      analysisSummary,
    });

    return res.json({ prompts });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "提示词生成失败" });
  } finally {
    await removeUploadedFile(filePath);
  }
});

app.post("/api/generate-viral-copies", authRequired, async (req, res) => {
  try {
    const originalScript = String(req.body?.originalScript || "").trim();
    const count = Math.min(10, Math.max(1, Number(req.body?.count || 3)));
    if (!originalScript) return res.status(400).json({ message: "originalScript 不能为空" });

    const copies = await generateViralCopiesByGemini({ originalScript, count });
    return res.json({ copies });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "文案生成失败" });
  }
});

app.post("/api/analyze-copy", authRequired, async (req, res) => {
  try {
    const originalCopy = String(req.body?.originalCopy || "").trim();
    const industry = String(req.body?.industry || "").trim();
    const needs = String(req.body?.needs || "").trim();
    const userBackground = String(req.body?.userBackground || "").trim();
    if (!originalCopy) return res.status(400).json({ message: "originalCopy 不能为空" });

    const data = await analyzeCopyByGemini({ originalCopy, industry, needs, userBackground });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error?.message || "文案分析失败" });
  }
});

app.post("/api/refine-copy", authRequired, async (req, res) => {
  try {
    const currentResult = req.body?.currentResult;
    const userInstruction = String(req.body?.userInstruction || "").trim();
    const userBackground = String(req.body?.userBackground || "").trim();

    if (!currentResult || !userInstruction) {
      return res.status(400).json({ message: "currentResult 和 userInstruction 不能为空" });
    }

    const data = await refineCopyByGemini({ currentResult, userInstruction, userBackground });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error?.message || "文案优化失败" });
  }
});

app.post("/api/chat-context", authRequired, async (req, res) => {
  try {
    const context = String(req.body?.context || "");
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const message = String(req.body?.message || "");
    const isReplacementMode = Boolean(req.body?.isReplacementMode);

    if (!context || !message) return res.status(400).json({ message: "context 和 message 不能为空" });

    const reply = await chatWithContextByGemini({ context, history, message, isReplacementMode });
    return res.json({ reply });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "对话失败" });
  }
});

app.post("/api/chat-video", authRequired, upload.single("file"), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const historyRaw = String(req.body?.history || "[]");
    const history = safeJsonParse(historyRaw);
    const message = String(req.body?.message || "").trim();
    const analysisSummary = String(req.body?.analysisSummary || "").trim() || undefined;
    const existingFileUri = String(req.body?.existingFileUri || "").trim() || undefined;

    if (!message) return res.status(400).json({ message: "message 不能为空" });

    const payload = await chatWithVideoByGemini({
      history: Array.isArray(history) ? history : [],
      message,
      filePath,
      mimeType: req.file?.mimetype || "video/mp4",
      displayName: req.file?.originalname || "video.mp4",
      analysisSummary,
      existingFileUri,
    });

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ message: error?.message || "视频对话失败" });
  } finally {
    await removeUploadedFile(filePath);
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: `文件过大，最大支持 ${MAX_UPLOAD_MB}MB` });
  }
  return res.status(500).json({ message: err?.message || "服务器异常" });
});

app.listen(PORT, () => {
  ensureDb();
  // eslint-disable-next-line no-console
  console.log(`[server] running on http://127.0.0.1:${PORT}`);
});

