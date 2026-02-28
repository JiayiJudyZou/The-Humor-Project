"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../../lib/supabase/client";

export default function LoginClient() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlError = searchParams.get("error");
  const displayError = error ?? (urlError ? `Sign-in error: ${urlError}` : null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    if (data?.url) window.location.assign(data.url);

    if (!data?.url) {
      setError("Unable to start Google sign-in. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#dbeafe_0%,_#e0e7ff_42%,_#fbcfe8_100%)]">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-10 pb-36 text-center">
        <div className="floating-card w-full max-w-xl rounded-2xl border border-white/45 bg-white/45 p-10 shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur-md">
          <h1 className="text-3xl font-extrabold text-zinc-900 sm:text-4xl">
            Funny Captions!
          </h1>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-full border border-zinc-900/10 bg-white/85 px-6 text-base font-semibold text-zinc-900 shadow-[0_10px_25px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:transform-none disabled:opacity-70"
          >
            {loading ? "Connecting..." : "Continue with Google"}
          </button>
          {displayError ? (
            <p className="mt-4 text-sm text-red-600">{displayError}</p>
          ) : null}
        </div>
      </div>
      <div className="sticker-strip">
        <div className="sticker-row">
          <img
            src="/stickers/cat.svg"
            alt="Cartoon cat sticker"
            className="sticker sticker-1"
          />
          <img
            src="/stickers/dog.svg"
            alt="Cartoon dog sticker"
            className="sticker sticker-2"
          />
          <img
            src="/stickers/bunny.svg"
            alt="Cartoon bunny sticker"
            className="sticker sticker-3"
          />
          <img
            src="/stickers/bear.svg"
            alt="Cartoon bear sticker"
            className="sticker sticker-4"
          />
          <img
            src="/stickers/fox.svg"
            alt="Cartoon fox sticker"
            className="sticker sticker-5"
          />
          <img
            src="/stickers/panda.svg"
            alt="Cartoon panda sticker"
            className="sticker sticker-6"
          />
          <img
            src="/stickers/duck.svg"
            alt="Cartoon duck sticker"
            className="sticker sticker-7"
          />
        </div>
      </div>
      <style jsx>{`
        .floating-card {
          animation: gentle-float 4s ease-in-out infinite;
        }

        @keyframes gentle-float {
          0%,
          100% {
            transform: translateY(0) rotate(-0.6deg) scale(1);
          }
          50% {
            transform: translateY(-16px) rotate(0.6deg) scale(1.01);
          }
        }

        .sticker-strip {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 14px 16px 18px;
          display: flex;
          justify-content: center;
          background: rgba(255, 255, 255, 0.55);
          backdrop-filter: blur(12px);
          box-shadow: 0 -12px 24px rgba(15, 23, 42, 0.08);
        }

        .sticker-row {
          width: min(820px, 100%);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .sticker {
          width: 52px;
          height: 52px;
          animation: sticker-bounce 3.4s ease-in-out infinite;
        }

        @keyframes sticker-bounce {
          0%,
          100% {
            transform: translateY(0) rotate(-1deg);
          }
          50% {
            transform: translateY(-6px) rotate(1deg);
          }
        }

        .sticker-1 {
          animation-delay: 0s;
        }
        .sticker-2 {
          animation-delay: 0.3s;
        }
        .sticker-3 {
          animation-delay: 0.6s;
        }
        .sticker-4 {
          animation-delay: 0.9s;
        }
        .sticker-5 {
          animation-delay: 1.2s;
        }
        .sticker-6 {
          animation-delay: 1.5s;
        }
        .sticker-7 {
          animation-delay: 1.8s;
        }

        @media (max-width: 640px) {
          .sticker {
            width: 42px;
            height: 42px;
          }
          .sticker-row {
            gap: 6px;
          }
        }
      `}</style>
    </div>
  );
}
