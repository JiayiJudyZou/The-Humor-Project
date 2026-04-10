"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

type NavTab = {
  label: string;
  href: string;
  icon: ReactNode;
};

const tabs: NavTab[] = [
  {
    label: "Crackd",
    href: "/crackd",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M20.5 16l-5.7-5.3L6 19.5" />
      </svg>
    ),
  },
  {
    label: "Vote",
    href: "/vote",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8.2 5.5c1.8 0 3 1.3 3.8 2.7.8-1.4 2-2.7 3.8-2.7A4.2 4.2 0 0 1 20 9.7c0 4.4-6.2 8.3-8 9.3-1.8-1-8-4.9-8-9.3a4.2 4.2 0 0 1 4.2-4.2Z" />
      </svg>
    ),
  },
  {
    label: "Upload",
    href: "/upload",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 15V5" />
        <path d="m8 9 4-4 4 4" />
        <rect x="4" y="15" width="16" height="5" rx="2" />
      </svg>
    ),
  },
];

const STORAGE_KEY = "sidebar:compact";

export default function Sidebar() {
  const pathname = usePathname();
  const [compact, setCompact] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  const toggleCompact = () => {
    setCompact((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <aside
      className={[
        "sticky top-0 z-40 h-screen shrink-0 overflow-y-auto border-r border-white/35 bg-white/45 px-3 py-4 backdrop-blur-xl transition-[width] duration-300",
        compact ? "w-[84px]" : "w-[252px]",
      ].join(" ")}
    >
      <div className="flex h-full flex-col gap-4">
        <div className={compact ? "px-1" : "px-2"}>
          <div className="ui-surface-strong flex items-center justify-between px-3 py-2">
            <div className={["overflow-hidden transition-all duration-300", compact ? "w-0 opacity-0" : "w-auto opacity-100"].join(" ")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Funny</p>
              <p className="text-sm font-bold text-zinc-900">Caption Studio</p>
            </div>
            <button
              type="button"
              onClick={toggleCompact}
              className="ui-button inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white/85 text-zinc-700"
              aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg
                viewBox="0 0 24 24"
                className={["h-4 w-4 transition-transform duration-300", compact ? "rotate-180" : "rotate-0"].join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m15 5-7 7 7 7" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-1">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={[
                  "group relative ui-button flex items-center gap-3 overflow-hidden rounded-2xl border px-3 py-3 text-sm font-semibold transition-all duration-200",
                  isActive
                    ? "border-pink-200 bg-gradient-to-r from-white via-pink-50 to-violet-50 text-zinc-900 shadow-[0_12px_26px_rgba(236,72,153,0.14)]"
                    : "border-transparent text-zinc-700 hover:border-pink-100 hover:bg-white/90 hover:text-zinc-900",
                ].join(" ")}
                title={tab.label}
              >
                <span
                  className={[
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all",
                    isActive
                      ? "border-pink-200 bg-white text-fuchsia-500"
                      : "border-white/0 bg-zinc-100/75 text-zinc-600 group-hover:border-pink-100 group-hover:bg-white group-hover:text-fuchsia-500",
                  ].join(" ")}
                >
                  {tab.icon}
                </span>
                <span
                  className={[
                    "truncate whitespace-nowrap transition-all duration-300",
                    compact ? "w-0 opacity-0" : "w-auto opacity-100",
                  ].join(" ")}
                >
                  {tab.label}
                </span>
                <span
                  className={[
                    "absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-pink-300 to-violet-300 transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  ].join(" ")}
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
