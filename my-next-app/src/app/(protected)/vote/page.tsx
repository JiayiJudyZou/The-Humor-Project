"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

type CurrentCaptionVoteRow = {
  vote_value: number;
  created_datetime_utc: string | null;
};

type CaptionItem = {
  id: string;
  content: string | null;
  image_id: string | null;
  image_url: string | null;
  has_image_row: boolean;
};

const UPVOTE_BURST_ITEMS = [
  { emoji: "🎀", offset: -54, drift: -30, delayMs: 0, bg: "#ffe4f1" },
  { emoji: "😊", offset: -30, drift: -12, delayMs: 60, bg: "#ffeccf" },
  { emoji: "🎗️", offset: -8, drift: -8, delayMs: 110, bg: "#e6f5ff" },
  { emoji: "🙂", offset: 14, drift: 6, delayMs: 35, bg: "#f8e8ff" },
  { emoji: "😄", offset: 36, drift: 18, delayMs: 95, bg: "#e6ffef" },
  { emoji: "🎀", offset: 58, drift: 30, delayMs: 145, bg: "#ffe4f1" },
] as const;

export default function VotePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [captions, setCaptions] = useState<CaptionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [votesByCaptionId, setVotesByCaptionId] = useState<Record<string, 1 | -1>>({});
  const [createdAtByCaption, setCreatedAtByCaption] = useState<Record<string, string>>({});
  const loadedVoteCaptionIdsRef = useRef<Set<string>>(new Set());
  const preloadingVoteCaptionIdsRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upvoteBursts, setUpvoteBursts] = useState<number[]>([]);
  const celebrationTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const loggedFailedImageUrlsRef = useRef<Set<string>>(new Set());
  const [failedImageCaptionIds, setFailedImageCaptionIds] = useState<Record<string, true>>({});

  const currentCaption = captions[currentIndex] ?? null;
  const currentVote = currentCaption ? (votesByCaptionId[currentCaption.id] ?? null) : null;

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

    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const { data: captionRows, error: captionsError } = await supabase
        .from("captions")
        .select("id, content, image_id")
        .limit(1000);

      if (!isMounted) return;

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

      let imageUrlById: Record<string, string | null> = {};
      const imageRowIds = new Set<string>();
      if (imageIds.length > 0) {
        const { data: imageRows, error: imagesError } = await supabase
          .from("images")
          .select("id, url")
          .in("id", imageIds);

        if (!isMounted) return;

        if (imagesError) {
          console.error("[vote] images.select failed", imagesError);
          setError("Some images could not be loaded. You can still vote on captions.");
        } else {
          imageUrlById = ((imageRows ?? []) as ImageRow[]).reduce<Record<string, string | null>>(
            (acc, image) => {
              const imageId = String(image.id);
              imageRowIds.add(imageId);
              acc[imageId] = image.url;
              return acc;
            },
            {}
          );
        }
      }

      const captionItems: CaptionItem[] = safeCaptions.map((caption) => {
        const captionImageId = caption.image_id === null ? null : String(caption.image_id);

        return {
          id: caption.id,
          content: caption.content,
          image_id: caption.image_id,
          image_url: captionImageId ? (imageUrlById[captionImageId] ?? null) : null,
          has_image_row: captionImageId ? imageRowIds.has(captionImageId) : false,
        };
      });

      setCaptions(captionItems);
      setVotesByCaptionId({});
      setCreatedAtByCaption({});
      setFailedImageCaptionIds({});
      loggedFailedImageUrlsRef.current.clear();
      loadedVoteCaptionIdsRef.current.clear();
      preloadingVoteCaptionIdsRef.current.clear();

      setLoading(false);
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [authResolved, supabase, user]);

  useEffect(() => {
    if (!user || !currentCaption) return;
    if (loadedVoteCaptionIdsRef.current.has(currentCaption.id)) return;

    let isMounted = true;

    const loadCurrentVote = async () => {
      const { data: voteRow, error: voteError } = await supabase
        .from("caption_votes")
        .select("vote_value, created_datetime_utc")
        .eq("profile_id", user.id)
        .eq("caption_id", currentCaption.id)
        .maybeSingle();

      if (!isMounted) return;

      if (voteError) {
        console.error("[vote] caption_votes.maybeSingle failed", voteError);
        return;
      }

      loadedVoteCaptionIdsRef.current.add(currentCaption.id);

      const safeVote = voteRow as CurrentCaptionVoteRow | null;
      if (safeVote?.vote_value === 1 || safeVote?.vote_value === -1) {
        setVotesByCaptionId((prev) => ({ ...prev, [currentCaption.id]: safeVote.vote_value }));
      }
      if (safeVote?.created_datetime_utc) {
        setCreatedAtByCaption((prev) => ({
          ...prev,
          [currentCaption.id]: safeVote.created_datetime_utc as string,
        }));
      }
    };

    void loadCurrentVote();

    return () => {
      isMounted = false;
    };
  }, [currentCaption, supabase, user]);

  useEffect(() => {
    if (!user || captions.length === 0) return;

    const upcomingCaptionIds = captions
      .slice(currentIndex + 1, currentIndex + 21)
      .map((caption) => caption.id)
      .filter(
        (captionId) =>
          !loadedVoteCaptionIdsRef.current.has(captionId) &&
          !preloadingVoteCaptionIdsRef.current.has(captionId)
      );

    if (upcomingCaptionIds.length === 0) return;

    let isMounted = true;

    const preloadUpcomingVotes = async () => {
      const chunkSize = 20;

      for (let startIndex = 0; startIndex < upcomingCaptionIds.length; startIndex += chunkSize) {
        const chunk = upcomingCaptionIds.slice(startIndex, startIndex + chunkSize);
        chunk.forEach((captionId) => preloadingVoteCaptionIdsRef.current.add(captionId));

        const { data: voteRows, error: voteError } = await supabase
          .from("caption_votes")
          .select("caption_id, vote_value, created_datetime_utc")
          .eq("profile_id", user.id)
          .in("caption_id", chunk);

        chunk.forEach((captionId) => preloadingVoteCaptionIdsRef.current.delete(captionId));

        if (!isMounted) return;

        if (voteError) {
          console.error("[vote] caption_votes.preload failed", voteError);
          continue;
        }

        const nextVotes: Record<string, 1 | -1> = {};
        const nextCreatedAtByCaption: Record<string, string> = {};

        ((voteRows ?? []) as VoteRow[]).forEach((vote) => {
          if (vote.vote_value === 1 || vote.vote_value === -1) {
            nextVotes[vote.caption_id] = vote.vote_value;
          }
          if (vote.created_datetime_utc) {
            nextCreatedAtByCaption[vote.caption_id] = vote.created_datetime_utc;
          }
        });

        if (Object.keys(nextVotes).length > 0) {
          setVotesByCaptionId((prev) => ({ ...prev, ...nextVotes }));
        }
        if (Object.keys(nextCreatedAtByCaption).length > 0) {
          setCreatedAtByCaption((prev) => ({ ...prev, ...nextCreatedAtByCaption }));
        }

        chunk.forEach((captionId) => loadedVoteCaptionIdsRef.current.add(captionId));
      }
    };

    void preloadUpcomingVotes();

    return () => {
      isMounted = false;
    };
  }, [captions, currentIndex, supabase, user]);

  useEffect(() => {
    const nextCaption = captions[currentIndex + 1];
    if (!nextCaption) return;
    const nextUrl = nextCaption.image_url;
    if (!nextUrl) return;

    const img = new Image();
    img.src = nextUrl;
  }, [captions, currentIndex]);

  useEffect(
    () => () => {
      celebrationTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      celebrationTimeoutsRef.current = [];
    },
    []
  );

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

    try {
      const nowIso = new Date().toISOString();
      let createdAt = createdAtByCaption[currentCaption.id] ?? null;

      if (!createdAt) {
        const { data: existingVote, error: existingVoteError } = await supabase
          .from("caption_votes")
          .select("created_datetime_utc")
          .eq("profile_id", user.id)
          .eq("caption_id", currentCaption.id)
          .maybeSingle();

        if (existingVoteError) {
          console.error("[vote] caption_votes.maybeSingle failed", existingVoteError);
        }

        createdAt = existingVote?.created_datetime_utc ?? nowIso;
      }

      const payload = {
        profile_id: user.id,
        caption_id: currentCaption.id,
        vote_value: voteValue,
        created_datetime_utc: createdAt,
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

      setVotesByCaptionId((prev) => ({ ...prev, [currentCaption.id]: voteValue }));
      loadedVoteCaptionIdsRef.current.add(currentCaption.id);
      setCreatedAtByCaption((prev) => ({ ...prev, [currentCaption.id]: createdAt ?? nowIso }));
      setCurrentIndex((prev) => prev + 1);
    } catch (upsertException) {
      console.error("[vote] caption_votes.upsert threw", upsertException);
      setError("Could not save your vote. Please try again.");
    } finally {
      setSubmittingVote(false);
    }
  };

  const handleImageLoadError = (captionId: string, url: string | null) => {
    setFailedImageCaptionIds((prev) => {
      if (prev[captionId]) return prev;
      return { ...prev, [captionId]: true };
    });

    if (url && !loggedFailedImageUrlsRef.current.has(url)) {
      loggedFailedImageUrlsRef.current.add(url);
      console.error("[vote] image failed to load", { url });
    }
  };

  if (loading) {
    return <div className="text-sm text-zinc-700">Loading vote queue...</div>;
  }

  if (error && captions.length === 0) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">Unable to load Vote right now</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  if (captions.length === 0) {
    return <div className="text-sm text-zinc-700">No captions available to vote on.</div>;
  }

  if (!currentCaption) {
    return (
      <div className="min-h-screen bg-[linear-gradient(135deg,_#dbeafe_0%,_#e0e7ff_42%,_#fbcfe8_100%)] px-6 py-10">
        <section className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 rounded-3xl border border-white/45 bg-white/60 p-8 text-center shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur-md">
          <h1 className="text-2xl font-semibold text-zinc-900">All caught up</h1>
          <p className="text-sm text-zinc-700">
            You&apos;ve voted through every available caption.
          </p>
          <button
            type="button"
            onClick={() => {
              setCurrentIndex(0);
              setStarted(false);
            }}
            className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Start over
          </button>
        </section>
      </div>
    );
  }

  const imageUrl = currentCaption.image_url;
  const currentImageId = currentCaption.image_id === null ? null : String(currentCaption.image_id);
  const currentImageFailed = Boolean(failedImageCaptionIds[currentCaption.id]);
  const imageFallbackMessage =
    currentImageId === null
      ? "Missing image_id"
      : !currentCaption.has_image_row
        ? "No image row for this image_id"
        : currentImageFailed
          ? "Image failed to load"
          : "Image unavailable";
  const progress = `CAPTION ${Math.min(currentIndex + 1, captions.length)} / ${captions.length}`;

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#dbeafe_0%,_#e0e7ff_42%,_#fbcfe8_100%)] px-6 py-10">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {!started ? (
          <div className="mt-10 rounded-3xl border border-white/45 bg-white/60 p-8 text-center shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur-md">
            <h1 className="text-3xl font-bold text-zinc-900">Caption Voting</h1>
            <p className="mt-3 text-sm text-zinc-700">Vote each caption with a quick thumbs up or down.</p>
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="mt-6 h-11 rounded-full bg-zinc-900 px-7 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Start
            </button>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border border-white/45 bg-white/70 p-5 shadow-[0_20px_45px_rgba(15,23,42,0.18)] backdrop-blur-md">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
              {progress}
            </div>
            <div className="overflow-hidden rounded-2xl bg-zinc-100">
              {imageUrl && !currentImageFailed ? (
                <img
                  src={imageUrl}
                  alt="Caption image"
                  className="h-72 w-full object-cover sm:h-96"
                  onError={() => handleImageLoadError(currentCaption.id, imageUrl)}
                />
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-zinc-600 sm:h-96">
                  {imageFallbackMessage}
                </div>
              )}
            </div>
            <p className="mt-4 text-base leading-relaxed text-zinc-900">
              {currentCaption.content?.trim() || "No caption content."}
            </p>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  triggerUpvoteCelebration();
                  void handleVote(1);
                }}
                disabled={submittingVote}
                aria-label="Upvote"
                className={`h-12 min-w-16 rounded-full px-3 text-2xl transition-transform duration-150 ease-out hover:scale-[1.03] active:scale-[0.97] ${
                  currentVote === 1
                    ? "bg-emerald-100 ring-1 ring-emerald-300"
                    : "bg-white/95 ring-1 ring-zinc-200 hover:bg-white"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-1 text-[1.5rem] leading-none shadow-sm">
                  🩷✨
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleVote(-1);
                }}
                disabled={submittingVote}
                aria-label="Downvote"
                className={`h-12 min-w-16 rounded-full px-3 text-2xl transition-transform duration-150 ease-out hover:scale-[1.03] active:scale-[0.97] ${
                  currentVote === -1
                    ? "bg-rose-100 ring-1 ring-rose-300"
                    : "bg-white/95 ring-1 ring-zinc-200 hover:bg-white"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="inline-flex items-center rounded-full bg-white/70 px-2.5 py-1 text-[1.5rem] leading-none shadow-sm">
                  😅
                </span>
              </button>
              {submittingVote ? <span className="text-sm text-zinc-600">Saving...</span> : null}
            </div>
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
        )}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Something went wrong</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}
      </section>
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
