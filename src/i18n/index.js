import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import sq from "./locales/sq.json";
import de from "./locales/de.json";

export const SUPPORTED_LOCALES = ["en", "sq", "de"];
export const DEFAULT_LOCALE = "en";
export const LOCALE_STORAGE_KEY = "qm_locale";

export function isSupportedLocale(lng) {
  return SUPPORTED_LOCALES.includes(String(lng || "").toLowerCase());
}

export function getStoredLocale() {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(v)) return v.toLowerCase();
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function setStoredLocale(lng) {
  if (!isSupportedLocale(lng)) return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sq: { translation: sq },
    de: { translation: de },
  },
  lng: getStoredLocale(),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
