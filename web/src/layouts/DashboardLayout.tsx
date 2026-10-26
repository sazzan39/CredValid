import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar, MobileDrawer, Topbar, useSidebar } from "@/components/app/shell";
import { WrongNetworkBanner } from "@/components/app/wallet";

export function DashboardLayout() {
  const { collapsed, toggle } = useSidebar();
  const [drawer, setDrawer] = React.useState(false);
  const { pathname } = useLocation();
  React.useEffect(() => {
    setDrawer(false);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh">
      <AppSidebar collapsed={collapsed} onToggle={toggle} />
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setDrawer(true)} />
        <WrongNetworkBanner />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 focus:outline-none sm:px-6 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
