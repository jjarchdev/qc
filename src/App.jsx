import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { apiFetch, apiFetchWithAuth, fetchAdminSession, logoutAdmin } from "./api.js";

const ACCENT_PALETTE = [
  "#e74c3c",
  "#e67e22",
  "#3498db",
  "#9b59b6",
  "#1abc9c",
  "#2980b9",
  "#16a085",
  "#c0392b",
  "#8e44ad",
  "#27ae60",
];

const DEFAULT_ACCENT = "#7f8c8d";

function accentForCategory(label) {
  const s = String(label || "");
  if (!s) return DEFAULT_ACCENT;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

function buildCategoryCounts(scenarios) {
  const by = Object.create(null);
  for (let i = 0; i < scenarios.length; i++) {
    const c = scenarios[i].category;
    by[c] = (by[c] || 0) + 1;
  }
  return { total: scenarios.length, by };
}

function useIsNarrow(breakpoint = 860) {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);
  return narrow;
}

export default function App() {
  const [view, setView] = useState("home");
  const [scenarios, setScenarios] = useState(null);
  const [categories, setCategories] = useState(null);
  const [scenariosLoadError, setScenariosLoadError] = useState(null);
  const [serverConfig, setServerConfig] = useState({
    loaded: false,
    authConfigured: true,
    requireUsername: false,
  });
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [adminSession, setAdminSession] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [editingScenario, setEditingScenario] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [notification, setNotification] = useState(null);
  const notifyTimerRef = useRef(null);

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
      setScenariosLoadError("Could not load scenarios.");
    }
  }, []);

  useEffect(() => {
    loadScenariosFromServer();
    loadCategoriesFromServer();
  }, [loadScenariosFromServer, loadCategoriesFromServer]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch("/api/config").then((res) => res.json()),
      fetchAdminSession(),
    ])
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
        setServerConfig({
          loaded: true,
          authConfigured: false,
          requireUsername: false,
        });
        setAdminSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scenarioList = scenarios ?? [];
  const categoryCounts = useMemo(() => buildCategoryCounts(scenarioList), [scenarioList]);
  const filteredScenarios = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scenarioList.filter((s) => {
      const matchesSearch =
        q.length === 0 ||
        s.title.toLowerCase().includes(q) ||
        s.scenario.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q));
      const matchesCat = filterCategory === "All" || s.category === filterCategory;
      return matchesSearch && matchesCat;
    });
  }, [scenarioList, searchQuery, filterCategory]);

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

  useEffect(() => {
    if (scenarios == null) return;
    setSelectedScenario((prev) => (prev && (scenarios.find((s) => s.id === prev.id) ?? null)) || null);
    setEditingScenario((prev) => (prev && (scenarios.find((s) => s.id === prev.id) ?? null)) || null);
    setDeleteConfirm((prev) => (prev != null && scenarios.some((s) => s.id === prev) ? prev : null));
  }, [scenarios]);

  const handleAuthFailure = useCallback(
    (res) => {
      if (res.status === 401) {
        setAdminSession(false);
        setView("admin-login");
        notify("Sign in again", "error");
        return true;
      }
      return false;
    },
    [notify]
  );

  const handleAdminLogin = async () => {
    if (!serverConfig.loaded) {
      setAdminError("Wait and try again.");
      return;
    }
    if (!serverConfig.authConfigured) {
      setAdminError("Login disabled.");
      return;
    }
    setAdminError("");
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdminError(data?.error || "Sign in failed.");
        return;
      }
      if (!data?.ok) {
        setAdminError("Bad response.");
        return;
      }
      setAdminSession(true);
      setAdminUsername("");
      setAdminPassword("");
      await Promise.all([loadScenariosFromServer(), loadCategoriesFromServer()]);
      setView("admin");
    } catch {
      setAdminError("Server unreachable.");
    }
  };

  const handleAdminLogout = async () => {
    try {
      await logoutAdmin();
    } catch {
      /* still clear local session */
    }
    setAdminSession(false);
    setView("home");
    setShowAddForm(false);
    setEditingScenario(null);
    setShowCategoryManager(false);
    loadScenariosFromServer();
  };

  const openAdmin = () => {
    if (adminSession) {
      setView("admin");
      loadScenariosFromServer();
      return;
    }
    setView("admin-login");
  };

  const saveScenario = async (data) => {
    if (!adminSession) {
      notify("Not signed in", "error");
      return;
    }
    const tags = data.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const body = {
      category: data.category,
      title: data.title,
      scenario: data.scenario,
      solution: data.solution,
      tags,
      is_published: data.is_published !== false,
    };
    try {
      const res = editingScenario
        ? await apiFetchWithAuth(`/api/scenarios/${editingScenario.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          })
        : await apiFetchWithAuth("/api/scenarios", {
            method: "POST",
            body: JSON.stringify(body),
          });
      if (handleAuthFailure(res)) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || "Save failed.", "error");
        return;
      }
      const payload = await res.json().catch(() => ({}));
      const saved = payload?.scenario;
      if (saved) {
        setScenarios((prev) =>
          editingScenario ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved]
        );
      } else {
        await loadScenariosFromServer();
      }
      if (editingScenario) {
        notify("Saved.");
        setEditingScenario(null);
      } else {
        notify("Added.");
        setShowAddForm(false);
      }
    } catch {
      notify("Server unreachable", "error");
    }
  };

  const saveCategory = async (data, editingSlug = null) => {
    if (!adminSession) {
      notify("Not signed in", "error");
      return false;
    }
    try {
      const res = editingSlug
        ? await apiFetchWithAuth(`/api/categories/${encodeURIComponent(editingSlug)}`, {
            method: "PUT",
            body: JSON.stringify(data),
          })
        : await apiFetchWithAuth("/api/categories", {
            method: "POST",
            body: JSON.stringify(data),
          });
      if (handleAuthFailure(res)) return false;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || "Category save failed.", "error");
        return false;
      }
      await Promise.all([loadCategoriesFromServer(), loadScenariosFromServer()]);
      notify(editingSlug ? "Category updated." : "Category added.");
      return true;
    } catch {
      notify("Server unreachable", "error");
      return false;
    }
  };

  const deleteCategory = async (slug) => {
    if (!adminSession) {
      notify("Not signed in", "error");
      return false;
    }
    try {
      const res = await apiFetchWithAuth(`/api/categories/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (handleAuthFailure(res)) return false;
      if (res.status === 404) {
        notify("Category not found", "error");
        return false;
      }
      if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || "Category in use.", "error");
        return false;
      }
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || "Delete failed.", "error");
        return false;
      }
      await loadCategoriesFromServer();
      notify("Category deleted.");
      return true;
    } catch {
      notify("Server unreachable", "error");
      return false;
    }
  };

  const deleteScenario = async (id) => {
    if (!adminSession) {
      notify("Not signed in", "error");
      return;
    }
    try {
      const res = await apiFetchWithAuth(`/api/scenarios/${id}`, { method: "DELETE" });
      if (handleAuthFailure(res)) return;
      if (res.status === 404) {
        notify("Not found", "error");
        return;
      }
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        notify(err?.error || "Delete failed.", "error");
        return;
      }
      setScenarios((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirm(null);
      notify("Deleted.");
    } catch {
      notify("Server unreachable", "error");
    }
  };

  const categoryLabels = useMemo(
    () => (categories || []).map((c) => c.label),
    [categories]
  );
  const allCategories = useMemo(() => ["All", ...categoryLabels], [categoryLabels]);

  return (
    <div style={styles.root}>
      {notification && (
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
      )}

      {view === "home" && (
        <HomeScreen onEmployee={() => setView("employee")} onAdmin={openAdmin} />
      )}

      {view === "employee" && (
        <EmployeeView
          listLoading={scenarios === null}
          listError={scenariosLoadError}
          onRetryLoad={loadScenariosFromServer}
          scenarios={filteredScenarios}
          categoryCounts={categoryCounts}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          allCategories={allCategories}
          selectedScenario={selectedScenario}
          setSelectedScenario={setSelectedScenario}
          onBack={() => {
            setView("home");
            setSelectedScenario(null);
            setSearchQuery("");
            setFilterCategory("All");
          }}
        />
      )}

      {view === "admin-login" && (
        <AdminLogin
          requireUsername={serverConfig.requireUsername}
          username={adminUsername}
          setUsername={setAdminUsername}
          password={adminPassword}
          setPassword={setAdminPassword}
          error={adminError}
          adminDisabled={serverConfig.loaded && !serverConfig.authConfigured}
          onLogin={handleAdminLogin}
          onBack={() => {
            setView("home");
            setAdminError("");
            setAdminUsername("");
            setAdminPassword("");
          }}
        />
      )}

      {view === "admin" && (
        <AdminView
          listLoading={scenarios === null || categories === null}
          scenarios={scenarioList}
          categories={categories || []}
          onAdd={() => {
            setShowAddForm(true);
            setEditingScenario(null);
            setShowCategoryManager(false);
          }}
          onManageCategories={() => {
            setShowCategoryManager(true);
            setShowAddForm(false);
            setEditingScenario(null);
          }}
          onEdit={(s) => {
            setEditingScenario(s);
            setShowAddForm(false);
            setShowCategoryManager(false);
          }}
          onDelete={(id) => setDeleteConfirm(id)}
          deleteConfirm={deleteConfirm}
          setDeleteConfirm={setDeleteConfirm}
          confirmDelete={deleteScenario}
          showAddForm={showAddForm}
          setShowAddForm={setShowAddForm}
          showCategoryManager={showCategoryManager}
          setShowCategoryManager={setShowCategoryManager}
          editingScenario={editingScenario}
          setEditingScenario={setEditingScenario}
          onSave={saveScenario}
          onSaveCategory={saveCategory}
          onDeleteCategory={deleteCategory}
          onLogout={handleAdminLogout}
        />
      )}
    </div>
  );
}

