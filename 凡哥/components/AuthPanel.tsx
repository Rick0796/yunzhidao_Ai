import React, { useMemo, useState } from "react";
import { AuthSession } from "../types";
import { getAuthRuntimeInfo, loginAccount, registerAccount } from "../services/authService";

interface AuthPanelProps {
  onAuthenticated: (session: AuthSession) => void;
}

type Mode = "login" | "register";

const AuthPanel: React.FC<AuthPanelProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runtime = useMemo(() => getAuthRuntimeInfo(), []);

  const submit = async () => {
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("请输入邮箱和密码");
      return;
    }
    if (mode === "register") {
      if (!name.trim()) {
        setError("请输入姓名");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次密码不一致");
        return;
      }
      if (password.length < 6) {
        setError("密码至少 6 位");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const session =
        mode === "register"
          ? await registerAccount({ name: name.trim(), email: email.trim(), password })
          : await loginAccount({ email: email.trim(), password });
      onAuthenticated(session);
    } catch (e: any) {
      setError(e?.message || "登录失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative z-10">
      <div className="w-full max-w-md glass-panel rounded-2xl p-8 border border-white/10 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-2">云智道 AI</h1>
        <p className="text-slate-400 text-sm mb-6">
          登录后即可使用视频拆解、爆款文案生成和数字人提示词能力
        </p>

        <div className="flex gap-2 mb-6">
          <button
            className={`flex-1 py-2 rounded-lg text-sm ${
              mode === "login" ? "bg-cyan-400 text-black font-semibold" : "bg-white/5 text-slate-300"
            }`}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            className={`flex-1 py-2 rounded-lg text-sm ${
              mode === "register" ? "bg-cyan-400 text-black font-semibold" : "bg-white/5 text-slate-300"
            }`}
            onClick={() => setMode("register")}
          >
            注册
          </button>
        </div>

        <div className="space-y-3">
          {mode === "register" && (
            <input
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white"
              placeholder="姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white"
            placeholder="邮箱"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white"
            placeholder="密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "register" && (
            <input
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white"
              placeholder="确认密码"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          )}
        </div>

        {error && <p className="text-red-300 text-sm mt-3">{error}</p>}

        <button
          onClick={submit}
          disabled={isSubmitting}
          className="w-full mt-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 text-black font-bold disabled:opacity-60"
        >
          {isSubmitting ? "提交中..." : mode === "login" ? "立即登录" : "创建账号"}
        </button>

        <div className="mt-6 text-xs text-slate-500 leading-relaxed">
          当前认证模式：
          <span className="text-slate-300 ml-1">{runtime.mode}</span>
          {runtime.mode === "api" && runtime.apiBase ? (
            <span className="block mt-1 break-all">API: {runtime.apiBase}</span>
          ) : (
            <span className="block mt-1">
              Mock 模式默认演示账号：<span className="text-slate-300">demo@example.com / 123456</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPanel;
