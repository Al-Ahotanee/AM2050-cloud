/* AM2050 — Field Ledger Modernism: authenticated operations are nationwide by design; account scopes control only the records shown. */
import { Link, useLocation } from "wouter";
import { Bell, LogOut, Menu, RefreshCw, X } from "lucide-react";
import { ReactNode, useState } from "react";
import { LogoMark } from "@/components/brand/LogoMark";
import { WordmarkLogo } from "@/components/brand/WordmarkLogo";
import { canAccessModule, modules, roleLabels } from "@/lib/access";
import { AuthUser } from "@/contexts/AuthContext";
import { OfflineSyncDrawer } from "@/components/offline/OfflineSyncDrawer";

type AppShellProps = {
  children: ReactNode;
  user: AuthUser;
  pendingSync: number;
  onLogout: () => Promise<void>;
  onQueueChange?: () => void;
};

export function AppShell({ children, user, pendingSync, onLogout, onQueueChange }: AppShellProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);
  const accessibleModules = modules.filter((module) => canAccessModule(user.role, module));
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "AM";

  const rail = (
    <aside className="flex h-full w-[17.5rem] shrink-0 flex-col bg-[#123148] text-[#f7f4ec] shadow-[12px_0_36px_rgba(18,49,72,0.12)]">
      <div className="flex h-[4.75rem] items-center justify-between border-b border-white/10 px-5">
        <Link href="/workspace" onClick={closeMobile} className="group flex items-center transition-opacity hover:opacity-95">
          <WordmarkLogo theme="dark" size="sm" variant="horizontal" showTagline={false} />
        </Link>
        <button
          aria-label="Close menu"
          onClick={closeMobile}
          className="grid h-9 w-9 place-items-center rounded-md text-white/80 hover:bg-white/10 lg:hidden"
        >
          <X size={19} />
        </button>
      </div>
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto border-y border-white/10 px-3 py-4">
        <p className="px-2 pb-2 font-mono text-[0.59rem] font-medium uppercase tracking-[0.14em] text-[#9cc8ae]">
          Navigation
        </p>
        <div className="space-y-1">
          {accessibleModules.map((module) => {
            const active =
              location === module.path ||
              (module.path !== "/workspace" && location.startsWith(`${module.path}/`));
            const Icon = module.icon;
            return (
              <Link
                key={module.key}
                href={module.path}
                onClick={closeMobile}
                className={`group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-150 ${
                  active
                    ? "bg-[#167a4c] font-semibold text-white shadow-sm"
                    : "text-[#dce7e1] hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.3 : 1.85} />
                <span>{module.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="border-t border-white/10 px-4 py-3 bg-black/25">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-mono text-[0.62rem] font-medium tracking-wide text-[#9cc8ae]">
              System Online
            </span>
          </div>
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.58rem] font-semibold text-white/70">
            v2.4.0
          </span>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#fbfaf6]">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{rail}</div>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#082236]/45 backdrop-blur-[1px] lg:hidden"
          onClick={closeMobile}
        >
          <div className="h-full" onClick={(event) => event.stopPropagation()}>
            {rail}
          </div>
        </div>
      )}
      <main className="min-h-screen lg:pl-[17.5rem]">
        <header className="sticky top-0 z-30 flex h-[5.15rem] items-center justify-between border-b border-[#d8e0da] bg-[#fbfaf6]/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-md border border-[#d8e0da] bg-white text-[#123148] lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="hidden lg:flex items-center gap-2.5">
              <span className="font-display text-base font-semibold text-[#123148]">
                {modules.find((m) => location === m.path || (m.path !== "/workspace" && location.startsWith(`${m.path}/`)))?.label || "Workspace"}
              </span>
              <span className="text-[#aab9b0]">/</span>
              <span className="rounded-full border border-[#b9dcc3] bg-[#e7f4eb] px-2.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.1em] text-[#167a4c]">
                {roleLabels[user.role]}
              </span>
            </div>
            <div className="lg:hidden">
              <WordmarkLogo theme="light" size="xs" variant="horizontal" showSubtitle={false} />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setSyncDrawerOpen(true)}
              title="Open Offline Field Sync Center"
              className={`action-press inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition sm:px-3 sm:py-1.5 ${
                pendingSync > 0
                  ? "border-[#ead3a3] bg-[#fbf2df] text-[#815813] hover:bg-[#faeed3]"
                  : "border-[#b9dcc3] bg-[#e7f4eb] text-[#0e5a38] hover:bg-[#d8edd6]"
              }`}
            >
              <span className={`status-dot ${pendingSync > 0 ? "bg-[#c88b25]" : "bg-[#167a4c]"}`} />
              <span className="font-mono">{pendingSync}</span>
              <span className="hidden xs:inline sm:inline">pending sync</span>
            </button>
            <span
              aria-label="Notifications are available through the compliance and follow-up registers"
              className="grid h-10 w-10 place-items-center rounded-md border border-[#d8e0da] bg-white text-[#38566a]"
            >
              <Bell size={18} />
            </span>
            <div className="flex items-center gap-2 rounded-md border border-[#d8e0da] bg-white px-2 py-1.5 shadow-sm">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#123148] font-display text-xs font-semibold text-white">
                {initials}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-28 truncate text-xs font-semibold text-[#123148]">{user.name}</span>
                <span className="block font-mono text-[0.57rem] uppercase tracking-[0.08em] text-[#69808e]">
                  {roleLabels[user.role]}
                </span>
              </span>
              <button
                aria-label="Sign out"
                onClick={() => void onLogout()}
                className="grid h-7 w-7 place-items-center text-[#69808e] hover:text-[#ae3f32]"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>
        {children}
      </main>
      <OfflineSyncDrawer
        isOpen={syncDrawerOpen}
        onClose={() => setSyncDrawerOpen(false)}
        onQueueUpdated={onQueueChange}
      />
    </div>
  );
}
