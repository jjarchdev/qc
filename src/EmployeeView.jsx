import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import { useAppData } from "./AppData.jsx";
import { ALL_FILTER, accentForCategory, buildCategoryCounts, localePath } from "./utils.js";
import { useIsNarrow } from "./useIsNarrow.js";
import { styles } from "./styles.js";

function ScenarioCard({ scenario, onSelect, openLabel }) {
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
      <div style={styles.cardArrow}>{openLabel}</div>
    </div>
  );
}

function ScenarioDetail({ scenario, onBack }) {
  const { t } = useTranslation();
  const steps = scenario.solution.split("\n").filter((line) => line.trim());

  return (
    <article style={styles.detail} aria-labelledby="scenario-detail-title">
      <button type="button" style={styles.detailBack} onClick={onBack}>
        {t("employee.backAll")}
      </button>
      <div style={styles.detailCat}>{scenario.category}</div>
      <h2 id="scenario-detail-title" style={styles.detailTitle}>
        {scenario.title}
      </h2>
      <div style={styles.detailSection}>
        <div style={styles.detailSectionLabel}>{t("employee.situation")}</div>
        <p style={styles.detailBody}>{scenario.scenario}</p>
      </div>
      <div style={styles.detailSection}>
        <div style={styles.detailSectionLabel}>{t("employee.procedure")}</div>
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

export default function EmployeeView() {
  const { t } = useTranslation();
  const { lng } = useParams();
  const navigate = useNavigate();
  const { scenarios, scenariosLoadError, loadScenariosFromServer, categories } = useAppData();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState(ALL_FILTER);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const narrow = useIsNarrow();
  const [navOpen, setNavOpen] = useState(false);

  const scenarioList = scenarios ?? [];
  const categoryCounts = useMemo(() => buildCategoryCounts(scenarioList), [scenarioList]);
  const categoryLabels = useMemo(() => (categories || []).map((c) => c.label), [categories]);
  const allCategories = useMemo(() => [ALL_FILTER, ...categoryLabels], [categoryLabels]);

  const filteredScenarios = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scenarioList.filter((s) => {
      const matchesSearch =
        q.length === 0 ||
        s.title.toLowerCase().includes(q) ||
        s.scenario.toLowerCase().includes(q) ||
        s.tags.some((tag) => tag.toLowerCase().includes(q));
      const matchesCat = filterCategory === ALL_FILTER || s.category === filterCategory;
      return matchesSearch && matchesCat;
    });
  }, [scenarioList, searchQuery, filterCategory]);

  useEffect(() => {
    if (!narrow) setNavOpen(false);
  }, [narrow]);

  useEffect(() => {
    if (scenarios == null) return;
    setSelectedScenario((prev) => (prev && (scenarios.find((s) => s.id === prev.id) ?? null)) || null);
  }, [scenarios]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && navOpen) setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

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
        <input
          style={styles.searchInput}
          placeholder={t("employee.searchPlaceholder")}
          aria-label={t("employee.searchAria")}
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
          aria-label={t("employee.closeMenu")}
          onClick={() => setNavOpen(false)}
          style={styles.navScrim}
        />
      ) : null}

      <main style={styles.main} id="employee-main">
        {narrow ? (
          <div style={styles.mobileBar}>
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
          <ScenarioDetail scenario={selectedScenario} onBack={() => setSelectedScenario(null)} />
        ) : (
          <>
            <div style={styles.mainHeader}>
              <h2 style={styles.mainTitle}>
                {filterCategory === ALL_FILTER ? t("employee.allScenarios") : filterCategory}
              </h2>
              <span style={styles.mainCount}>
                {t("employee.proceduresCount", { count: filteredScenarios.length })}
              </span>
            </div>
            {filteredScenarios.length === 0 ? (
              <div style={styles.empty}>
                {filterCategory === ALL_FILTER && !searchQuery.trim()
                  ? t("employee.emptyPublished")
                  : t("employee.emptyMatches")}
              </div>
            ) : (
              <div style={styles.cardGrid}>
                {filteredScenarios.map((s) => (
                  <ScenarioCard
                    key={s.id}
                    scenario={s}
                    openLabel={t("employee.open")}
                    onSelect={() => setSelectedScenario(s)}
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
