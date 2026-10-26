import * as React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useMode } from "@/app/AppProvider";
import { Logo } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PublicLayout() {
  const mode = useMode();
  const loc = useLocation();
  React.useEffect(() => {
    window.scrollTo?.(0, 0); // some browsers return a promise; never hand it to React as a cleanup
  }, [loc.pathname]);

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="CredValid home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            {[
              ["/verify", "Verify"],
              ["/how-it-works", "How it works"],
            ].map(([to, label]) => (
              <NavLink
                key={to}
                to={to!}
                className={({ isActive }) => cn("hidden rounded-lg px-3 py-2 text-[14px] font-medium transition-colors sm:block", isActive ? "text-fg" : "text-muted hover:text-fg")}
              >
                {label}
              </NavLink>
            ))}
            <Button asChild size="sm" className="ml-2">
              <Link to="/app">Open dashboard</Link>
            </Button>
          </nav>
        </div>
      </header>
      {mode === "demo" && (
        <div className="border-b border-[#fedf89] bg-warning-soft px-4 py-2 text-center text-[13px] text-warning">
          Demo mode: credentials are signed for real, but recorded in a simulated registry in your browser.
        </div>
      )}
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-[13.5px] text-muted sm:px-6">
          <Logo />
          <div className="flex gap-6">
            <Link to="/verify" className="hover:text-fg">Verify a credential</Link>
            <Link to="/how-it-works" className="hover:text-fg">How it works</Link>
            <Link to="/app" className="hover:text-fg">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
