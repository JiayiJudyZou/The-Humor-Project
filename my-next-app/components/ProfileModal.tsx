"use client";

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
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-profile-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="edit-profile-title" className="text-base font-semibold text-zinc-900">
          Edit profile
        </h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">First name</span>
            <input
              value={firstName}
              onChange={(event) => onFirstNameChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
              autoComplete="given-name"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Last name</span>
            <input
              value={lastName}
              onChange={(event) => onLastNameChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
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
            className="h-9 rounded-full border border-zinc-300 px-4 text-xs font-semibold uppercase tracking-wide text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="h-9 rounded-full bg-zinc-900 px-4 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
