"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase/client";
import ProfileModal from "./ProfileModal";

type ProfileRecord = {
  first_name: string | null;
  last_name: string | null;
};

export default function AuthHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessageVisible, setSavedMessageVisible] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      setUser(authUser ?? null);
      if (!authUser) return;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!mounted) return;

      if (profileError) {
        console.error("[auth-header] profiles.maybeSingle failed", profileError);
        return;
      }

      const safeProfile = (profile as ProfileRecord | null) ?? null;
      const loadedFirstName = safeProfile?.first_name?.trim() ?? "";
      const loadedLastName = safeProfile?.last_name?.trim() ?? "";

      setFirstName(loadedFirstName);
      setLastName(loadedLastName);
      setEditFirstName(loadedFirstName);
      setEditLastName(loadedLastName);
    };

    void loadUser();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  if (!user) {
    return null;
  }

  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || (user.email?.[0] ?? "U").toUpperCase();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName = fullName || user.email || "";

  const openEditor = () => {
    setEditFirstName(firstName);
    setEditLastName(lastName);
    setSaveError(null);
    setIsModalOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setSaveError(null);
    setIsModalOpen(false);
  };

  const handleSave = async () => {
    if (!user || saving) return;

    const normalizedFirstName = editFirstName.trim();
    const normalizedLastName = editLastName.trim();

    setSaving(true);
    setSaveError(null);

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        created_by_user_id: user.id,
        modified_by_user_id: user.id,
      },
      { onConflict: "id" }
    );

    setSaving(false);

    if (error) {
      console.error("[auth-header] profiles.upsert failed", error);
      setSaveError("Could not save profile. Please try again.");
      return;
    }

    setFirstName(normalizedFirstName);
    setLastName(normalizedLastName);
    setIsModalOpen(false);
    setSavedMessageVisible(true);
    window.setTimeout(() => setSavedMessageVisible(false), 1800);
  };

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={openEditor}
          className="ui-button group inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/95 px-2 py-1.5 pr-3 text-xs font-semibold text-zinc-700 shadow-[0_8px_20px_rgba(59,130,246,0.16)]"
          aria-label="Edit profile"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-pink-400 text-[11px] font-bold text-white">
            {initials}
          </span>
          <span className="max-w-36 truncate text-left sm:max-w-44">{displayName}</span>
        </button>
        {savedMessageVisible ? (
          <span className="toast-enter absolute -bottom-8 right-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
            Saved
          </span>
        ) : null}
      </div>

      <ProfileModal
        open={isModalOpen}
        firstName={editFirstName}
        lastName={editLastName}
        saving={saving}
        error={saveError}
        onFirstNameChange={setEditFirstName}
        onLastNameChange={setEditLastName}
        onCancel={closeEditor}
        onSave={handleSave}
      />
    </>
  );
}
