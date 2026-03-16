import fs from "fs";
import path from "path";

const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), "server", "data", "db.json");

const ensureDb = () => {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify({ users: [], sessions: [], settings: {} }, null, 2),
      "utf8"
    );
  }
};

const main = () => {
  const newKey = String(process.argv[2] || "").trim();
  if (!newKey) {
    console.error("用法: npm run set:key -- <YOUR_GEMINI_API_KEY>");
    process.exit(1);
  }

  ensureDb();
  const raw = fs.readFileSync(DB_FILE, "utf8");
  const db = JSON.parse(raw || "{}");
  db.users = Array.isArray(db.users) ? db.users : [];
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.settings = db.settings && typeof db.settings === "object" ? db.settings : {};
  db.settings.geminiApiKey = newKey;

  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
  console.log("Gemini API Key 已写入后端配置。");
};

main();
