import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ServerProvider } from "./context/ServerContext";
import { PiStatusProvider } from "./context/PiStatusContext";
import { useAuth } from "./context/useAuth";
import Layout from "./components/layout/Layout";
import OfflineOverlay from "./components/ui/OfflineOverlay";
import TotpReauthModal from "./components/ui/TotpReauthModal";

// improve initial load time
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Bots = lazy(() => import("./pages/Bots"));
const Containers = lazy(() => import("./pages/Containers"));
const Files = lazy(() => import("./pages/Files"));
const Terminal = lazy(() => import("./pages/Terminal"));
const Network = lazy(() => import("./pages/Network"));
const Audit = lazy(() => import("./pages/Audit"));
const Security = lazy(() => import("./pages/Security"));
const Settings = lazy(() => import("./pages/Settings"));
const AccessDenied = lazy(() => import("./pages/AccessDenied"));
const NotFound = lazy(() => import("./pages/NotFound"));

function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/bots" element={<Bots />} />
            <Route path="/containers" element={<Containers />} />
            <Route path="/files" element={<Files />} />
            <Route path="/terminal" element={<Terminal />} />
            <Route path="/network" element={<Network />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/security" element={<Security />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ServerProvider>
      <PiStatusProvider>
        <AuthProvider>
          <AppRoutes />
          <OfflineOverlay />
          <TotpReauthModal />
        </AuthProvider>
      </PiStatusProvider>
    </ServerProvider>
  );
}
