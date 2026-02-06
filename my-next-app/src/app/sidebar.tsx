"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Hello World", href: "/" },
  { label: "Crackd", href: "/crackd" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-48 flex-col gap-3 border-r border-black/10 bg-white/30 px-6 py-8 backdrop-blur-md">
      <nav className="flex flex-col gap-2">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={[
                "rounded-full px-4 py-2 text-left text-sm font-medium transition",
                isActive
                  ? "bg-white/80 text-zinc-900 shadow-sm"
                  : "text-zinc-700 hover:bg-white/60",
              ].join(" ")}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
