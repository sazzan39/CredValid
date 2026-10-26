import * as React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FilePlus2,
  Files,
  Globe,
  History,
  LayoutGrid,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { Address } from "viem";
import { setMode, useDemoState, useMode, useRegistry, useWallet } from "@/app/AppProvider";
import { setActingIssuer } from "@/demo/store";
import { extractCredentialId } from "@/crypto/ids";
import { testnet } from "@/lib/config";
import { readJSON, writeJSON } from "@/lib/storage";
import { cn, shortAddr } from "@/lib/utils";
import {
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownSeparator,
  DropdownTrigger,
  Tip,
} from "@/components/ui/misc";
import { Logo } from "./primitives";
import { WalletConnectButton } from "./wallet";

export const NAV_GROUPS = [
  {
    title: "Workspace",
    items: [
      { to: "/app", label: "Overview", icon: LayoutGrid, end: true },
      { to: "/app/credentials", label: "Credentials", icon: Files },
      { to: "/app/issue", label: "Issue Credential", icon: FilePlus2 },
      { to: "/app/verify", label: "Verify Credential", icon: ShieldCheck },
      { to: "/app/history", label: "Verification History", icon: History },
    ],
  },
  {
    title: "Management",
    items: [
      { to: "/app/issuers", label: "Issuers", icon: Building2 },
      { to: "/app/candidates", label: "Candidates", icon: Users },
      { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  { title: "Preferences", items: [{ to: "/app/settings", label: "Settings", icon: Settings }] },
] as const;

function NetworkStatus({ collapsed }: { collapsed: boolean }) {
  const mode = useMode();
  const w = useWallet();
  const label = mode === "demo" ? "Demo Mode" : !testnet.ok ? "Testnet not set up" : w.status === "connected" ? "Connected to Testnet" : "Testnet · wallet off";
  const sub = mode === "demo" ? "Simulated registry" : testnet.ok ? testnet.config.chain.name : "Add a contract address";
  const dot = mode === "demo" ? "bg-warning" : testnet.ok && w.status === "connected" ? "bg-success" : "bg-faint";
  const body = (
    <Link to="/app/settings" className={cn("flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 transition hover:border-line-strong", collapsed && "justify-center px-0")}>
      <span className="relative flex size-2 shrink-0">
        {mode === "demo" || w.status === "connected" ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-40", dot)} /> : null}
        <span className={cn("relative inline-flex size-2 rounded-full", dot)} />
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{label}</span>
          <span className="block truncate text-[12px] text-muted">{sub}</span>
        </span>
      )}
    </Link>
  );
  return collapsed ? <Tip content={label} side="right">{body}</Tip> : body;
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-6">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          {!collapsed ? <div className="section-label mb-1.5 px-3">{g.title}</div> : <div className="mx-auto mb-2 h-px w-6 bg-line" />}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const link = (
                <NavLink
                  to={i.to}
                  end={"end" in i ? i.end : false}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      isActive ? "bg-primary-soft text-fg [&_svg]:text-primary" : "text-muted hover:bg-subtle hover:text-fg [&_svg]:text-faint hover:[&_svg]:text-muted",
                    )
                  }
                  aria-label={collapsed ? i.label : undefined}
                >
                  <i.icon className="size-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{i.label}</span>}
                </NavLink>
              );
              return <li key={i.to}>{collapsed ? <Tip content={i.label} side="right">{link}</Tip> : link}</li>;
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const COLLAPSE_KEY = "credvalid:sidebar-collapsed";

export function useSidebar() {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => readJSON<boolean>(COLLAPSE_KEY) ?? false);
  React.useEffect(() => writeJSON(COLLAPSE_KEY, collapsed), [collapsed]);
  return { collapsed, toggle: () => setCollapsed((c) => !c) };
}

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-[var(--ease-out-soft)] lg:flex",
        collapsed ? "w-[68px]" : "w-[240px]",
      )}
    >
      <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-5")}>
        <Link to="/app" aria-label="CredValid overview">
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <div className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-3" : "px-3")}>
        <NavList collapsed={collapsed} />
      </div>
      <div className="space-y-2 border-t border-line p-3">
        <NetworkStatus collapsed={collapsed} />
        <button
          onClick={onToggle}
          className={cn("flex h-8 w-full items-center gap-2 rounded-lg px-3 text-[13px] text-muted transition hover:bg-subtle hover:text-fg", collapsed && "justify-center px-0")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="absolute inset-0 bg-[#101828]/40 fade-in" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-surface shadow-[var(--shadow-pop)]" style={{ animation: "fade-in .2s var(--ease-out-soft) both" }}>
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <button onClick={onClose} className="rounded-md p-2 text-muted hover:bg-subtle" aria-label="Close navigation">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList collapsed={false} onNavigate={onClose} />
        </div>
        <div className="border-t border-line p-3">
          <NetworkStatus collapsed={false} />
        </div>
      </div>
    </div>
  );
}

const CRUMB: Record<string, [string, string]> = {
  "": ["Workspace", "Overview"],
  credentials: ["Workspace", "Credentials"],
  issue: ["Workspace", "Issue Credential"],
  verify: ["Workspace", "Verify Credential"],
  history: ["Workspace", "Verification History"],
  transactions: ["Workspace", "Transactions"],
  issuers: ["Management", "Issuers"],
  candidates: ["Management", "Candidates"],
  analytics: ["Management", "Analytics"],
  settings: ["Preferences", "Settings"],
};

