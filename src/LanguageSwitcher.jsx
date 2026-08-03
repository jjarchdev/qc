import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, isSupportedLocale, setStoredLocale } from "./i18n/index.js";

export default function LanguageSwitcher({ style }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { lng } = useParams();
  const current = isSupportedLocale(lng) ? lng : i18n.language;

  const switchTo = (next) => {
    if (next === current) return;
    setStoredLocale(next);
    const segments = location.pathname.split("/").filter(Boolean);
    if (segments.length && isSupportedLocale(segments[0])) segments[0] = next;
    else segments.unshift(next);
    navigate(`/${segments.join("/")}${location.search}${location.hash}`);
  };

  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 3,
        borderRadius: 8,
        border: "1px solid #1a2a3a",
        background: "#0d1520",
        ...style,
      }}
    >
      {SUPPORTED_LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => switchTo(code)}
          aria-pressed={current === code}
          style={{
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: "0.72rem",
            letterSpacing: "0.04em",
            padding: "0.35rem 0.55rem",
            borderRadius: 6,
            background: current === code ? "rgba(79,163,255,0.2)" : "transparent",
            color: current === code ? "#4fa3ff" : "#8899aa",
          }}
        >
          {t(`lang.${code}`)}
        </button>
      ))}
    </div>
  );
}
