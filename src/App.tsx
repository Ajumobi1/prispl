import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import RequireAuth from "@/components/RequireAuth";

const LoginPage = lazy(() => import("./pages/Login"));
const RegisterPage = lazy(() => import("./pages/Register"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPassword"));
const TaskTrackerPage = lazy(() => import("./pages/TaskTracker"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const AccountAdminPage = lazy(() => import("./pages/AccountAdmin"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center text-muted-foreground">
    Loading...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/task-tracker" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route
                path="/task-tracker"
                element={
                  <RequireAuth>
                    <TaskTrackerPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <DashboardPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/account-admin"
                element={
                  <RequireAuth adminOnly>
                    <AccountAdminPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
