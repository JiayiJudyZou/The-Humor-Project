"use client";

import { useState } from "react";
import { Pacifico } from "next/font/google";

const pacifico = Pacifico({
  subsets: ["latin"],
  weight: "400",
});

const tabs = ["Hello World", "Jokes"];

export default function Home() {
  const [activeTab, setActiveTab] = useState(tabs[0]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#bfe9ff] to-[#ffcdf3]">
      <div className="relative flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-48 flex-col gap-3 border-r border-black/10 bg-white/30 px-6 py-8 backdrop-blur-md">
          <nav className="flex flex-col gap-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "rounded-full px-4 py-2 text-left text-sm font-medium transition",
                    isActive
                      ? "bg-white/80 text-zinc-900 shadow-sm"
                      : "text-zinc-700 hover:bg-white/60",
                  ].join(" ")}
                >
                  {tab}
                </button>
              );
            })}
          </nav>
        </aside>

        <header className="pointer-events-none absolute right-8 top-6 text-sm font-semibold tracking-wide text-zinc-800">
          Judy&apos;s Humor Project
        </header>

        <main className="flex flex-1 items-center justify-center px-6">
          {activeTab === "Hello World" ? (
            <h1
              className={`${pacifico.className} text-6xl text-zinc-900`}
              aria-live="polite"
            >
              Hello World
            </h1>
          ) : null}
        </main>
      </div>
    </div>
  );
}