function HomeScreen({ onEmployee, onAdmin }) {
  return (
    <div style={styles.homeWrap}>
      <main style={styles.homeInner}>
        <header>
          <div style={styles.homeBadge}>QM PLAYBOOK</div>
          <h1 style={styles.homeTitle}>
            Quality Management
            <br />
            Procedure Playbook
          </h1>
          <p style={styles.homeSubtitle}>Quality scenario procedures.</p>
        </header>
        <div style={styles.homeBtns}>
          <button type="button" style={styles.primaryBtn} onClick={onEmployee}>
            <span style={styles.btnIcon}>▶</span> Employee Access
          </button>
          <button type="button" style={styles.ghostBtn} onClick={onAdmin}>
            <span style={styles.btnIcon}>⚙</span> Admin Portal
          </button>
        </div>
      </main>
      <div style={styles.homeDeco} aria-hidden />
    </div>
  );
}

function EmployeeView({
  listLoading,
  listError,
  onRetryLoad,
  scenarios,
  categoryCounts,
  searchQuery,
  setSearchQuery,
  filterCategory,
  setFilterCategory,
  allCategories,
  selectedScenario,
  setSelectedScenario,
  onBack,
}) {
  const narrow = useIsNarrow();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!narrow) setNavOpen(false);
  }, [narrow]);

  return (
    <div style={styles.appWrap}>
      <nav
        style={{
          ...styles.sidebar,
          ...(narrow
            ? {
                position: "fixed",
                inset: "0 auto 0 0",
                zIndex: 40,
                transform: navOpen ? "translateX(0)" : "translateX(-105%)",
                transition: "transform 0.2s ease",
                boxShadow: navOpen ? "8px 0 24px rgba(0,0,0,0.45)" : "none",
              }
            : null),
        }}
        aria-label="Scenario filters"
      >
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarLogo}>QM</div>
          <div>
            <div style={styles.sidebarTitle}>Playbook</div>
            <div style={styles.sidebarSub}>Employee View</div>
          </div>
        </div>
        <input
          style={styles.searchInput}
          placeholder="Search scenarios..."
          aria-label="Search scenarios"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedScenario(null);
          }}
        />
        <div style={styles.catList}>
          {allCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              style={{
                ...styles.catBtn,
                ...(filterCategory === cat ? styles.catBtnActive : {}),
              }}
              onClick={() => {
                setFilterCategory(cat);
                setSelectedScenario(null);
                setNavOpen(false);
              }}
            >
              {cat}
              <span style={styles.catCount}>
                {cat === "All" ? categoryCounts.total : categoryCounts.by[cat] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <button type="button" style={styles.backBtn} onClick={onBack}>
          ← Back to Home
        </button>
      </nav>
      {narrow && navOpen ? (
        <button type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} style={styles.navScrim} />
      ) : null}

      <main style={styles.main} id="employee-main">
        {narrow ? (
          <div style={styles.mobileBar}>
            <button type="button" style={styles.menuBtn} onClick={() => setNavOpen(true)}>
              Menu
            </button>
            <span style={styles.mobileBarTitle}>
              {selectedScenario
                ? selectedScenario.title
                : filterCategory === "All"
                  ? "All Scenarios"
                  : filterCategory}
            </span>
          </div>
        ) : null}
        {listLoading ? (
          <div style={styles.empty}>Loading…</div>
        ) : listError ? (
          <div style={styles.loadErrorBox}>
            <p style={styles.loadErrorText}>{listError}</p>
            <button type="button" style={styles.primaryBtn} onClick={onRetryLoad}>
              Retry
            </button>
          </div>
        ) : selectedScenario ? (
          <ScenarioDetail scenario={selectedScenario} onBack={() => setSelectedScenario(null)} />
        ) : (
          <>
            <div style={styles.mainHeader}>
              <h2 style={styles.mainTitle}>
                {filterCategory === "All" ? "All Scenarios" : filterCategory}
              </h2>
              <span style={styles.mainCount}>{scenarios.length} procedures</span>
            </div>
            {scenarios.length === 0 ? (
              <div style={styles.empty}>
                {filterCategory === "All" && !searchQuery.trim()
                  ? "No procedures published yet."
                  : "No matches."}
              </div>
            ) : (
              <div style={styles.cardGrid}>
                {scenarios.map((s) => (
                  <ScenarioCard key={s.id} scenario={s} onSelect={() => setSelectedScenario(s)} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ScenarioCard({ scenario, onSelect }) {
  const color = accentForCategory(scenario.category);
  const text = scenario.scenario;
  const snippet = text.length > 100 ? `${text.slice(0, 100)}…` : text;

  return (
    <div
      role="button"
      tabIndex={0}
      style={styles.card}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div style={{ ...styles.cardAccent, background: color }} />
      <div style={styles.cardCat}>{scenario.category}</div>
      <h3 style={styles.cardTitle}>{scenario.title}</h3>
      <p style={styles.cardSnippet}>{snippet}</p>
      <div style={styles.cardTags}>
        {scenario.tags.map((tag, i) => (
          <span key={`${tag}-${i}`} style={styles.tag}>
            {tag}
          </span>
        ))}
      </div>
      <div style={styles.cardArrow}>Open →</div>
    </div>
  );
}

function ScenarioDetail({ scenario, onBack }) {
  const steps = scenario.solution.split("\n").filter((line) => line.trim());

  return (
    <article style={styles.detail} aria-labelledby="scenario-detail-title">
      <button type="button" style={styles.detailBack} onClick={onBack}>
        ← All Scenarios
      </button>
      <div style={styles.detailCat}>{scenario.category}</div>
      <h2 id="scenario-detail-title" style={styles.detailTitle}>
        {scenario.title}
      </h2>
      <div style={styles.detailSection}>
        <div style={styles.detailSectionLabel}>Situation</div>
        <p style={styles.detailBody}>{scenario.scenario}</p>
      </div>
      <div style={styles.detailSection}>
        <div style={styles.detailSectionLabel}>Procedure</div>
        <ol style={styles.stepList}>
          {steps.map((line, i) => {
            const num = line.match(/^(\d+)\./)?.[1];
            const text = line.replace(/^\d+\.\s*/, "");
            return (
              <li key={i} style={styles.stepItem}>
                <span style={styles.stepNum}>{num || i + 1}</span>
                <span style={styles.stepText}>{text}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <div style={styles.detailTags}>
        {scenario.tags.map((tag, i) => (
          <span key={`${tag}-${i}`} style={styles.tagLarge}>
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}

function AdminLogin({
  requireUsername,
  username,
  setUsername,
  password,
  setPassword,
  error,
  adminDisabled,
  onLogin,
  onBack,
}) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin();
  };

  return (
    <div style={styles.loginWrap}>
      <main style={styles.loginBox}>
        <div style={styles.loginIcon}>⚙</div>
        <h2 style={styles.loginTitle}>Admin Portal</h2>
        <p style={styles.loginSub}>
          {adminDisabled ? "Login disabled." : requireUsername ? "Username and password" : "Password"}
        </p>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}
        >
          {requireUsername && (
            <input
              type="text"
              style={styles.loginInput}
              placeholder="Username"
              value={username}
              disabled={adminDisabled}
              autoComplete="username"
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "admin-login-error" : undefined}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
          <input
            type="password"
            style={styles.loginInput}
            placeholder="Password"
            value={password}
            disabled={adminDisabled}
            autoComplete="current-password"
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? "admin-login-error" : undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <div id="admin-login-error" style={styles.loginError} role="alert">
              {error}
            </div>
          )}
          <button type="submit" style={styles.primaryBtn} disabled={adminDisabled}>
            Sign in
          </button>
        </form>
        <button type="button" style={styles.ghostBtn} onClick={onBack}>
          ← Back
        </button>
      </main>
    </div>
  );
}

function AdminView({
  listLoading,
  scenarios,
  categories,
  onAdd,
  onManageCategories,
  onEdit,
  onDelete,
  deleteConfirm,
  setDeleteConfirm,
  confirmDelete,
  showAddForm,
  setShowAddForm,
  showCategoryManager,
  setShowCategoryManager,
  editingScenario,
  setEditingScenario,
  onSave,
  onSaveCategory,
  onDeleteCategory,
  onLogout,
}) {
  const distinctCategoryCount = useMemo(() => categories.length, [categories]);
  const narrow = useIsNarrow();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!narrow) setNavOpen(false);
  }, [narrow]);

  useEffect(() => {
    const main = document.getElementById("admin-main");
    if (main) main.scrollTop = 0;
  }, [showAddForm, showCategoryManager, editingScenario, listLoading]);

  return (
    <div style={styles.appWrap}>
      <nav
        style={{
          ...styles.sidebar,
          background: "#0f1923",
          ...(narrow
            ? {
                position: "fixed",
                inset: "0 auto 0 0",
                zIndex: 40,
                transform: navOpen ? "translateX(0)" : "translateX(-105%)",
                transition: "transform 0.2s ease",
                boxShadow: navOpen ? "8px 0 24px rgba(0,0,0,0.45)" : "none",
              }
            : null),
        }}
        aria-label="Admin navigation"
      >
        <div style={styles.sidebarHeader}>
          <div style={{ ...styles.sidebarLogo, background: "#c0392b" }}>A</div>
          <div>
            <div style={styles.sidebarTitle}>Admin</div>
            <div style={styles.sidebarSub}>Scenario Manager</div>
          </div>
        </div>
        <div style={styles.adminStats}>
          <div style={styles.statBox}>
            <div style={styles.statNum}>{scenarios.length}</div>
            <div style={styles.statLabel}>Total Scenarios</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statNum}>{distinctCategoryCount}</div>
            <div style={styles.statLabel}>Categories</div>
          </div>
        </div>
        <button
          type="button"
          style={{ ...styles.primaryBtn, margin: "0 1rem 0.5rem" }}
          onClick={() => {
            onAdd();
            setNavOpen(false);
          }}
        >
          + Add Scenario
        </button>
        <button
          type="button"
          style={{ ...styles.ghostBtn, margin: "0 1rem 0.5rem", justifyContent: "center" }}
          onClick={() => {
            onManageCategories();
            setNavOpen(false);
          }}
        >
          Manage Categories
        </button>
        <button type="button" style={{ ...styles.backBtn, marginTop: "auto" }} onClick={onLogout}>
          ⇦ Logout
        </button>
      </nav>
      {narrow && navOpen ? (
        <button type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} style={styles.navScrim} />
      ) : null}

      <main style={styles.main} id="admin-main">
        {narrow ? (
          <div style={styles.mobileBar}>
            <button type="button" style={styles.menuBtn} onClick={() => setNavOpen(true)}>
              Menu
            </button>
            <span style={styles.mobileBarTitle}>Admin</span>
          </div>
        ) : null}
        {listLoading ? (
          <div style={styles.empty}>Loading…</div>
        ) : showCategoryManager ? (
          <CategoryManager
            categories={categories}
            onSave={onSaveCategory}
            onDelete={onDeleteCategory}
            onBack={() => setShowCategoryManager(false)}
          />
        ) : showAddForm || editingScenario ? (
          <ScenarioForm
            initial={editingScenario}
            categories={categories}
            onSave={onSave}
            onCancel={() => {
              setShowAddForm(false);
              setEditingScenario(null);
            }}
          />
        ) : (
          <>
            <div style={styles.mainHeader}>
              <h2 style={styles.mainTitle}>Manage Scenarios</h2>
              <span style={styles.mainCount}>{scenarios.length} entries</span>
            </div>
            {categories.length === 0 ? (
              <div style={styles.empty}>Add categories before creating scenarios.</div>
            ) : scenarios.length === 0 ? (
              <div style={styles.empty}>No scenarios yet.</div>
            ) : null}
            <div style={styles.adminTable}>
              {scenarios.length > 0 ? (
                <div style={styles.tableHead}>
                  <span style={{ flex: 2 }}>Title</span>
                  <span style={{ flex: 1 }}>Category</span>
                  <span style={{ width: 80 }}>Status</span>
                  <span style={{ flex: 1, textAlign: "right" }}>Actions</span>
                </div>
              ) : null}
              {scenarios.map((row) => (
                <div key={row.id} style={styles.tableRow}>
                  {deleteConfirm === row.id ? (
                    <div style={styles.deleteConfirm}>
                      <span>Delete &quot;{row.title}&quot;?</span>
                      <button type="button" style={styles.dangerBtn} onClick={() => confirmDelete(row.id)}>
                        Yes, Delete
                      </button>
                      <button type="button" style={styles.cancelBtn} onClick={() => setDeleteConfirm(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span style={{ flex: 2, fontWeight: 600, color: "#eaf0fb" }}>{row.title}</span>
                      <span style={{ flex: 1, color: "#8899aa" }}>{row.category}</span>
                      <span
                        style={{
                          width: 80,
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: row.is_published === false ? "#e67e22" : "#1abc9c",
                        }}
                      >
                        {row.is_published === false ? "Draft" : "Live"}
                      </span>
                      <div style={{ flex: 1, display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <button type="button" style={styles.editBtn} onClick={() => onEdit(row)}>
                          Edit
                        </button>
                        <button type="button" style={styles.dangerBtn} onClick={() => onDelete(row.id)}>
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function CategoryManager({ categories, onSave, onDelete, onBack }) {
  const [label, setLabel] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [editingSlug, setEditingSlug] = useState(null);
  const [formError, setFormError] = useState("");
  const [deleteSlug, setDeleteSlug] = useState(null);
  const formRef = useRef(null);

  const editingLabel = useMemo(() => {
    if (!editingSlug) return "";
    return categories.find((c) => c.slug === editingSlug)?.label || label;
  }, [categories, editingSlug, label]);

  const resetForm = () => {
    setLabel("");
    setSortOrder("");
    setEditingSlug(null);
    setFormError("");
  };

  const startEdit = (cat) => {
    setEditingSlug(cat.slug);
    setLabel(cat.label);
    setSortOrder(String(cat.sort_order));
    setFormError("");
    setDeleteSlug(null);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleSave = async () => {
    if (!label.trim()) {
      setFormError("Label required.");
      return;
    }
    const payload = { label: label.trim() };
    if (sortOrder.trim() !== "" && Number.isFinite(Number(sortOrder))) {
      payload.sort_order = Number(sortOrder);
    }
    const ok = await onSave(payload, editingSlug);
    if (ok) resetForm();
  };

  return (
    <div style={styles.formWrap}>
      <button type="button" style={styles.detailBack} onClick={onBack}>
        ← Back to Scenarios
      </button>
      <h2 style={styles.formTitle}>Manage Categories</h2>
      <p style={{ color: "#8899aa", marginTop: 0, marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Categories appear in employee filters and the scenario form. Delete is blocked while scenarios use a
        category.
      </p>

      <div ref={formRef}>
        <h3 style={{ ...styles.formTitle, fontSize: "1.1rem", marginTop: 0, marginBottom: "0.5rem" }}>
          {editingSlug ? "Edit Category" : "Add Category"}
        </h3>
        {editingSlug ? (
          <p style={{ color: "#4fa3ff", marginTop: 0, marginBottom: "1rem", fontSize: "0.9rem" }}>
            Editing &quot;{editingLabel}&quot;
          </p>
        ) : null}
        {formError ? (
          <div style={styles.formInlineError} role="alert">
            {formError}
          </div>
        ) : null}
        <label style={styles.label}>Label</label>
        <input
          style={styles.input}
          placeholder="e.g. Training Gap"
          value={label}
          onChange={(e) => {
            setFormError("");
            setLabel(e.target.value);
          }}
        />
        <label style={styles.label}>Sort order</label>
        <input
          style={styles.input}
          type="number"
          placeholder="0"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
        <div style={styles.formActions}>
          <button type="button" style={styles.primaryBtn} onClick={handleSave}>
            {editingSlug ? "Save Category" : "Add Category"}
          </button>
          {editingSlug ? (
            <button type="button" style={styles.ghostBtn} onClick={resetForm}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </div>

      {categories.length === 0 ? (
        <div style={{ ...styles.empty, marginTop: "1.5rem", marginBottom: 0 }}>
          No categories yet. Add the first one above.
        </div>
      ) : (
        <div style={{ ...styles.adminTable, marginTop: "2rem" }}>
          <div style={styles.tableHead}>
            <span style={{ flex: 2 }}>Label</span>
            <span style={{ flex: 1 }}>Slug</span>
            <span style={{ width: 70 }}>Order</span>
            <span style={{ flex: 1, textAlign: "right" }}>Actions</span>
          </div>
          {categories.map((cat) => (
            <div key={cat.slug} style={styles.tableRow}>
              {deleteSlug === cat.slug ? (
                <div style={styles.deleteConfirm}>
                  <span>Delete &quot;{cat.label}&quot;?</span>
                  <button
                    type="button"
                    style={styles.dangerBtn}
                    onClick={async () => {
                      const ok = await onDelete(cat.slug);
                      if (ok) setDeleteSlug(null);
                    }}
                  >
                    Yes, Delete
                  </button>
                  <button type="button" style={styles.cancelBtn} onClick={() => setDeleteSlug(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span style={{ flex: 2, fontWeight: 600 }}>{cat.label}</span>
                  <span style={{ flex: 1, color: "#8899aa", fontSize: "0.85rem" }}>{cat.slug}</span>
                  <span style={{ width: 70, color: "#8899aa" }}>{cat.sort_order}</span>
                  <div style={{ flex: 1, display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button type="button" style={styles.editBtn} onClick={() => startEdit(cat)}>
                      Edit
                    </button>
                    <button type="button" style={styles.dangerBtn} onClick={() => setDeleteSlug(cat.slug)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScenarioForm({ initial, categories, onSave, onCancel }) {
  const defaultCategory = categories[0]?.label || "";
  const [form, setForm] = useState(() => ({
    category: initial?.category || defaultCategory,
    title: initial?.title || "",
    scenario: initial?.scenario || "",
    solution: initial?.solution || "",
    tags: initial?.tags?.join(", ") || "",
    is_published: initial?.is_published !== false,
  }));
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setForm({
      category: initial?.category || categories[0]?.label || "",
      title: initial?.title || "",
      scenario: initial?.scenario || "",
      solution: initial?.solution || "",
      tags: initial?.tags?.join(", ") || "",
      is_published: initial?.is_published !== false,
    });
    setFormError("");
  }, [initial, categories]);

  const patch = (k, v) => {
    setFormError("");
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handleSave = async () => {
    if (!form.category) {
      setFormError("Add a category first.");
      return;
    }
    if (!form.title.trim() || !form.scenario.trim() || !form.solution.trim()) {
      setFormError("Title, scenario, and solution required.");
      return;
    }
    setFormError("");
    await onSave(form);
  };

  return (
    <div style={styles.formWrap}>
      <h2 style={styles.formTitle}>{initial ? "Edit Scenario" : "Add New Scenario"}</h2>

      {formError ? (
        <div id="scenario-form-error" style={styles.formInlineError} role="alert">
          {formError}
        </div>
      ) : null}

      <label style={styles.label}>Category</label>
      <select
        style={styles.select}
        value={form.category}
        onChange={(e) => patch("category", e.target.value)}
        disabled={categories.length === 0}
      >
        {categories.length === 0 ? (
          <option value="">No categories yet</option>
        ) : (
          categories.map((c) => (
            <option key={c.slug} value={c.label}>
              {c.label}
            </option>
          ))
        )}
      </select>

      <label style={styles.label}>Title</label>
      <input
        style={styles.input}
        placeholder="Title"
        value={form.title}
        onChange={(e) => patch("title", e.target.value)}
      />

      <label style={styles.label}>Scenario</label>
      <textarea
        style={{ ...styles.input, height: 100 }}
        placeholder="Situation"
        value={form.scenario}
        onChange={(e) => patch("scenario", e.target.value)}
      />

      <label style={styles.label}>Solution</label>
      <textarea
        style={{ ...styles.input, height: 200 }}
        placeholder={"1. Step one\n2. Step two"}
        value={form.solution}
        onChange={(e) => patch("solution", e.target.value)}
      />

      <label style={styles.label}>Tags</label>
      <input
        style={styles.input}
        placeholder="NCR, CAPA, Audit"
        value={form.tags}
        onChange={(e) => patch("tags", e.target.value)}
      />

      <label style={styles.checkLabel}>
        <input
          type="checkbox"
          checked={form.is_published}
          onChange={(e) => patch("is_published", e.target.checked)}
        />
        Published
      </label>

      <div style={styles.formActions}>
        <button type="button" style={styles.primaryBtn} onClick={handleSave}>
          {initial ? "Save Changes" : "Add Scenario"}
        </button>
        <button type="button" style={styles.ghostBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const styles = {
  root: {
    fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
    minHeight: "100vh",
    background: "#0d1520",
    color: "#eaf0fb",
    position: "relative",
  },
  notification: {
    position: "fixed",
    top: "1rem",
    right: "1rem",
    padding: "0.75rem 1.25rem",
    borderRadius: 8,
    color: "#fff",
    fontWeight: 600,
    fontSize: "0.9rem",
    zIndex: 9999,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(79, 163, 255, 0.25)",
  },

  homeWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(160deg, #0a1220 0%, #0d1520 40%, #12243a 100%)",
    position: "relative",
    overflow: "hidden",
  },
  homeDeco: {
    position: "absolute",
    width: 520,
    height: 520,
    borderRadius: "50%",
    right: "-120px",
    top: "-80px",
    background:
      "radial-gradient(circle, rgba(79, 163, 255, 0.28) 0%, rgba(26, 107, 210, 0.12) 40%, transparent 70%)",
    pointerEvents: "none",
    filter: "blur(2px)",
  },
  homeInner: {
    textAlign: "center",
    zIndex: 1,
    padding: "2rem",
    maxWidth: 640,
    width: "100%",
  },
  homeBadge: {
    display: "inline-block",
    background: "rgba(79, 163, 255, 0.12)",
    color: "#4fa3ff",
    border: "1px solid rgba(79, 163, 255, 0.35)",
    borderRadius: 999,
    padding: "0.35rem 0.9rem",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    marginBottom: "1.25rem",
  },
  homeTitle: {
    fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
    fontWeight: 800,
    lineHeight: 1.15,
    margin: "0 0 1rem",
    color: "#eaf0fb",
    letterSpacing: "-0.02em",
  },
  homeSubtitle: {
    color: "#8899aa",
    fontSize: "1.1rem",
    margin: "0 0 2.25rem",
    lineHeight: 1.5,
  },
  homeBtns: {
    display: "flex",
    gap: "0.75rem",
    flexWrap: "wrap",
    justifyContent: "center",
  },

  primaryBtn: {
    background: "linear-gradient(135deg, #4fa3ff 0%, #1a6bd2 100%)",
    color: "#fff",
    border: "none",
    padding: "0.8rem 1.5rem",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "0.95rem",
    cursor: "pointer",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    boxShadow: "0 8px 20px rgba(26, 107, 210, 0.35), 0 0 0 1px rgba(79, 163, 255, 0.2)",
  },
  ghostBtn: {
    background: "transparent",
    color: "#eaf0fb",
    border: "1px solid #1a2a3a",
    padding: "0.8rem 1.5rem",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "0.95rem",
    cursor: "pointer",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  btnIcon: {
    fontSize: "0.85rem",
    lineHeight: 1,
  },
  editBtn: {
    background: "transparent",
    color: "#4fa3ff",
    border: "1px solid #1a2a3a",
    padding: "0.35rem 0.85rem",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    fontFamily: "inherit",
  },
  dangerBtn: {
    background: "transparent",
    color: "#ff6b6b",
    border: "1px solid rgba(192, 57, 43, 0.45)",
    padding: "0.35rem 0.85rem",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    fontFamily: "inherit",
  },
  cancelBtn: {
    background: "transparent",
    color: "#8899aa",
    border: "1px solid #1a2a3a",
    padding: "0.35rem 0.85rem",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.85rem",
    fontFamily: "inherit",
  },
  backBtn: {
    background: "transparent",
    color: "#4fa3ff",
    border: "none",
    cursor: "pointer",
    fontSize: "0.9rem",
    padding: "0.75rem 1rem",
    textAlign: "left",
    marginTop: "1rem",
    fontFamily: "inherit",
    fontWeight: 600,
  },

  appWrap: {
    display: "flex",
    minHeight: "100vh",
  },
  navScrim: {
    position: "fixed",
    inset: 0,
    border: "none",
    padding: 0,
    margin: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 30,
    cursor: "pointer",
  },
  mobileBar: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  menuBtn: {
    background: "#111e2c",
    color: "#eaf0fb",
    border: "1px solid #1a2a3a",
    borderRadius: 8,
    padding: "0.45rem 0.85rem",
    fontWeight: 700,
    fontSize: "0.85rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  mobileBarTitle: {
    color: "#8899aa",
    fontSize: "0.9rem",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sidebar: {
    width: 260,
    background: "#0b1622",
    borderRight: "1px solid #1a2a3a",
    display: "flex",
    flexDirection: "column",
    padding: "1.5rem 0",
    flexShrink: 0,
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0 1rem 1.5rem",
    borderBottom: "1px solid #1a2a3a",
    marginBottom: "1rem",
  },
  sidebarLogo: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "linear-gradient(135deg, #4fa3ff 0%, #1a6bd2 100%)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "0.95rem",
    flexShrink: 0,
    boxShadow: "0 4px 12px rgba(26, 107, 210, 0.4)",
  },
  sidebarTitle: { fontWeight: 700, fontSize: "1rem", lineHeight: 1.2, color: "#eaf0fb" },
  sidebarSub: { fontSize: "0.75rem", color: "#4fa3ff" },
  searchInput: {
    margin: "0 1rem 1rem",
    background: "#111e2c",
    border: "1px solid #1a2a3a",
    borderRadius: 8,
    padding: "0.6rem 0.8rem",
    color: "#eaf0fb",
    fontSize: "0.9rem",
    outline: "none",
    fontFamily: "inherit",
  },
  catList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "0 0.5rem",
    overflowY: "auto",
    flex: 1,
  },
  catBtn: {
    background: "transparent",
    border: "none",
    color: "#8899aa",
    padding: "0.55rem 0.75rem",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: "0.87rem",
    textAlign: "left",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontFamily: "inherit",
  },
  catBtnActive: {
    background: "rgba(79, 163, 255, 0.12)",
    color: "#eaf0fb",
    fontWeight: 600,
  },
  catCount: {
    color: "#8899aa",
    fontSize: "0.75rem",
  },
  main: {
    flex: 1,
    padding: "2rem",
    overflowY: "auto",
    maxHeight: "100vh",
    background: "#0d1520",
  },
  mainHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: "1rem",
    marginBottom: "1.5rem",
    borderBottom: "1px solid #1a2a3a",
    paddingBottom: "1rem",
  },
  mainTitle: {
    fontSize: "1.6rem",
    fontWeight: 700,
    margin: 0,
    color: "#eaf0fb",
  },
  mainCount: {
    color: "#8899aa",
    fontSize: "0.9rem",
  },
  empty: {
    color: "#8899aa",
    textAlign: "center",
    marginTop: "4rem",
    fontSize: "1.05rem",
  },
  loadErrorBox: {
    marginTop: "3rem",
    textAlign: "center",
    maxWidth: 420,
    marginLeft: "auto",
    marginRight: "auto",
  },
  loadErrorText: {
    color: "#8899aa",
    fontSize: "1rem",
    lineHeight: 1.6,
    marginBottom: "1.25rem",
  },

  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "1rem",
  },
  card: {
    background: "#111e2c",
    border: "1px solid #1a2a3a",
    borderRadius: 12,
    padding: "1.25rem",
    cursor: "pointer",
    position: "relative",
    overflow: "hidden",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
  },
  cardAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  cardCat: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#4fa3ff",
    marginBottom: "0.5rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  cardTitle: {
    fontSize: "1.05rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
    lineHeight: 1.3,
    color: "#eaf0fb",
  },
  cardSnippet: {
    color: "#8899aa",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    marginBottom: "0.75rem",
  },
  cardTags: { display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem" },
  tag: {
    background: "rgba(79, 163, 255, 0.12)",
    color: "#4fa3ff",
    padding: "0.15rem 0.5rem",
    borderRadius: 999,
    fontSize: "0.72rem",
    fontWeight: 600,
  },
  cardArrow: {
    color: "#4fa3ff",
    fontSize: "0.82rem",
    fontWeight: 600,
  },

  detail: {
    maxWidth: 760,
  },
  detailBack: {
    background: "transparent",
    border: "none",
    color: "#4fa3ff",
    cursor: "pointer",
    fontSize: "0.9rem",
    padding: "0 0 1.5rem",
    display: "block",
    fontFamily: "inherit",
    fontWeight: 600,
  },
  detailCat: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#4fa3ff",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "0.5rem",
  },
  detailTitle: {
    fontSize: "2rem",
    fontWeight: 700,
    marginBottom: "2rem",
    lineHeight: 1.2,
    color: "#eaf0fb",
  },
  detailSection: {
    background: "#111e2c",
    border: "1px solid #1a2a3a",
    borderRadius: 12,
    padding: "1.5rem",
    marginBottom: "1.5rem",
  },
  detailSectionLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#4fa3ff",
    marginBottom: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  detailBody: {
    color: "#eaf0fb",
    lineHeight: 1.7,
    margin: 0,
  },
  stepList: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
  },
  stepItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "1rem",
    background: "#0d1520",
    border: "1px solid #1a2a3a",
    borderRadius: 10,
    padding: "0.85rem 1rem",
  },
  stepNum: {
    background: "#1a6bd2",
    color: "#fff",
    borderRadius: "50%",
    width: 26,
    height: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.8rem",
    fontWeight: 700,
    flexShrink: 0,
  },
  stepText: { flex: 1, color: "#eaf0fb", fontSize: "0.95rem", lineHeight: 1.5 },
  detailTags: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  tagLarge: {
    background: "rgba(79, 163, 255, 0.12)",
    color: "#4fa3ff",
    padding: "0.3rem 0.7rem",
    borderRadius: 999,
    fontSize: "0.82rem",
    fontWeight: 600,
  },

  loginWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(160deg, #0a1220 0%, #0d1520 40%, #12243a 100%)",
  },
  loginBox: {
    background: "#111e2c",
    border: "1px solid #1a2a3a",
    borderRadius: 16,
    padding: "2.5rem",
    width: "100%",
    maxWidth: 400,
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    alignItems: "stretch",
    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.4)",
  },
  loginIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "linear-gradient(135deg, #4fa3ff 0%, #1a6bd2 100%)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.25rem",
    marginBottom: "0.25rem",
    boxShadow: "0 6px 16px rgba(26, 107, 210, 0.4)",
  },
  loginTitle: {
    textAlign: "left",
    margin: 0,
    fontSize: "1.75rem",
    fontWeight: 700,
    color: "#eaf0fb",
  },
  loginSub: {
    textAlign: "left",
    color: "#8899aa",
    fontSize: "0.9rem",
    margin: "0 0 0.5rem",
  },
  loginInput: {
    background: "#0d1520",
    border: "1px solid #1a2a3a",
    borderRadius: 8,
    padding: "0.75rem 1rem",
    color: "#eaf0fb",
    fontSize: "1rem",
    outline: "none",
    fontFamily: "inherit",
  },
  loginError: {
    color: "#ff6b6b",
    fontSize: "0.85rem",
  },

  adminStats: {
    display: "flex",
    gap: "0.5rem",
    padding: "0 1rem 1.5rem",
  },
  statBox: {
    flex: 1,
    background: "#111e2c",
    borderRadius: 10,
    padding: "0.75rem",
    textAlign: "center",
    border: "1px solid #1a2a3a",
  },
  statNum: { fontSize: "1.5rem", fontWeight: 700, color: "#4fa3ff" },
  statLabel: { fontSize: "0.7rem", color: "#8899aa", marginTop: 2 },
  adminTable: {
    background: "#111e2c",
    border: "1px solid #1a2a3a",
    borderRadius: 12,
    overflow: "hidden",
  },
  tableHead: {
    display: "flex",
    padding: "0.75rem 1.25rem",
    background: "#0b1622",
    borderBottom: "1px solid #1a2a3a",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#8899aa",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  tableRow: {
    display: "flex",
    padding: "1rem 1.25rem",
    borderBottom: "1px solid #1a2a3a",
    alignItems: "center",
    gap: "0.5rem",
  },
  deleteConfirm: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    flex: 1,
    color: "#ff6b6b",
    fontSize: "0.9rem",
    flexWrap: "wrap",
  },

  formWrap: {
    maxWidth: 680,
  },
  formTitle: {
    fontSize: "1.6rem",
    fontWeight: 700,
    marginBottom: "1.5rem",
    color: "#eaf0fb",
  },
  label: {
    display: "block",
    fontSize: "0.78rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#4fa3ff",
    textTransform: "uppercase",
    marginBottom: "0.4rem",
    marginTop: "1rem",
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    marginTop: "1.25rem",
    color: "#eaf0fb",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  input: {
    width: "100%",
    background: "#111e2c",
    border: "1px solid #1a2a3a",
    borderRadius: 8,
    padding: "0.75rem 1rem",
    color: "#eaf0fb",
    fontSize: "0.95rem",
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    background: "#111e2c",
    border: "1px solid #1a2a3a",
    borderRadius: 8,
    padding: "0.75rem 1rem",
    color: "#eaf0fb",
    fontSize: "0.95rem",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  formActions: {
    display: "flex",
    gap: "1rem",
    marginTop: "2rem",
    flexWrap: "wrap",
  },
  formInlineError: {
    background: "rgba(192, 57, 43, 0.15)",
    border: "1px solid rgba(192, 57, 43, 0.45)",
    color: "#ff6b6b",
    padding: "0.65rem 1rem",
    borderRadius: 8,
    fontSize: "0.9rem",
    marginBottom: "0.5rem",
  },
};
