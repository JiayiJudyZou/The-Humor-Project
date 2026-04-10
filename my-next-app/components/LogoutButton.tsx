"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase/client";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    console.log("Supabase signOut executed");

    if (typeof document !== "undefined") {
      document.cookie
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => {
          const name = entry.split("=")[0];
          if (name?.startsWith("sb-")) {
            document.cookie = `${name}=; Max-Age=0; Path=/`;
          }
        });
    }
    window.location.href = "/login";
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="ui-button h-10 rounded-full border border-zinc-200 bg-white/95 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-700 shadow-[0_8px_20px_rgba(15,23,42,0.1)] hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading ? "Signing out" : "Logout"}
    </button>
  );
}
