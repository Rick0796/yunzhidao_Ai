import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");
const indexFile = path.join(distDir, "index.html");
const localConfigPath = path.join(__dirname, "server", "config.local.json");
const exampleConfigPath = path.join(__dirname, "server", "config.example.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readConfig() {
  const fallbackRaw = await fs.readFile(exampleConfigPath, "utf8");
  const fallback = JSON.parse(fallbackRaw.replace(/^\uFEFF/, ""));

  try {
    const raw = await fs.readFile(localConfigPath, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    return {
      port: parsed.port || fallback.port || 8787,
      baseUrl: (parsed.baseUrl || fallback.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai/").replace(/\/+$/, ""),
      apiKey: parsed.apiKey || "",
      defaultModel: parsed.defaultModel || fallback.defaultModel || "gemini-2.0-flash"
    };
  } catch {
    return {
      port: Number(process.env.PORT) || fallback.port || 8787,
      baseUrl: (process.env.GEMINI_BASE_URL || process.env.LLM_BASE_URL || fallback.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai/").replace(/\/+$/, ""),
      apiKey: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || "",
      defaultModel: process.env.GEMINI_MODEL || process.env.LLM_MODEL || fallback.defaultModel || "gemini-2.0-flash"
    };
  }
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithRetry(url, options, retries = 2) {
  let lastResponse = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, options);
    lastResponse = response;

    if (response.status !== 429 || attempt === retries) {
      return response;
    }

    await wait(800 * (attempt + 1));
  }

  return lastResponse;
}

async function serveFile(response, filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return false;
    }

    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
    });
    response.end(content);
    return true;
  } catch {
    return false;
  }
}

async function handleApi(request, response, url, config) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      configured: Boolean(config.apiKey),
      proxy: "/api/chat/completions",
      upstream: config.baseUrl,
      defaultModel: config.defaultModel
    });
    return true;
  }

  if (url.pathname === "/api/chat/completions" && request.method === "POST") {
    if (!config.apiKey || !config.baseUrl) {
      sendJson(response, 500, {
        error: {
          message: "本地后端未配置 API Key 或 Base URL，请检查 server/config.local.json"
        }
      });
      return true;
    }

    const bodyText = await readRequestBody(request);
    const body = safeParseJson(bodyText);

    if (!body || typeof body !== "object") {
      sendJson(response, 400, {
        error: {
          message: "请求体不是合法 JSON"
        }
      });
      return true;
    }

    const upstreamResponse = await fetchWithRetry(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        ...body,
        model: body.model || config.defaultModel
      })
    });

    const raw = await upstreamResponse.text();
    response.writeHead(upstreamResponse.status, {
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(raw);
    return true;
  }

  return false;
}

async function handleStatic(request, response, url) {
  const cleanPath = decodeURIComponent(url.pathname);
  const requestedPath = cleanPath === "/" ? indexFile : path.join(distDir, cleanPath);
  const normalizedPath = path.normalize(requestedPath);

  if (!normalizedPath.startsWith(path.normalize(distDir))) {
    sendJson(response, 403, { error: { message: "非法路径" } });
    return;
  }

  const exists = await serveFile(response, normalizedPath);
  if (exists) {
    return;
  }

  const fallbackOk = await serveFile(response, indexFile);
  if (!fallbackOk) {
    sendJson(response, 404, {
      error: {
        message: "未找到前端构建文件，请先运行 npm run build"
      }
    });
  }
}

async function bootstrap() {
  const config = await readConfig();
  const port = Number(process.env.PORT) || config.port || 8787;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

    try {
      const handledApi = await handleApi(request, response, url, config);
      if (handledApi) {
        return;
      }

      await handleStatic(request, response, url);
    } catch (error) {
      sendJson(response, 500, {
        error: {
          message: error instanceof Error ? error.message : "服务内部错误"
        }
      });
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`本地工作台已启动：http://127.0.0.1:${port}`);
    console.log(`后端代理状态：${config.apiKey ? "已配置密钥" : "未配置密钥"}`);
  });
}

bootstrap();
