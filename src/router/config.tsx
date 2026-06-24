import type { RouteObject } from "react-router-dom";
import { RequireAuth, RequireAdmin } from "../components/RequireAuth";
import { MainLayout } from "../components/feature/MainLayout";
import NotFound from "../pages/NotFound";
import LoginPage from "../pages/login/page";
import CatalogoPage from "../pages/catalogo/page";
import CobrosPage from "../pages/cobros-cofersa/page";
import CuentasAjustadasPage from "../pages/cuentas-ajustadas/page";
import ActivacionPage from "../pages/activacion-cuentas/page";
import ConfiguracionPage from "../pages/configuracion/page";
import PresupuestosPage from "../pages/presupuestos/page";
import FactoresPage from "../pages/factores/page";
import HistorialCambiosPage from "../pages/historial-cambios/page";
import AsientosExtracontablesPage from "../pages/asientos-extracontables/page";

const routes: RouteObject[] = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { path: "/", element: <CatalogoPage /> },
      { path: "/catalogo", element: <CatalogoPage /> },
      { path: "/cobros-cofersa", element: <CobrosPage /> },
      { path: "/cuentas-ajustadas", element: <CuentasAjustadasPage /> },
      { path: "/activacion-cuentas", element: <ActivacionPage /> },
      { path: "/configuracion", element: <RequireAdmin><ConfiguracionPage /></RequireAdmin> },
      { path: "/presupuestos", element: <PresupuestosPage /> },
      { path: "/factores", element: <FactoresPage /> },
      { path: "/historial-cambios", element: <HistorialCambiosPage /> },
      { path: "/asientos-extracontables", element: <AsientosExtracontablesPage /> },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;