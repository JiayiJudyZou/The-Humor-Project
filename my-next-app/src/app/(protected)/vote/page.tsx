"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../../../../lib/supabase/client";

type CaptionRow = {
  id: string;
  content: string | null;
  image_id: string | null;
};

type ImageRow = {
  id: string;
  url: string | null;
};

type VoteRow = {
  caption_id: string;
  vote_value: number;
  created_datetime_utc: string | null;
};

type CaptionItem = {
  id: string;
  content: string | null;
  image_id: string | null;
  image_url: string | null;
};

type RatedListItem = {
  caption_id: string;
  vote_value: 1 | -1;
  created_datetime_utc: string | null;
  content: string | null;
  image_url: string | null;
};

const CAPTION_FETCH_LIMIT = 1000;
const VOTE_HISTORY_LIMIT = 50;
const IN_CHUNK_SIZE = 50;
const SLIDE_DURATION_MS = 380;

const UPVOTE_BURST_ITEMS = [
  { emoji: "🎀", offset: -54, drift: -30, delayMs: 0, bg: "#ffe4f1" },
  { emoji: "😊", offset: -30, drift: -12, delayMs: 60, bg: "#ffeccf" },
  { emoji: "🎗️", offset: -8, drift: -8, delayMs: 110, bg: "#e6f5ff" },
  { emoji: "🙂", offset: 14, drift: 6, delayMs: 35, bg: "#f8e8ff" },
  { emoji: "😄", offset: 36, drift: 18, delayMs: 95, bg: "#e6ffef" },
  { emoji: "🎀", offset: 58, drift: 30, delayMs: 145, bg: "#ffe4f1" },
] as const;

const chunkArray = <T,>(items: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const isValidImageUrl = (value: string | null | undefined): value is string => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.startsWith("http");
};

