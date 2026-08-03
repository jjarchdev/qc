import { useEffect } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  Navigate,
  useParams,
  useLocation,
} from "react-router-dom";
import i18n, {
  DEFAULT_LOCALE,
  isSupportedLocale,
  getStoredLocale,
  setStoredLocale,
} from "./i18n/index.js";
import { AppDataProvider } from "./AppData.jsx";
import HomeScreen from "./HomeScreen.jsx";
import EmployeeView from "./EmployeeView.jsx";
import AdminLogin from "./AdminLogin.jsx";
import AdminView from "./AdminView.jsx";
import { styles } from "./styles.js";

function LocaleLayout() {
  const { lng } = useParams();
  const location = useLocation();
  const valid = isSupportedLocale(lng);

  useEffect(() => {
    if (!valid) return;
    if (i18n.language !== lng) void i18n.changeLanguage(lng);
    setStoredLocale(lng);
    document.documentElement.lang = lng;
  }, [lng, valid]);

  if (!valid) {
    const rest = location.pathname.replace(/^\/[^/]+/, "") || "";
    return <Navigate to={`/${DEFAULT_LOCALE}${rest}${location.search}`} replace />;
  }

  return (
    <AppDataProvider>
      <div style={styles.root}>
        <Outlet />
      </div>
    </AppDataProvider>
  );
}

function RootRedirect() {
  return <Navigate to={`/${getStoredLocale()}`} replace />;
}

const router = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  {
    path: "/:lng",
    element: <LocaleLayout />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: "employee", element: <EmployeeView /> },
      { path: "employee/:scenarioId", element: <EmployeeView /> },
      { path: "admin/login", element: <AdminLogin /> },
      { path: "admin", element: <AdminView /> },
    ],
  },
  { path: "*", element: <Navigate to={`/${DEFAULT_LOCALE}`} replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
