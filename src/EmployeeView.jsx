import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import { useAppData } from "./AppData.jsx";
import { ALL_FILTER, accentForCategory, buildCategoryCounts, localePath } from "./utils.js";
import { useIsNarrow } from "./useIsNarrow.js";
import { pushRecentId, readRecentIds } from "./recent.js";
import { styles } from "./styles.js";

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scenarioMatchesQuery(scenario, rawQuery) {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const haystack = normalizeSearchText(
    [
      scenario.title,
      scenario.category,
      scenario.scenario,
      scenario.solution,
      ...(Array.isArray(scenario.tags) ? scenario.tags : []),
    ].join(" ")
  );
  return q.split(" ").filter(Boolean).every((token) => haystack.includes(token));
}

function parseSteps(solution) {
  return String(solution || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const num = line.match(/^(\d+)\./)?.[1];
      const text = line.replace(/^\d+\.\s*/, "");
      return { key: `${i}-${text.slice(0, 24)}`, num: num || String(i + 1), text };
    });
}

function ScenarioCard({ scenario, onSelect, openLabel }) {
  const color = accentForCategory(scenario.category);
  const text = scenario.scenario;
  const snippet = text.length > 100 ? `${text.slice(0, 100)}…` : text;
  const imageUrl = scenario.image_url || "";

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
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          style={{
            width: "calc(100% + 2.5rem)",
            margin: "-1.25rem -1.25rem 0.85rem",
            maxHeight: 140,
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : null}
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
      <div style={styles.cardArrow}>{openLabel}</div>
    </div>
  );
}

