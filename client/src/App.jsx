import { useCallback, useEffect, useState } from "react";
import AuthPage from "./pages/AuthPage";
import CustomerDashboard from "./pages/CustomerDashboard";
import WorkerDashboard from "./pages/WorkerDashboard";
import CooperativeDashboard from "./pages/CooperativeDashboard";
import SystemAdminPage from "./pages/SystemAdminPage";
import { api } from "./lib/api";
import LandingPage from "./pages/LandingPage";


function App() {
  const getSessionForPath = () => {
    try {
      const path = window.location.pathname || "/";
      const key =
        path === "/customer/dashboard" || path.startsWith("/customer/")
          ? "sahayog_customer_session"
          : path === "/worker/dashboard" || path.startsWith("/worker/")
            ? "sahayog_worker_session"
            : path === "/cooperative/dashboard" || path.startsWith("/cooperative/")
              ? "sahayog_cooperative_session"
              : path === "/admin/dashboard" || path.startsWith("/admin/")
                ? "sahayog_system_admin_session"
                : "sahayog_session";

      return JSON.parse(localStorage.getItem(key)) || null;
    } catch {
      return null;
    }
  };

  const [session, setSession] = useState(getSessionForPath);

  // The browser pathname is the single source of truth for the current route.
  const [route, setRoute] = useState(window.location.pathname || "/");

  const navigate = useCallback((path, replace = false) => {
    const currentPath = window.location.pathname || "/";

    if (currentPath === path) {
      setRoute(path);
      return;
    }

    if (replace) {
      window.history.replaceState({}, "", path);
    } else {
      window.history.pushState({}, "", path);
    }

    setRoute(path);
  }, []);

  // Keep React synchronized with browser Back/Forward.
  useEffect(() => {
    const handlePopState = () => {
      setRoute(window.location.pathname || "/");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);


  const handleAuthenticated = (role, user) => {
    const next = { role, user };

    if (role === "customer") {
      localStorage.setItem("sahayog_customer_session", JSON.stringify(next));
      localStorage.removeItem("sahayog_session");
      setSession(next);
      navigate("/customer/dashboard", true);
    } else if (role === "worker") {
      localStorage.setItem("sahayog_worker_session", JSON.stringify(next));
      localStorage.removeItem("sahayog_session");
      setSession(next);
      navigate("/worker/dashboard", true);
    } else if (role === "cooperative") {
      localStorage.setItem("sahayog_cooperative_session", JSON.stringify(next));
      localStorage.removeItem("sahayog_session");
      setSession(next);
      navigate("/cooperative/dashboard", true);
    } else if (role === "system-admin") {
      localStorage.setItem("sahayog_system_admin_session", JSON.stringify(next));
      localStorage.removeItem("sahayog_session");
      setSession(next);
      navigate("/admin/dashboard", true);
    } else {
      localStorage.setItem("sahayog_session", JSON.stringify(next));
      setSession(next);
      navigate("/", true);
    }
  };

  const handleLogout = async () => {
    try {
      const logoutPath = session?.role === "worker"
        ? "/workers/logout"
        : session?.role === "cooperative"
          ? "/cooperative-admin/logout"
          : session?.role === "system-admin"
            ? "/system-admin/logout"
            : "/customers/logout";
      await api(logoutPath, { method: "POST" });
    } catch {}

    if (session?.role === "customer") {
      localStorage.removeItem("sahayog_customer_session");
    } else if (session?.role === "worker") {
      localStorage.removeItem("sahayog_worker_session");
    } else if (session?.role === "cooperative") {
      localStorage.removeItem("sahayog_cooperative_session");
    } else if (session?.role === "system-admin") {
      localStorage.removeItem("sahayog_system_admin_session");
    }
    localStorage.removeItem("sahayog_session");
    setSession(null);
    navigate("/", true);
  };

  const publicRoutes = [
    "/",
    "/auth",
    "/customer/login",
    "/customer/register",
    "/worker/login",
    "/worker/register",
    "/cooperative/login",
    "/cooperative/register",
    "/admin/login",
  ];

  const isDashboardRoute =
    route === "/customer/dashboard" ||
    route === "/worker/dashboard" ||
    route === "/cooperative/dashboard" ||
    route === "/admin/dashboard";

  const isKnownRoute = publicRoutes.includes(route) || isDashboardRoute;

  // Redirect invalid/protected routes before rendering the wrong page.
  // This prevents a dashboard from flashing while the URL still points to `/`.
  useEffect(() => {
    let target = null;

    if (session?.role === "customer") {
      if (route !== "/customer/dashboard") {
        target = "/customer/dashboard";
      }
    } else if (session?.role === "worker") {
      if (route !== "/worker/dashboard") {
        target = "/worker/dashboard";
      }
    } else if (session?.role === "cooperative") {
      if (route !== "/cooperative/dashboard") {
        target = "/cooperative/dashboard";
      }
    } else if (session?.role === "system-admin") {
      if (route !== "/admin/dashboard") {
        target = "/admin/dashboard";
      }
    } else if (route === "/customer/dashboard") {
      target = "/customer/login";
    } else if (route === "/worker/dashboard") {
      target = "/worker/login";
    } else if (route === "/cooperative/dashboard") {
      target = "/cooperative/login";
    } else if (route === "/admin/dashboard") {
      target = "/admin/login";
    } else if (!isKnownRoute) {
      target = "/";
    }

    if (target && target !== route) {
      navigate(target, true);
    }
  }, [session?.role, route, isKnownRoute, navigate]);

  const isRedirecting =
    (session?.role === "customer" && route !== "/customer/dashboard") ||
    (session?.role === "worker" && route !== "/worker/dashboard") ||
    (session?.role === "cooperative" && route !== "/cooperative/dashboard") ||
    (session?.role === "system-admin" && route !== "/admin/dashboard") ||
    (!session &&
      (route === "/customer/dashboard" || route === "/worker/dashboard" || route === "/cooperative/dashboard" || route === "/admin/dashboard")) ||
    (!isKnownRoute);

  if (isRedirecting) {
    return null;
  }

  // Render a protected dashboard only when both the URL and session role match.
  if (route === "/customer/dashboard" && session?.role === "customer") {
    return (
      <CustomerDashboard
        customer={session.user}
        onLogout={handleLogout}
      />
    );
  }

  if (route === "/worker/dashboard" && session?.role === "worker") {
    return (
      <WorkerDashboard
        worker={session.user}
        onLogout={handleLogout}
      />
    );
  }

  if (route === "/cooperative/dashboard" && session?.role === "cooperative") {
    return (
      <CooperativeDashboard
        admin={session.user}
        onLogout={handleLogout}
      />
    );
  }

  if (route === "/admin/dashboard" && session?.role === "system-admin") {
    return (
      <SystemAdminPage
        mode="dashboard"
        onLogout={handleLogout}
      />
    );
  }

  // Public/auth routes. The existing AuthPage UI and backend calls are preserved.
  if (route === "/auth") {
    return (
      <AuthPage
        key={route}
        onAuthenticated={handleAuthenticated}
        onRouteChange={navigate}
        onBackHome={() => navigate("/")}
      />
    );
  }

  if (route === "/customer/login") {
    return (
      <AuthPage
        key={route}
        initialRole="customer"
        initialAuthMode="login"
        onAuthenticated={handleAuthenticated}
        onRouteChange={navigate}
        onBackHome={() => navigate("/")}
      />
    );
  }

  if (route === "/customer/register") {
    return (
      <AuthPage
        key={route}
        initialRole="customer"
        initialAuthMode="register"
        onAuthenticated={handleAuthenticated}
        onRouteChange={navigate}
        onBackHome={() => navigate("/")}
      />
    );
  }

  if (route === "/worker/login") {
    return (
      <AuthPage
        key={route}
        initialRole="worker"
        initialAuthMode="login"
        onAuthenticated={handleAuthenticated}
        onRouteChange={navigate}
        onBackHome={() => navigate("/")}
      />
    );
  }

  if (route === "/worker/register") {
    return (
      <AuthPage
        key={route}
        initialRole="worker"
        initialAuthMode="register"
        onAuthenticated={handleAuthenticated}
        onRouteChange={navigate}
        onBackHome={() => navigate("/")}
      />
    );
  }

  if (route === "/cooperative/login") {
    return (
      <AuthPage
        key={route}
        initialRole="cooperative"
        initialAuthMode="login"
        onAuthenticated={handleAuthenticated}
        onRouteChange={navigate}
        onBackHome={() => navigate("/")}
      />
    );
  }

  if (route === "/cooperative/register") {
    return (
      <AuthPage
        key={route}
        initialRole="cooperative"
        initialAuthMode="register"
        onAuthenticated={handleAuthenticated}
        onRouteChange={navigate}
        onBackHome={() => navigate("/")}
      />
    );
  }

  if (route === "/admin/login") {
    return (
      <SystemAdminPage
        mode="login"
        onAuthenticated={(admin) => handleAuthenticated("system-admin", admin)}
      />
    );
  }

  return (
    <LandingPage
      onGetStarted={() => navigate("/auth")}
      onAdminLogin={() => navigate("/admin/login")}
    />
  );

}

export default App