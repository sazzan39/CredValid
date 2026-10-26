import { createBrowserRouter, createHashRouter, Link, Navigate, RouterProvider, useRouteError } from "react-router-dom";
import { PublicLayout } from "@/layouts/PublicLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Landing } from "@/pages/public/Landing";
import { HowItWorks } from "@/pages/public/HowItWorks";
import { VerifyPublic } from "@/pages/public/VerifyPublic";
import { Overview } from "@/pages/dash/Overview";
import { Credentials } from "@/pages/dash/Credentials";
import { Issue } from "@/pages/dash/Issue";
import { CredentialDetail } from "@/pages/dash/CredentialDetail";
import { VerifyDash } from "@/pages/dash/VerifyDash";
import { Issuers } from "@/pages/dash/Issuers";
import { Settings } from "@/pages/dash/Settings";
import { History } from "@/pages/dash/History";
import { Candidates } from "@/pages/dash/Candidates";
import { Analytics } from "@/pages/dash/Analytics";
import { Transactions } from "@/pages/dash/Transactions";
import { Button } from "@/components/ui/button";

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <p className="text-[13px] font-medium text-primary">404</p>
      <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.02em]">We couldn't find that page</h1>
      <Button asChild className="mt-8">
        <Link to="/">Back home</Link>
      </Button>
    </div>
  );
}

function Crash() {
  const err = useRouteError();
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <p className="text-[13px] font-medium text-danger">Error</p>
      <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.02em]">Something went wrong on this page</h1>
      <p className="mt-2 text-muted">{err instanceof Error ? err.message : "Unknown error"}</p>
      <Button asChild className="mt-8">
        <Link to="/">Back home</Link>
      </Button>
    </div>
  );
}

export const routes = [
  {
    element: <PublicLayout />,
    errorElement: <Crash />,
    children: [
      { path: "/", element: <Landing /> },
      { path: "/features", element: <Navigate to="/how-it-works" replace /> },
      { path: "/how-it-works", element: <HowItWorks /> },
      { path: "/verify", element: <VerifyPublic /> },
      { path: "/verify/:id", element: <VerifyPublic /> },
      { path: "/v/:id", element: <VerifyPublic /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  {
    path: "/app",
    element: <DashboardLayout />,
    errorElement: <Crash />,
    children: [
      { index: true, element: <Overview /> },
      { path: "credentials", element: <Credentials /> },
      { path: "credentials/:id", element: <CredentialDetail /> },
      { path: "issue", element: <Issue /> },
      { path: "verify", element: <VerifyDash /> },
      { path: "verify/:id", element: <VerifyDash /> },
      { path: "history", element: <History /> },
      { path: "transactions", element: <Transactions /> },
      { path: "candidates", element: <Candidates /> },
      { path: "analytics", element: <Analytics /> },
      { path: "activity", element: <Navigate to="/app/history" replace /> },
      { path: "issuers", element: <Issuers /> },
      { path: "settings", element: <Settings /> },
    ],
  },
];

// Hash routing for static hosts that can't rewrite deep links to index.html.
const router = import.meta.env.VITE_ROUTER === "hash" ? createHashRouter(routes) : createBrowserRouter(routes);

export function App() {
  return <RouterProvider router={router} />;
}