function ScenarioDetail({ scenario, onBack, onNotify }) {
  const { t } = useTranslation();
  const steps = useMemo(() => parseSteps(scenario.solution), [scenario.solution]);
  const [checked, setChecked] = useState(() => ({}));

  useEffect(() => {
    setChecked({});
  }, [scenario.id]);

  const doneCount = steps.reduce((n, step, i) => n + (checked[i] ? 1 : 0), 0);

  const copyProcedure = async () => {
    const body = [
      scenario.title,
      "",
      `${t("employee.situation")}:`,
      scenario.scenario,
      "",
      `${t("employee.procedure")}:`,
      ...steps.map((s) => `${s.num}. ${s.text}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(body);
      onNotify(t("employee.copied"));
    } catch {
      onNotify(t("employee.copyFailed"), "error");
    }
  };

  return (
    <article
      className="print-root"
      style={styles.detail}
      aria-labelledby="scenario-detail-title"
    >
      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
        <button type="button" style={styles.detailBack} onClick={onBack}>
          {t("employee.backAll")}
        </button>
      </div>
      <div style={styles.detailCat}>{scenario.category}</div>
      <h2 id="scenario-detail-title" style={styles.detailTitle}>
        {scenario.title}
      </h2>
      {scenario.image_url ? (
        <img
          src={scenario.image_url}
          alt=""
          style={{
            width: "100%",
            maxHeight: 360,
            objectFit: "cover",
            borderRadius: 12,
            border: "1px solid #1a2a3a",
            marginBottom: "1.25rem",
            display: "block",
          }}
        />
      ) : null}

      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <button type="button" style={styles.ghostBtn} onClick={copyProcedure}>
          {t("employee.copyProcedure")}
        </button>
        <button type="button" style={styles.ghostBtn} onClick={() => window.print()}>
          {t("employee.print")}
        </button>
        {steps.length > 0 ? (
          <span style={{ alignSelf: "center", color: "#8899aa", fontSize: "0.9rem", fontWeight: 600 }}>
            {t("employee.stepsProgress", { done: doneCount, total: steps.length })}
          </span>
        ) : null}
      </div>

      <div style={styles.detailSection}>
        <div style={styles.detailSectionLabel}>{t("employee.situation")}</div>
        <p style={styles.detailBody}>{scenario.scenario}</p>
      </div>
      <div style={styles.detailSection}>
        <div style={styles.detailSectionLabel}>{t("employee.procedure")}</div>
        <ol style={styles.stepList}>
          {steps.map((step, i) => (
            <li key={step.key} style={styles.stepItem}>
              <label
                className="no-print"
                style={{ display: "flex", alignItems: "center", marginRight: "0.25rem" }}
              >
                <input
                  type="checkbox"
                  checked={!!checked[i]}
                  aria-label={t("employee.markStep")}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                />
              </label>
              <span
                style={{
                  ...styles.stepNum,
                  opacity: checked[i] ? 0.55 : 1,
                }}
              >
                {step.num}
              </span>
              <span
                style={{
                  ...styles.stepText,
                  textDecoration: checked[i] ? "line-through" : "none",
                  opacity: checked[i] ? 0.65 : 1,
                }}
              >
                {step.text}
              </span>
            </li>
          ))}
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

export default function EmployeeView() {
  const { t } = useTranslation();
  const { lng, scenarioId } = useParams();
  const navigate = useNavigate();
  const { scenarios, scenariosLoadError, loadScenariosFromServer, categories, notify } = useAppData();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState(ALL_FILTER);
  const [recentIds, setRecentIds] = useState(() => readRecentIds());
  const narrow = useIsNarrow();
  const [navOpen, setNavOpen] = useState(false);
  const searchRef = useRef(null);

  const scenarioList = scenarios ?? [];
  const categoryCounts = useMemo(() => buildCategoryCounts(scenarioList), [scenarioList]);
  const categoryLabels = useMemo(() => (categories || []).map((c) => c.label), [categories]);
  const allCategories = useMemo(() => [ALL_FILTER, ...categoryLabels], [categoryLabels]);

  const selectedScenario = useMemo(() => {
    if (scenarioId == null || scenarioId === "") return null;
    const id = Number(scenarioId);
    if (!Number.isFinite(id)) return null;
    return scenarioList.find((s) => s.id === id) || null;
  }, [scenarioList, scenarioId]);

  const filteredScenarios = useMemo(() => {
    return scenarioList.filter((s) => {
      const matchesSearch = scenarioMatchesQuery(s, searchQuery);
      const matchesCat = filterCategory === ALL_FILTER || s.category === filterCategory;
      return matchesSearch && matchesCat;
    });
  }, [scenarioList, searchQuery, filterCategory]);

  const recentScenarios = useMemo(() => {
    const byId = new Map(scenarioList.map((s) => [s.id, s]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean);
  }, [scenarioList, recentIds]);

  const isFiltering = Boolean(searchQuery.trim()) || filterCategory !== ALL_FILTER;

  const openScenario = (scenario) => {
    if (!scenario) return;
    const next = pushRecentId(scenario.id);
    if (next) setRecentIds(next);
    else setRecentIds(readRecentIds());
    navigate(localePath(lng, "employee", String(scenario.id)));
    setNavOpen(false);
  };

  const closeDetail = () => {
    navigate(localePath(lng, "employee"));
  };

  useEffect(() => {
    if (!narrow) setNavOpen(false);
  }, [narrow]);

  useEffect(() => {
    if (scenarios == null) return;
    if (scenarioId == null || scenarioId === "") return;
    const id = Number(scenarioId);
    if (!Number.isFinite(id)) {
      navigate(localePath(lng, "employee"), { replace: true });
      return;
    }
    if (!scenarioList.some((s) => s.id === id)) {
      navigate(localePath(lng, "employee"), { replace: true });
    }
  }, [scenarios, scenarioId, scenarioList, lng, navigate]);

  useEffect(() => {
    if (selectedScenario) {
      const next = pushRecentId(selectedScenario.id);
      if (next) setRecentIds(next);
    }
  }, [selectedScenario?.id]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target?.isContentEditable;

      if (e.key === "Escape") {
        if (navOpen) {
          setNavOpen(false);
          return;
        }
        if (selectedScenario) {
          closeDetail();
        }
        return;
      }

      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
        if (narrow) setNavOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen, selectedScenario, narrow, lng]);

  const emptyMessage = () => {
    if (searchQuery.trim()) return t("employee.emptySearch");
    if (filterCategory !== ALL_FILTER) return t("employee.emptyCategory");
    return t("employee.emptyPublished");
  };

  return (
    <div style={styles.appWrap}>
      <nav
        className="no-print"
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
        aria-label={t("employee.navLabel")}
      >
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarLogo}>QM</div>
          <div>
            <div style={styles.sidebarTitle}>{t("employee.title")}</div>
            <div style={styles.sidebarSub}>{t("employee.subtitle")}</div>
          </div>
        </div>
        <div style={{ padding: "0 1rem 1rem" }}>
          <LanguageSwitcher style={{ width: "100%", justifyContent: "center" }} />
        </div>
        <div style={{ position: "relative", margin: "0 1rem 0.35rem" }}>
          <input
            ref={searchRef}
            style={{ ...styles.searchInput, margin: 0, width: "100%", boxSizing: "border-box", paddingRight: searchQuery ? "2.5rem" : undefined }}
            placeholder={t("employee.searchPlaceholder")}
            aria-label={t("employee.searchAria")}
            title={t("employee.searchShortcutHint")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (selectedScenario) closeDetail();
            }}
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label={t("employee.clearSearch")}
              onClick={() => {
                setSearchQuery("");
                searchRef.current?.focus();
              }}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                color: "#8899aa",
                cursor: "pointer",
                fontSize: "1.1rem",
                lineHeight: 1,
                padding: 4,
              }}
            >
              ×
            </button>
          ) : null}
        </div>
        <div style={{ padding: "0 1rem 0.75rem", color: "#8899aa", fontSize: "0.72rem" }}>
          {t("employee.searchShortcutHint")}
        </div>

        {recentScenarios.length > 0 ? (
          <div style={{ padding: "0 0.5rem 0.75rem" }}>
            <div
              style={{
                padding: "0 0.75rem 0.35rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#4fa3ff",
              }}
            >
              {t("employee.recent")}
            </div>
            {recentScenarios.map((s) => (
              <button
                key={`recent-${s.id}`}
                type="button"
                style={{
                  ...styles.catBtn,
                  ...(selectedScenario?.id === s.id ? styles.catBtnActive : {}),
                }}
                onClick={() => openScenario(s)}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                >
                  {s.title}
                </span>
              </button>
            ))}
          </div>
        ) : null}

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
                if (selectedScenario) closeDetail();
                setNavOpen(false);
              }}
            >
              {cat === ALL_FILTER ? t("common.all") : cat}
              <span style={styles.catCount}>
                {cat === ALL_FILTER ? categoryCounts.total : categoryCounts.by[cat] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          style={styles.backBtn}
          onClick={() => {
            navigate(localePath(lng));
          }}
        >
          {t("employee.backHome")}
        </button>
      </nav>
      {narrow && navOpen ? (
        <button
          type="button"
          className="no-print"
          aria-label={t("employee.closeMenu")}
          onClick={() => setNavOpen(false)}
          style={styles.navScrim}
        />
      ) : null}

      <main style={styles.main} id="employee-main">
        {narrow ? (
          <div className="no-print" style={styles.mobileBar}>
            <button type="button" style={styles.menuBtn} onClick={() => setNavOpen(true)}>
              {t("employee.menu")}
            </button>
            <span style={styles.mobileBarTitle}>
              {selectedScenario
                ? selectedScenario.title
                : filterCategory === ALL_FILTER
                  ? t("employee.allScenarios")
                  : filterCategory}
            </span>
          </div>
        ) : null}
        {scenarios === null ? (
          <div style={styles.empty}>{t("employee.loading")}</div>
        ) : scenariosLoadError ? (
          <div style={styles.loadErrorBox}>
            <p style={styles.loadErrorText}>{scenariosLoadError}</p>
            <button type="button" style={styles.primaryBtn} onClick={loadScenariosFromServer}>
              {t("employee.retry")}
            </button>
          </div>
        ) : selectedScenario ? (
          <ScenarioDetail scenario={selectedScenario} onBack={closeDetail} onNotify={notify} />
        ) : (
          <>
            <div style={styles.mainHeader}>
              <h2 style={styles.mainTitle}>
                {filterCategory === ALL_FILTER ? t("employee.allScenarios") : filterCategory}
              </h2>
              <span style={styles.mainCount}>
                {isFiltering
                  ? t("employee.filteredCount", { count: filteredScenarios.length })
                  : t("employee.proceduresCount", { count: filteredScenarios.length })}
              </span>
            </div>
            {filteredScenarios.length === 0 ? (
              <div style={styles.empty}>{emptyMessage()}</div>
            ) : (
              <div style={styles.cardGrid}>
                {filteredScenarios.map((s) => (
                  <ScenarioCard
                    key={s.id}
                    scenario={s}
                    openLabel={t("employee.open")}
                    onSelect={() => openScenario(s)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
