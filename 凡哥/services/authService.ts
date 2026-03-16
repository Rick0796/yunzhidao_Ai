import { AuthSession, AuthUser } from "../types";

const SESSION_KEY = "yunzhidao_auth_session_v1";
const MOCK_USERS_KEY = "yunzhidao_mock_users_v1";
const DEFAULT_MODE = "api";

interface MockUserRecord extends AuthUser {
  password: string;
}

const getAuthMode = () => (process.env.AUTH_MODE || DEFAULT_MODE).toLowerCase();
const getAuthApiBase = () =>
  (process.env.AUTH_API_BASE || process.env.API_BASE || "http://127.0.0.1:8787")
    .trim()
    .replace(/\/+$/, "");

const saveSession = (session: AuthSession) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const createToken = (user: AuthUser) => {
  const raw = `${user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return btoa(unescape(encodeURIComponent(raw)));
};

const getMockUsers = (): MockUserRecord[] => {
  try {
    const value = localStorage.getItem(MOCK_USERS_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const setMockUsers = (users: MockUserRecord[]) => {
  localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
};

const createSession = (user: AuthUser): AuthSession => ({
  token: createToken(user),
  user,
});

const ensureMockSeedUser = () => {
  const users = getMockUsers();
  if (users.length > 0) return;
  const seed: MockUserRecord = {
    id: "u_demo_001",
    name: "演示账号",
    email: "demo@example.com",
    password: "123456",
  };
  setMockUsers([seed]);
};

const callAuthApi = async (path: string, body: Record<string, string>) => {
  const base = getAuthApiBase();
  if (!base) throw new Error("未配置 AUTH_API_BASE，无法使用 API 登录模式");
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || "认证服务请求失败");
  }
  if (!data?.token || !data?.user) {
    throw new Error("认证服务返回格式错误");
  }
  return data as AuthSession;
};

const mockRegister = async (name: string, email: string, password: string) => {
  const users = getMockUsers();
  const exists = users.some((user) => user.email.toLowerCase() === email.toLowerCase());
  if (exists) throw new Error("该邮箱已注册");

  const created: MockUserRecord = {
    id: `u_${Date.now()}`,
    name,
    email,
    password,
  };
  users.push(created);
  setMockUsers(users);

  const session = createSession({ id: created.id, name: created.name, email: created.email });
  saveSession(session);
  return session;
};

const mockLogin = async (email: string, password: string) => {
  ensureMockSeedUser();
  const users = getMockUsers();
  const found = users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  if (!found || found.password !== password) {
    throw new Error("邮箱或密码错误");
  }
  const session = createSession({ id: found.id, name: found.name, email: found.email });
  saveSession(session);
  return session;
};

export const getStoredSession = (): AuthSession | null => {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as AuthSession;
    if (!session?.token || !session?.user?.id) return null;
    return session;
  } catch {
    return null;
  }
};

export const registerAccount = async (params: {
  name: string;
  email: string;
  password: string;
}) => {
  const mode = getAuthMode();
  if (mode === "api") {
    const session = await callAuthApi("/auth/register", params);
    saveSession(session);
    return session;
  }
  return mockRegister(params.name, params.email, params.password);
};

export const loginAccount = async (params: { email: string; password: string }) => {
  const mode = getAuthMode();
  if (mode === "api") {
    const session = await callAuthApi("/auth/login", params);
    saveSession(session);
    return session;
  }
  return mockLogin(params.email, params.password);
};

export const logoutAccount = () => {
  const mode = getAuthMode();
  if (mode === "api") {
    const session = getStoredSession();
    const base = getAuthApiBase();
    if (session?.token && base) {
      fetch(`${base}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      }).catch(() => {
        // Ignore network errors on logout; local cleanup still proceeds.
      });
    }
  }
  localStorage.removeItem(SESSION_KEY);
};

export const getAuthRuntimeInfo = () => {
  const mode = getAuthMode();
  const apiBase = getAuthApiBase();
  return { mode, apiBase };
};