function Breadcrumbs() {
  const { pathname } = useLocation();
  const registry = useRegistry();
  useDemoState(); // re-render when demo documents change
  const parts = pathname.replace(/^\/app\/?/, "").split("/").filter(Boolean);
  const [group, page] = CRUMB[parts[0] ?? ""] ?? ["Workspace", "Overview"];
  const crumbs: { label: string; to?: string }[] = [{ label: group }, { label: page, to: parts.length > 1 ? `/app/${parts[0]}` : undefined }];
  if (parts[0] === "credentials" && parts[1]) {
    const id = extractCredentialId(parts[1]);
    const name = id ? registry?.getDocument(id)?.payload.subject.name : null;
    crumbs.push({ label: name ?? (id ? `${id.slice(0, 10)}…` : "Credential") });
  }
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
      <ol className="flex items-center gap-1.5 text-[13.5px]">
        {crumbs.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden />}
            {c.to ? (
              <Link to={c.to} className="truncate text-muted hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span className={cn("truncate", i === crumbs.length - 1 ? "font-medium text-fg" : "text-muted")} aria-current={i === crumbs.length - 1 ? "page" : undefined}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TopSearch() {
  const nav = useNavigate();
  const [q, setQ] = React.useState("");
  return (
    <form
      role="search"
      className="relative hidden w-full max-w-[280px] sm:block"
      onSubmit={(e) => {
        e.preventDefault();
        const id = extractCredentialId(q);
        nav(id ? `/app/credentials/${id}` : `/app/credentials${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
        setQ("");
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search credentials"
        aria-label="Search credentials"
        className="h-9 w-full rounded-lg border border-line bg-bg pl-9 pr-3 text-[13.5px] placeholder:text-faint focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/12"
      />
    </form>
  );
}

function NetworkPill() {
  const mode = useMode();
  if (mode === "demo")
    return (
      <span className="hidden items-center gap-1.5 whitespace-nowrap rounded-full bg-warning-soft px-2.5 py-1 text-[12.5px] font-medium text-warning sm:inline-flex">
        <span className="size-1.5 rounded-full bg-warning" /> Demo mode
      </span>
    );
  return (
    <span className="hidden items-center gap-1.5 whitespace-nowrap rounded-full bg-primary-soft px-2.5 py-1 text-[12.5px] font-medium text-primary sm:inline-flex">
      <Globe className="size-3.5" /> {testnet.ok ? testnet.config.chain.name : "Testnet"}
    </span>
  );
}

function UserMenu() {
  const mode = useMode();
  const demo = useDemoState();
  const w = useWallet();
  const nav = useNavigate();
  const acting = demo.issuers.find((i) => i.address === demo.actingIssuer);
  const name = mode === "demo" ? (acting?.name ?? "Issuer") : w.account ? shortAddr(w.account) : "Guest";
  const initials = mode === "demo" ? name.split(" ").filter((p) => /^[A-Z]/.test(p)).map((p) => p[0]).slice(0, 2).join("") : "0x";
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-subtle" aria-label="Account menu">
          <span className="grid size-8 place-items-center rounded-full bg-[#e0e7ff] text-[12.5px] font-semibold text-[#2c3fab]">{initials || "CV"}</span>
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-64">
        <div className="px-2.5 py-2">
          <p className="truncate text-[13.5px] font-medium">{name}</p>
          <p className="text-[12.5px] text-muted">{mode === "demo" ? "Acting as this issuer (demo)" : w.account ? "Connected wallet" : "No wallet connected"}</p>
        </div>
        {mode === "demo" && (
          <>
            <DropdownSeparator />
            <DropdownLabel>Act as issuer</DropdownLabel>
            <DropdownRadioGroup value={demo.actingIssuer} onValueChange={(v) => setActingIssuer(v as Address)}>
              {demo.issuers.map((i) => (
                <DropdownRadioItem key={i.address} value={i.address}>
                  <span className="truncate">{i.name}</span>
                  {i.status === "suspended" && <span className="ml-auto text-[11.5px] text-warning">Suspended</span>}
                </DropdownRadioItem>
              ))}
            </DropdownRadioGroup>
          </>
        )}
        <DropdownSeparator />
        <DropdownItem onSelect={() => nav("/app/settings")}>
          <Settings /> Settings
        </DropdownItem>
        <DropdownItem onSelect={() => nav("/verify")}>
          <ShieldCheck /> Public verification page
        </DropdownItem>
        <DropdownItem onSelect={() => setMode(mode === "demo" ? "testnet" : "demo")}>
          <Globe /> Switch to {mode === "demo" ? "testnet" : "demo"} mode
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenu} className="-ml-1 rounded-md p-2 text-muted hover:bg-subtle lg:hidden" aria-label="Open navigation">
        <Menu className="size-5" />
      </button>
      <Link to="/app" className="lg:hidden" aria-label="CredValid overview">
        <Logo collapsed />
      </Link>
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <TopSearch />
        <NetworkPill />
        <WalletConnectButton />
        <UserMenu />
      </div>
    </header>
  );
}