const formatUtcDateTime = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export default function VotePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [captions, setCaptions] = useState<CaptionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upvoteBursts, setUpvoteBursts] = useState<number[]>([]);
  const [ratedDrawerOpen, setRatedDrawerOpen] = useState(false);
  const [ratedItems, setRatedItems] = useState<RatedListItem[]>([]);
  const [ratedLoading, setRatedLoading] = useState(false);
  const [ratedError, setRatedError] = useState<string | null>(null);
  const [slidePhase, setSlidePhase] = useState<"idle" | "out" | "pre-in" | "in">("idle");
  const celebrationTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const slideTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const loggedFailedImageUrlsRef = useRef<Set<string>>(new Set());

  const currentCaption = captions[currentIndex] ?? null;

  const removeCaptionFromQueue = useCallback((captionId: string) => {
    setCaptions((prev) => {
      const removeIndex = prev.findIndex((caption) => caption.id === captionId);
      if (removeIndex === -1) return prev;

      const next = prev.filter((caption) => caption.id !== captionId);
      setCurrentIndex((prevIndex) => {
        if (next.length === 0) return 0;
        if (prevIndex > removeIndex) return prevIndex - 1;
        if (prevIndex >= next.length) return next.length - 1;
        return prevIndex;
      });
      return next;
    });
  }, []);

  const loadQueue = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const { data: captionRows, error: captionsError } = await supabase
      .from("captions")
      .select("id, content, image_id")
      .limit(CAPTION_FETCH_LIMIT);

    if (captionsError) {
      console.error("[vote] captions.select failed", captionsError);
      setError("Could not load captions right now. Please try again.");
      setCaptions([]);
      setLoading(false);
      return;
    }

    const safeCaptions = (captionRows ?? []) as CaptionRow[];
    const imageIds = Array.from(
      new Set(
        safeCaptions
          .map((caption) => caption.image_id)
          .filter((imageId): imageId is string => imageId !== null && imageId !== undefined)
          .map((imageId) => String(imageId))
      )
    );

    const imageUrlById: Record<string, string | null> = {};
    for (const chunk of chunkArray(imageIds, IN_CHUNK_SIZE)) {
      const { data: imageRows, error: imagesError } = await supabase
        .from("images")
        .select("id, url")
        .in("id", chunk);

      if (imagesError) {
        console.error("[vote] images.select failed", imagesError);
        setError("Could not load images right now. Please try again.");
        setCaptions([]);
        setLoading(false);
        return;
      }

      ((imageRows ?? []) as ImageRow[]).forEach((image) => {
        imageUrlById[String(image.id)] = image.url;
      });
    }

    const candidates: CaptionItem[] = safeCaptions
      .map((caption) => {
        const captionImageId = caption.image_id === null ? null : String(caption.image_id);
        const imageUrl = captionImageId ? (imageUrlById[captionImageId] ?? null) : null;

        return {
          id: caption.id,
          content: caption.content,
          image_id: caption.image_id,
          image_url: imageUrl,
        };
      })
      .filter((caption) => {
        const imageId = caption.image_id === null ? null : String(caption.image_id);
        return imageId !== null && isValidImageUrl(caption.image_url);
      });

    const candidateIds = candidates.map((caption) => caption.id);
    const ratedCaptionIds = new Set<string>();

    for (const chunk of chunkArray(candidateIds, IN_CHUNK_SIZE)) {
      const { data: voteRows, error: votesError } = await supabase
        .from("caption_votes")
        .select("caption_id, vote_value, created_datetime_utc")
        .eq("profile_id", user.id)
        .in("caption_id", chunk);

      if (votesError) {
        console.error("[vote] caption_votes.select failed", votesError);
        setError("Could not load your vote history. Please try again.");
        setCaptions([]);
        setLoading(false);
        return;
      }

      ((voteRows ?? []) as VoteRow[]).forEach((vote) => {
        ratedCaptionIds.add(vote.caption_id);
      });
    }

    const filteredCandidates = candidates.filter((caption) => !ratedCaptionIds.has(caption.id));

    setCaptions(filteredCandidates);
    setCurrentIndex(0);
    setLoading(false);
  }, [supabase, user]);

  const loadRatedHistory = useCallback(async () => {
    if (!user) return;

    setRatedLoading(true);
    setRatedError(null);

    const { data: voteRows, error: votesError } = await supabase
      .from("caption_votes")
      .select("caption_id, vote_value, created_datetime_utc")
      .eq("profile_id", user.id)
      .order("created_datetime_utc", { ascending: false })
      .limit(VOTE_HISTORY_LIMIT);

    if (votesError) {
      console.error("[vote] caption_votes.history failed", votesError);
      setRatedError("Could not load rated captions right now.");
      setRatedItems([]);
      setRatedLoading(false);
      return;
    }

    const safeVotes = ((voteRows ?? []) as VoteRow[]).filter(
      (vote): vote is VoteRow & { vote_value: 1 | -1 } => vote.vote_value === 1 || vote.vote_value === -1
    );

    const captionIds = Array.from(new Set(safeVotes.map((vote) => vote.caption_id)));
    const captionById: Record<string, CaptionRow> = {};

    for (const chunk of chunkArray(captionIds, IN_CHUNK_SIZE)) {
      const { data: captionRows, error: captionsError } = await supabase
        .from("captions")
        .select("id, content, image_id")
        .in("id", chunk);

      if (captionsError) {
        console.error("[vote] captions.byId failed", captionsError);
        setRatedError("Could not load rated captions right now.");
        setRatedItems([]);
        setRatedLoading(false);
        return;
      }

      ((captionRows ?? []) as CaptionRow[]).forEach((caption) => {
        captionById[caption.id] = caption;
      });
    }

    const imageIds = Array.from(
      new Set(
        Object.values(captionById)
          .map((caption) => caption.image_id)
          .filter((imageId): imageId is string => imageId !== null && imageId !== undefined)
          .map((imageId) => String(imageId))
      )
    );

    const imageUrlById: Record<string, string | null> = {};
    for (const chunk of chunkArray(imageIds, IN_CHUNK_SIZE)) {
      const { data: imageRows, error: imagesError } = await supabase
        .from("images")
        .select("id, url")
        .in("id", chunk);

      if (imagesError) {
        console.error("[vote] images.byId failed", imagesError);
        setRatedError("Could not load rated captions right now.");
        setRatedItems([]);
        setRatedLoading(false);
        return;
      }

      ((imageRows ?? []) as ImageRow[]).forEach((image) => {
        imageUrlById[String(image.id)] = image.url;
      });
    }

    const nextItems: RatedListItem[] = safeVotes.map((vote) => {
      const caption = captionById[vote.caption_id];
      const imageId = caption?.image_id ? String(caption.image_id) : null;
      return {
        caption_id: vote.caption_id,
        vote_value: vote.vote_value,
        created_datetime_utc: vote.created_datetime_utc,
        content: caption?.content ?? null,
        image_url: imageId ? (imageUrlById[imageId] ?? null) : null,
      };
    });

    setRatedItems(nextItems);
    setRatedLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const {
        data: { user: sessionUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (userError) {
        console.error("[vote] supabase.auth.getUser failed", userError);
        setError("Could not validate your session. Please refresh or sign in again.");
        setAuthResolved(true);
        setLoading(false);
        return;
      }

      if (!sessionUser) {
        setAuthResolved(true);
        setLoading(false);
        router.replace("/login");
        return;
      }

      setUser(sessionUser);
      setAuthResolved(true);
    };

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!authResolved || !user) return;
    void loadQueue();
  }, [authResolved, loadQueue, user]);

  useEffect(() => {
    if (!ratedDrawerOpen || !user) return;
    void loadRatedHistory();
  }, [loadRatedHistory, ratedDrawerOpen, user]);

  useEffect(() => {
    if (!startRequested || loading) return;
    setHasStarted(true);
  }, [loading, startRequested]);

  useEffect(() => {
    const nextCaption = captions[currentIndex + 1];
    if (!nextCaption) return;
    if (!isValidImageUrl(nextCaption.image_url)) return;

    const img = new Image();
    img.src = nextCaption.image_url;
  }, [captions, currentIndex]);

  useEffect(
    () => () => {
      celebrationTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      celebrationTimeoutsRef.current = [];
      slideTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      slideTimeoutsRef.current = [];
    },
    []
  );

  useEffect(() => {
    if (slidePhase !== "in") return;

    const timeoutId = setTimeout(() => {
      setSlidePhase("idle");
    }, SLIDE_DURATION_MS);

    slideTimeoutsRef.current.push(timeoutId);
    return () => {
      clearTimeout(timeoutId);
      slideTimeoutsRef.current = slideTimeoutsRef.current.filter((id) => id !== timeoutId);
    };
  }, [slidePhase]);

  const triggerUpvoteCelebration = () => {
    const burstId = Date.now() + Math.floor(Math.random() * 1000);
    setUpvoteBursts((prev) => [...prev, burstId]);

    const timeoutId = setTimeout(() => {
      setUpvoteBursts((prev) => prev.filter((id) => id !== burstId));
      celebrationTimeoutsRef.current = celebrationTimeoutsRef.current.filter((id) => id !== timeoutId);
    }, 1200);

    celebrationTimeoutsRef.current.push(timeoutId);
  };

  const handleVote = async (voteValue: 1 | -1) => {
    if (!user || !currentCaption || submittingVote) return;

    setSubmittingVote(true);
    setError(null);

    const votingCaption = currentCaption;

    try {
      const nowIso = new Date().toISOString();
      const payload = {
        profile_id: user.id,
        caption_id: votingCaption.id,
        vote_value: voteValue,
        created_datetime_utc: nowIso,
        modified_datetime_utc: nowIso,
      };

      const { error: upsertError } = await supabase
        .from("caption_votes")
        .upsert(payload, { onConflict: "profile_id,caption_id" });

      if (upsertError) {
        console.error("[vote] caption_votes.upsert failed", upsertError);
        setError("Could not save your vote. Please try again.");
        return;
      }

      setRatedItems((prev) => {
        const next: RatedListItem = {
          caption_id: votingCaption.id,
          vote_value: voteValue,
          created_datetime_utc: nowIso,
          content: votingCaption.content,
          image_url: votingCaption.image_url,
        };
        return [next, ...prev.filter((item) => item.caption_id !== votingCaption.id)].slice(
          0,
          VOTE_HISTORY_LIMIT
        );
      });

      removeCaptionFromQueue(votingCaption.id);
    } catch (upsertException) {
      console.error("[vote] caption_votes.upsert threw", upsertException);
      setError("Could not save your vote. Please try again.");
    } finally {
      setSubmittingVote(false);
    }
  };

  const handleImageLoadError = (captionId: string, url: string | null) => {
    if (url && !loggedFailedImageUrlsRef.current.has(url)) {
      loggedFailedImageUrlsRef.current.add(url);
      console.error("[vote] image failed to load", { url });
    }

    removeCaptionFromQueue(captionId);
  };

  const handleVoteWithSlide = (voteValue: 1 | -1) => {
    if (!user || !currentCaption || submittingVote || slidePhase !== "idle") return;

    const shouldAnimateIn = captions.length > 1;
    setSlidePhase("out");

    const slideOutTimeout = setTimeout(() => {
      slideTimeoutsRef.current = slideTimeoutsRef.current.filter((id) => id !== slideOutTimeout);
      void (async () => {
        await handleVote(voteValue);

        if (!shouldAnimateIn) {
          setSlidePhase("idle");
          return;
        }

        setSlidePhase("pre-in");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setSlidePhase("in");
          });
        });
      })();
    }, SLIDE_DURATION_MS);

    slideTimeoutsRef.current.push(slideOutTimeout);
  };

  const progress = `CAPTION ${Math.min(currentIndex + 1, captions.length)} / ${captions.length}`;
  const cardSlideStyle: CSSProperties = {
    transform:
      slidePhase === "out"
        ? "translateX(-100%)"
        : slidePhase === "pre-in"
          ? "translateX(100%)"
          : "translateX(0)",
    transition: slidePhase === "pre-in" ? "none" : `transform ${SLIDE_DURATION_MS}ms ease`,
    willChange: "transform",
  };

  return (
    <div className="relative z-0 min-h-screen bg-[linear-gradient(135deg,_#dbeafe_0%,_#e0e7ff_42%,_#fbcfe8_100%)] px-6 pb-10 pt-6">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {!hasStarted ? (
          <div className="mt-10 rounded-3xl border border-white/45 bg-white/60 p-8 text-center shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur-md">
            <h1 className="text-3xl font-bold text-zinc-900">Caption Voting</h1>
            <p className="mt-3 text-sm text-zinc-700">Vote each caption with a quick thumbs up or down.</p>
            {!loading ? (
              <p className="mt-2 text-xs text-zinc-500">Captions ready.</p>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">Loading captions...</p>
            )}
            {startRequested && loading ? (
              <div className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-600">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                Loading...
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setStartRequested(true);
                if (!loading) {
                  setHasStarted(true);
                }
              }}
              disabled={startRequested && loading}
              className="mt-6 h-11 rounded-full bg-zinc-900 px-7 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-70"
            >
              {startRequested && loading ? "Loading..." : "Start"}
            </button>
          </div>
        ) : captions.length === 0 ? (
          <section className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 rounded-3xl border border-white/45 bg-white/60 p-8 text-center shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur-md">
            <h1 className="text-2xl font-semibold text-zinc-900">You&apos;re all caught up 🎉</h1>
            <p className="text-sm text-zinc-700">You&apos;ve rated everything currently in your queue.</p>
            <button
              type="button"
              onClick={() => {
                void loadQueue();
              }}
              className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Reload more captions
            </button>
          </section>
        ) : currentCaption ? (
          <div className="relative overflow-hidden rounded-3xl border border-white/45 bg-white/70 p-5 shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur-md">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">{progress}</div>
            <div className="overflow-hidden" style={cardSlideStyle}>
              <div className="overflow-hidden rounded-2xl bg-zinc-100">
                <img
                  src={currentCaption.image_url as string}
                  alt="Caption image"
                  className="h-72 w-full object-cover sm:h-96"
                  onError={() => handleImageLoadError(currentCaption.id, currentCaption.image_url)}
                />
              </div>
              <p className="mt-4 text-base leading-relaxed text-zinc-900">
                {currentCaption.content?.trim() || "No caption content."}
              </p>

              <div className="mt-6 flex justify-center gap-6">
                <button
                  type="button"
                  onClick={() => {
                    triggerUpvoteCelebration();
                    handleVoteWithSlide(1);
                  }}
                  disabled={submittingVote || slidePhase !== "idle"}
                  aria-label="Upvote"
                  className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/95 text-3xl ring-1 ring-zinc-200 transition-transform duration-150 ease-out hover:scale-105 hover:bg-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="inline-flex items-center justify-center leading-none">🩷✨</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleVoteWithSlide(-1);
                  }}
                  disabled={submittingVote || slidePhase !== "idle"}
                  aria-label="Downvote"
                  className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/95 text-3xl ring-1 ring-zinc-200 transition-transform duration-150 ease-out hover:scale-105 hover:bg-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="inline-flex items-center justify-center leading-none">😅</span>
                </button>
              </div>
            </div>
            {submittingVote ? <div className="mt-3 text-center text-sm text-zinc-600">Saving...</div> : null}

            {upvoteBursts.map((burstId) => (
              <div key={burstId} className="pointer-events-none absolute inset-0">
                {UPVOTE_BURST_ITEMS.map((item, index) => {
                  const burstItemStyle = {
                    left: `calc(50% + ${item.offset}px)`,
                    animationDelay: `${item.delayMs}ms`,
                    backgroundColor: item.bg,
                    ["--drift" as const]: `${item.drift}px`,
                  } as CSSProperties;

                  return (
                    <span
                      key={`${burstId}-${index}`}
                      className="upvote-celebration-item absolute bottom-16 inline-flex h-8 w-8 items-center justify-center rounded-full text-base leading-none shadow-[0_6px_15px_rgba(15,23,42,0.12)]"
                      style={burstItemStyle}
                    >
                      {item.emoji}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Something went wrong</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}
      </section>

      <button
        type="button"
        onClick={() => setRatedDrawerOpen(true)}
        className="fixed bottom-6 right-6 h-11 rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white shadow-lg transition hover:bg-zinc-800"
      >
        Already rated
      </button>

      {ratedDrawerOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-20 flex">
          <button
            type="button"
            aria-label="Close rated drawer"
            className="flex-1 bg-black/30"
            onClick={() => setRatedDrawerOpen(false)}
          />
          <aside className="h-full w-[min(480px,92vw)] overflow-y-auto border-l border-white/45 bg-white/95 p-5 shadow-2xl backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Already rated</h2>
              <button
                type="button"
                onClick={() => setRatedDrawerOpen(false)}
                className="h-9 w-9 rounded-full border border-zinc-200 bg-white text-lg text-zinc-700 transition hover:bg-zinc-100"
              >
                ×
              </button>
            </div>

            {ratedLoading ? <p className="text-sm text-zinc-600">Loading rated captions...</p> : null}
            {ratedError ? <p className="text-sm text-red-700">{ratedError}</p> : null}
            {!ratedLoading && !ratedError && ratedItems.length === 0 ? (
              <p className="text-sm text-zinc-600">No ratings yet.</p>
            ) : null}

            <div className="space-y-3">
              {ratedItems.map((item) => (
                <article
                  key={`${item.caption_id}:${item.created_datetime_utc ?? "none"}`}
                  className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex gap-3">
                    <div className="h-16 w-16 overflow-hidden rounded-xl bg-zinc-100">
                      {isValidImageUrl(item.image_url) ? (
                        <img src={item.image_url} alt="Caption thumbnail" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-zinc-500">No image</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-zinc-900">
                        {item.content?.trim() || "No caption content."}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <span>{item.vote_value === 1 ? "🩷✨" : "😅"}</span>
                        {item.created_datetime_utc ? (
                          <span className="text-xs text-zinc-500">{formatUtcDateTime(item.created_datetime_utc)}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      <style jsx>{`
        .upvote-celebration-item {
          animation: upvote-float 1200ms cubic-bezier(0.18, 0.86, 0.3, 1) forwards;
          opacity: 0;
          transform: translate(-50%, 0) scale(0.86);
        }

        @keyframes upvote-float {
          0% {
            opacity: 0;
            transform: translate(-50%, 0) scale(0.86);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--drift)), -190px) scale(1.06);
          }
        }
      `}</style>
    </div>
  );
}
