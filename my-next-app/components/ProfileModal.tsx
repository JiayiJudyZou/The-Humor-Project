"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

type ProfileModalProps = {
  open: boolean;
  firstName: string;
  lastName: string;
  saving: boolean;
  error: string | null;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function ProfileModal({
  open,
  firstName,
  lastName,
  saving,
  error,
  onFirstNameChange,
  onLastNameChange,
  onCancel,
  onSave,
}: ProfileModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/40 p-4 sm:p-6"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-profile-title"
    >
      <div
        className="modal-enter ui-surface-strong w-full max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="edit-profile-title" className="text-base font-semibold text-zinc-900">
          Edit profile
        </h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">First name</span>
            <input
              value={firstName}
              onChange={(event) => onFirstNameChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white/85 px-3 text-sm text-zinc-900 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
              autoComplete="given-name"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Last name</span>
            <input
              value={lastName}
              onChange={(event) => onLastNameChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white/85 px-3 text-sm text-zinc-900 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
              autoComplete="family-name"
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="ui-button h-9 rounded-full border border-zinc-300 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="ui-button h-9 rounded-full border border-pink-200 bg-gradient-to-r from-pink-200 via-fuchsia-200 to-violet-200 px-4 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-900 shadow-[0_10px_24px_rgba(236,72,153,0.2)] hover:from-pink-300 hover:via-fuchsia-300 hover:to-violet-300 active:shadow-[0_6px_16px_rgba(236,72,153,0.22)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
