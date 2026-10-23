import React, { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { HonestyStrip } from "./HonestyStrip";
import { ToastContainer } from "../common/Toast";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { useWebSocketStream } from "../../hooks/useWebSocketStream";
import { useSliceStore } from "../../store/useSliceStore";

export const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setCapabilities, setPublicConfig } = useSliceStore();

  // Initialize and maintain WebSocket connection across page changes
  useWebSocketStream();

  // Fetch initial capabilities and config
  useEffect(() => {
    fetch("/api/capabilities")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setCapabilities(data))
      .catch((err) => {
        console.warn("Could not load capabilities:", err);
      });

    fetch("/api/config/public")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setPublicConfig(data))
      .catch((err) => {
        console.warn("Could not load public config:", err);
      });
  }, [setCapabilities, setPublicConfig]);

  // Global Presenter Mode shortcut (key 'p' or 'P')
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing into an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        if (location.pathname === "/present") {
          navigate(-1);
        } else {
          navigate("/present");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, location.pathname]);

  const isPresenterPage = location.pathname === "/present";

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {!isPresenterPage && <Header />}
      
      <main className="flex-1 flex flex-col w-full max-w-[1920px] mx-auto p-3 sm:p-4 lg:p-6 overflow-x-hidden">
        <ErrorBoundary fallbackTitle="Page Error">
          <Outlet />
        </ErrorBoundary>
      </main>

      {!isPresenterPage && <HonestyStrip />}
      <ToastContainer />
    </div>
  );
};
