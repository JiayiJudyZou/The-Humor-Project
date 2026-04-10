"use client";

type ToastProps = {
  show: boolean;
  message: string;
};

export default function Toast({ show, message }: ToastProps) {
  if (!show) return null;

  return (
    <div className="toast-enter pointer-events-none fixed bottom-6 left-1/2 z-[70] -translate-x-1/2">
      <div className="rounded-full border border-emerald-200 bg-emerald-50/95 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-[0_10px_26px_rgba(16,185,129,0.2)] backdrop-blur">
        {message}
      </div>
    </div>
  );
}
