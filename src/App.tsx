import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import { UbicacionesProvider } from "./contexts/UbicacionesContext";

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <SidebarProvider>
          <UbicacionesProvider>
            <BrowserRouter basename={__BASE_PATH__}>
              <AppRoutes />
            </BrowserRouter>
          </UbicacionesProvider>
        </SidebarProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;