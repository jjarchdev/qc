import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher.jsx";
import { useAppData } from "./AppData.jsx";
import { localePath } from "./utils.js";
import { styles } from "./styles.js";

export default function HomeScreen() {
  const { t } = useTranslation();
  const { lng } = useParams();
  const navigate = useNavigate();
  const { adminSession, loadScenariosFromServer } = useAppData();

  return (
    <div style={styles.homeWrap}>
      <main style={styles.homeInner}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
          <LanguageSwitcher />
        </div>
        <header>
          <div style={styles.homeBadge}>{t("home.badge")}</div>
          <h1 style={styles.homeTitle}>
            {t("home.titleLine1")}
            <br />
            {t("home.titleLine2")}
          </h1>
          <p style={styles.homeSubtitle}>{t("home.subtitle")}</p>
        </header>
        <div style={styles.homeBtns}>
          <button
            type="button"
            style={styles.primaryBtn}
            onClick={() => navigate(localePath(lng, "employee"))}
          >
            <span style={styles.btnIcon}>▶</span> {t("home.employee")}
          </button>
          <button
            type="button"
            style={styles.ghostBtn}
            onClick={() => {
              if (adminSession) {
                loadScenariosFromServer();
                navigate(localePath(lng, "admin"));
              } else {
                navigate(localePath(lng, "admin", "login"));
              }
            }}
          >
            <span style={styles.btnIcon}>⚙</span> {t("home.admin")}
          </button>
        </div>
      </main>
      <div style={styles.homeDeco} aria-hidden />
    </div>
  );
}
