import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, fetchAdminSession } from "./api.js";
import i18n from "./i18n/index.js";
import { styles } from "./styles.js";

const AppDataContext = createContext(null);

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData outside provider");
  return ctx;
}

export function AppDataProvider({ children }) {
  const [scenarios, setScenarios] = useState(null);
  const [categories, setCategories] = useState(null);
  const [scenariosLoadError, setScenariosLoadError] = useState(null);
  const [serverConfig, setServerConfig] = useState({
    loaded: false,
    authConfigured: true,
    requireUsername: false,
  });
  const [adminSession, setAdminSession] = useState(false);
  const [notification, setNotification] = useState(null);
  const notifyTimerRef = useRef(null);

  const notify = useCallback((msg, type = "success") => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    setNotification({ msg, type });
    notifyTimerRef.current = setTimeout(() => {
      setNotification(null);
      notifyTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(
    () => () => {
      if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    },
    []
  );

  const loadCategoriesFromServer = useCallback(async () => {
    try {
      const res = await apiFetch("/api/categories");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const list = Array.isArray(data?.categories) ? data.categories : null;
      if (!list) throw new Error("bad response");
      setCategories(list);
    } catch {
      setCategories([]);
    }
  }, []);

  const loadScenariosFromServer = useCallback(async () => {
    setScenariosLoadError(null);
    try {
      const res = await apiFetch("/api/scenarios");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const list = Array.isArray(data?.scenarios) ? data.scenarios : null;
      if (!list) throw new Error("bad response");
      setScenarios(list);
    } catch {
      setScenarios([]);
      setScenariosLoadError(i18n.t("employee.loadError"));
    }
  }, []);

  useEffect(() => {
    loadScenariosFromServer();
    loadCategoriesFromServer();
  }, [loadScenariosFromServer, loadCategoriesFromServer]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiFetch("/api/config").then((res) => res.json()), fetchAdminSession()])
      .then(([data, isAdmin]) => {
        if (cancelled) return;
        setServerConfig({
          loaded: true,
          authConfigured: data?.authConfigured !== false,
          requireUsername: !!data?.requireUsername,
        });
        setAdminSession(isAdmin);
      })
      .catch(() => {
        if (cancelled) return;
        setServerConfig({ loaded: true, authConfigured: false, requireUsername: false });
        setAdminSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      scenarios,
      setScenarios,
      categories,
      setCategories,
      scenariosLoadError,
      serverConfig,
      adminSession,
      setAdminSession,
      notify,
      loadScenariosFromServer,
      loadCategoriesFromServer,
    }),
    [
      scenarios,
      categories,
      scenariosLoadError,
      serverConfig,
      adminSession,
      notify,
      loadScenariosFromServer,
      loadCategoriesFromServer,
    ]
  );

  return (
    <AppDataContext.Provider value={value}>
      {notification ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...styles.notification,
            background: notification.type === "error" ? "#c0392b" : "#1a6b4a",
          }}
        >
          {notification.msg}
        </div>
      ) : null}
      {children}
    </AppDataContext.Provider>
  );
}
