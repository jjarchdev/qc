import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "./api.js";
import { useAppData } from "./AppData.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import { localePath } from "./utils.js";
import { styles } from "./styles.js";

export default function AdminLogin() {
  const { t } = useTranslation();
  const { lng } = useParams();
  const navigate = useNavigate();
  const {
    serverConfig,
    setAdminSession,
    loadScenariosFromServer,
    loadCategoriesFromServer,
  } = useAppData();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const adminDisabled = serverConfig.loaded && !serverConfig.authConfigured;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || adminDisabled) return;
    if (!serverConfig.loaded) {
      setError(t("login.wait"));
      return;
    }
    if (!serverConfig.authConfigured) {
      setError(t("login.disabled"));
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || t("login.failed"));
        return;
      }
      if (!data?.ok) {
        setError(t("login.badResponse"));
        return;
      }
      setAdminSession(true);
      setUsername("");
      setPassword("");
      await Promise.all([loadScenariosFromServer(), loadCategoriesFromServer()]);
      navigate(localePath(lng, "admin"), { replace: true });
    } catch {
      setError(t("login.unreachable"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.loginWrap}>
      <main style={styles.loginBox}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <LanguageSwitcher />
        </div>
        <div style={styles.loginIcon}>⚙</div>
        <h2 style={styles.loginTitle}>{t("login.title")}</h2>
        <p style={styles.loginSub}>
          {adminDisabled
            ? t("login.disabled")
            : serverConfig.requireUsername
              ? t("login.userAndPass")
              : t("login.passwordOnly")}
        </p>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}
        >
          {serverConfig.requireUsername ? (
            <input
              type="text"
              style={styles.loginInput}
              placeholder={t("login.username")}
              value={username}
              disabled={adminDisabled || busy}
              autoComplete="username"
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "admin-login-error" : undefined}
              onChange={(e) => setUsername(e.target.value)}
            />
          ) : null}
          <div style={{ position: "relative", width: "100%" }}>
            <input
              type={showPassword ? "text" : "password"}
              style={{ ...styles.loginInput, width: "100%", boxSizing: "border-box", paddingRight: "4.5rem" }}
              placeholder={t("login.password")}
              value={password}
              disabled={adminDisabled || busy}
              autoComplete="current-password"
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "admin-login-error" : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
              disabled={adminDisabled || busy}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                color: "#4fa3ff",
                fontWeight: 700,
                fontSize: "0.75rem",
                cursor: "pointer",
                fontFamily: "inherit",
                padding: "0.35rem 0.4rem",
              }}
            >
              {showPassword ? t("login.hidePassword") : t("login.showPassword")}
            </button>
          </div>
          {error ? (
            <div id="admin-login-error" style={styles.loginError} role="alert">
              {error}
            </div>
          ) : null}
          <button type="submit" style={styles.primaryBtn} disabled={adminDisabled || busy}>
            {busy ? t("login.signingIn") : t("login.signIn")}
          </button>
        </form>
        <button
          type="button"
          style={styles.ghostBtn}
          onClick={() => navigate(localePath(lng))}
          disabled={busy}
        >
          {t("login.back")}
        </button>
      </main>
    </div>
  );
}
