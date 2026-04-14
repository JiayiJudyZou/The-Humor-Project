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
const SLIDE_DURATION_MS = 450;
const UPVOTE_EFFECT_DURATION_MS = 1200;
const DOWNVOTE_EFFECT_DURATION_MS = 1200;
const START_TRANSITION_MS = 560;
const IMAGE_REPEAT_COOLDOWN = 6;

type CelebrationDirection = "up" | "down";
type CelebrationParticle = {
  emoji: string;
  xPercent: number;
  yPercent: number;
  driftX: number;
  driftY: number;
  delayMs: number;
  sizePx: number;
  durationMs: number;
  rotateDeg: number;
  opacity: number;
};
type CelebrationBurst = {
  id: number;
  kind: CelebrationDirection;
  particles: CelebrationParticle[];
};

const UP_PARTICLES = ["😀", "😄", "😊", "💖", "✨", "🌟", "🎀", "🎗️", "🎊", "🍬", "🩷"];
const DOWN_PARTICLES = ["😢", "🥲", "💔", "🌧️", "💧", "☔", "🫧", "🩶"];

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

const isValidCaptionContent = (value: string | null | undefined): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

const shuffleArray = <T,>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const reorderCandidatesWithImageCooldown = (items: CaptionItem[], cooldown: number): CaptionItem[] => {
  if (items.length <= 1 || cooldown <= 0) return items;

  const groupedByImageId = new Map<string, CaptionItem[]>();
  items.forEach((item) => {
    const imageKey = item.image_id ? String(item.image_id) : `__missing_image__${item.id}`;
    const existing = groupedByImageId.get(imageKey);
    if (existing) {
      existing.push(item);
      return;
    }
    groupedByImageId.set(imageKey, [item]);
  });

  groupedByImageId.forEach((groupItems, imageKey) => {
    groupedByImageId.set(imageKey, shuffleArray(groupItems));
  });

  const result: CaptionItem[] = [];
  const recentImageIds: string[] = [];

  while (result.length < items.length) {
    let selectedImageKey: string | null = null;
    let selectedLargestSize = -1;

    for (const [imageKey, groupItems] of groupedByImageId.entries()) {
      if (groupItems.length === 0) continue;
      if (recentImageIds.includes(imageKey)) continue;
      if (groupItems.length > selectedLargestSize) {
        selectedLargestSize = groupItems.length;
        selectedImageKey = imageKey;
      }
    }

    if (!selectedImageKey) {
      for (const [imageKey, groupItems] of groupedByImageId.entries()) {
        if (groupItems.length === 0) continue;
        if (groupItems.length > selectedLargestSize) {
          selectedLargestSize = groupItems.length;
          selectedImageKey = imageKey;
        }
      }
    }

    if (!selectedImageKey) break;

    const selectedQueue = groupedByImageId.get(selectedImageKey);
    if (!selectedQueue || selectedQueue.length === 0) continue;

    const selectedItem = selectedQueue.shift();
    if (!selectedItem) continue;

    result.push(selectedItem);
    recentImageIds.push(selectedImageKey);
    if (recentImageIds.length > cooldown) {
      recentImageIds.shift();
    }
  }

  return result.length === items.length ? result : items;
};

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const randomIntBetween = (min: number, max: number) => Math.floor(randomBetween(min, max + 1));

const createCelebrationBurst = (kind: CelebrationDirection): CelebrationBurst => {
  const count = kind === "up" ? randomIntBetween(90, 130) : randomIntBetween(80, 110);
  const particles: CelebrationParticle[] = Array.from({ length: count }, (_, index) => {
    const emojiPool = kind === "up" ? UP_PARTICLES : DOWN_PARTICLES;
    return {
      emoji: emojiPool[index % emojiPool.length],
      xPercent: randomBetween(2, 98),
      yPercent: kind === "up" ? randomBetween(66, 96) : randomBetween(-4, 22),
      driftX: randomBetween(-180, 180),
      driftY: kind === "up" ? randomBetween(-460, -220) : randomBetween(360, 760),
      delayMs: randomBetween(0, kind === "up" ? 260 : 180),
      sizePx: randomBetween(kind === "up" ? 16 : 14, kind === "up" ? 42 : 32),
      durationMs: randomBetween(kind === "up" ? 760 : 740, kind === "up" ? 1260 : 1180),
      rotateDeg: randomBetween(-30, 30),
      opacity: randomBetween(0.62, 1),
    };
  });

  return {
    id: Date.now() + Math.floor(Math.random() * 10000),
    kind,
    particles,
  };
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
  const [authChecked, setAuthChecked] = useState(false);
  const [captions, setCaptions] = useState<CaptionItem[]>([]);
  const [sessionTotalCount, setSessionTotalCount] = useState(0);
  const [sessionCompletedCount, setSessionCompletedCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrationBursts, setCelebrationBursts] = useState<CelebrationBurst[]>([]);
  const [ratedDrawerOpen, setRatedDrawerOpen] = useState(false);
  const [ratedItems, setRatedItems] = useState<RatedListItem[]>([]);
  const [ratedLoading, setRatedLoading] = useState(false);
  const [ratedError, setRatedError] = useState<string | null>(null);
  const [savedToastVisible, setSavedToastVisible] = useState(false);
  const [slidePhase, setSlidePhase] = useState<"idle" | "out" | "pre-in" | "in">("idle");
  const [startRequested, setStartRequested] = useState(false);
  const [introPhase, setIntroPhase] = useState<"visible" | "exiting" | "hidden">("visible");
  const celebrationTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const slideTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const loggedFailedImageUrlsRef = useRef<Set<string>>(new Set());
  const badCaptionIdsRef = useRef<Set<string>>(new Set());
  const badImageUrlsRef = useRef<Set<string>>(new Set());
  const savedToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (badCaptionIdsRef.current.has(caption.id)) return false;
        if (!isValidCaptionContent(caption.content)) return false;
        if (!isValidImageUrl(caption.image_url)) return false;
        return !badImageUrlsRef.current.has(caption.image_url);
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
    const reorderedCandidates = reorderCandidatesWithImageCooldown(filteredCandidates, IMAGE_REPEAT_COOLDOWN);

    if (process.env.NODE_ENV !== "production") {
      const lastSeenIndexByImage = new Map<string, number>();
      let nearestRepeatGap: number | null = null;

      reorderedCandidates.forEach((candidate, index) => {
        const imageKey = candidate.image_id ? String(candidate.image_id) : `__missing_image__${candidate.id}`;
        const lastSeenIndex = lastSeenIndexByImage.get(imageKey);
        if (lastSeenIndex !== undefined) {
          const gap = index - lastSeenIndex;
          if (nearestRepeatGap === null || gap < nearestRepeatGap) {
            nearestRepeatGap = gap;
          }
        }
        lastSeenIndexByImage.set(imageKey, index);
      });

      console.debug("[vote] queue image spacing", {
        cooldown: IMAGE_REPEAT_COOLDOWN,
        total: reorderedCandidates.length,
        minRepeatGap: nearestRepeatGap,
      });
    }

    setSessionTotalCount(reorderedCandidates.length);
    setSessionCompletedCount(0);
    setCaptions(reorderedCandidates);
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
      try {
        const {
          data: { user: sessionUser },
        } = await supabase.auth.getUser();

        if (!isMounted) return;
        setUser(sessionUser ?? null);
      } catch (userException) {
        if (!isMounted) return;
        console.error("[vote] supabase.auth.getUser threw", userException);
        setUser(null);
      } finally {
        if (!isMounted) return;
        setAuthChecked(true);
      }
    };

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!authChecked || user) return;
    setLoading(false);
    router.replace("/login");
  }, [authChecked, router, user]);

  useEffect(() => {
    if (!authChecked || !user) return;
    void loadQueue();
  }, [authChecked, loadQueue, user]);

  useEffect(() => {
    if (!ratedDrawerOpen || !user) return;
    void loadRatedHistory();
  }, [loadRatedHistory, ratedDrawerOpen, user]);

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
      if (introTimeoutRef.current) {
        clearTimeout(introTimeoutRef.current);
        introTimeoutRef.current = null;
      }
      if (savedToastTimeoutRef.current) {
        clearTimeout(savedToastTimeoutRef.current);
        savedToastTimeoutRef.current = null;
      }
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

  const triggerCelebration = (kind: CelebrationDirection) => {
    const burst = createCelebrationBurst(kind);
    setCelebrationBursts((prev) => [...prev, burst]);

    const timeoutId = setTimeout(() => {
      setCelebrationBursts((prev) => prev.filter((item) => item.id !== burst.id));
      celebrationTimeoutsRef.current = celebrationTimeoutsRef.current.filter((id) => id !== timeoutId);
    }, kind === "up" ? UPVOTE_EFFECT_DURATION_MS : DOWNVOTE_EFFECT_DURATION_MS);

    celebrationTimeoutsRef.current.push(timeoutId);
  };

  const handleVote = async (voteValue: 1 | -1) => {
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!currentCaption || submittingVote) return;

    setSubmittingVote(true);
    setError(null);

    const votingCaption = currentCaption;

    try {
      const nowIso = new Date().toISOString();
      const payload = {
        profile_id: user.id,
        caption_id: votingCaption.id,
        vote_value: voteValue,
        created_by_user_id: user.id,
        modified_by_user_id: user.id,
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

      setSessionCompletedCount((prev) => prev + 1);
      setSavedToastVisible(true);
      if (savedToastTimeoutRef.current) {
        clearTimeout(savedToastTimeoutRef.current);
      }
      savedToastTimeoutRef.current = setTimeout(() => {
        setSavedToastVisible(false);
        savedToastTimeoutRef.current = null;
      }, 900);
      removeCaptionFromQueue(votingCaption.id);
    } catch (upsertException) {
      console.error("[vote] caption_votes.upsert threw", upsertException);
      setError("Could not save your vote. Please try again.");
    } finally {
      setSubmittingVote(false);
    }
  };

  const handleImageLoadError = (captionId: string, url: string | null) => {
    badCaptionIdsRef.current.add(captionId);

    if (url && !loggedFailedImageUrlsRef.current.has(url)) {
      loggedFailedImageUrlsRef.current.add(url);
      console.error("[vote] image failed to load", { url });
    }
    if (isValidImageUrl(url)) {
      badImageUrlsRef.current.add(url);
    }

    removeCaptionFromQueue(captionId);
  };

  const handleVoteWithSlide = (voteValue: 1 | -1) => {
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!currentCaption || submittingVote || slidePhase !== "idle") return;

    const shouldAnimateIn = captions.length > 1;
    triggerCelebration(voteValue === 1 ? "up" : "down");
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

  const startVotingTransition = useCallback(() => {
    if (introPhase !== "visible") return;

    setIntroPhase("exiting");
    if (introTimeoutRef.current) {
      clearTimeout(introTimeoutRef.current);
    }
    introTimeoutRef.current = setTimeout(() => {
      setIntroPhase("hidden");
      introTimeoutRef.current = null;
    }, START_TRANSITION_MS);
  }, [introPhase]);

  const queueReady = authChecked && !loading;

  useEffect(() => {
    if (!startRequested || !queueReady) return;
    startVotingTransition();
  }, [queueReady, startRequested, startVotingTransition]);

  const handleStart = () => {
    setStartRequested(true);
    if (queueReady) {
      startVotingTransition();
    }
  };

  const progressCurrent = sessionTotalCount > 0 ? Math.min(sessionCompletedCount + 1, sessionTotalCount) : 0;
  const progress = `CAPTION ${progressCurrent} / ${sessionTotalCount}`;
  const cardSlideStyle: CSSProperties = {
    transform:
      slidePhase === "out"
        ? "translateX(-104%) rotate(-2.8deg) scale(0.94)"
        : slidePhase === "pre-in"
          ? "translateX(72%) rotate(2deg) scale(0.965)"
          : "translateX(0) rotate(0deg) scale(1)",
    opacity: slidePhase === "out" ? 0.14 : slidePhase === "pre-in" ? 0.18 : 1,
    filter: slidePhase === "out" ? "blur(8px)" : slidePhase === "pre-in" ? "blur(8px)" : "blur(0px)",
    transition:
      slidePhase === "pre-in"
        ? "none"
        : `transform ${SLIDE_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${SLIDE_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), filter ${SLIDE_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
    willChange: "transform, opacity, filter",
  };

  if (!authChecked) {
    return (
      <div className="relative z-0 w-full px-2 pb-10 pt-2 sm:px-4">
        <section className="mx-auto w-full max-w-3xl">
          <div className="mx-auto mt-3 w-full max-w-3xl overflow-hidden rounded-[34px] border border-white/60 bg-white/70 p-6 shadow-[0_24px_74px_rgba(15,23,42,0.22)] backdrop-blur-xl sm:p-7">
            <div className="relative overflow-hidden">
              <div className="skeleton-shimmer pointer-events-none absolute inset-0 opacity-70" />
              <div className="mb-4 h-3 w-36 rounded-full bg-white/65" />
              <div className="overflow-hidden rounded-[22px] border border-white/65">
                <div className="h-72 w-full animate-pulse bg-gradient-to-br from-zinc-200/75 via-white/70 to-zinc-200/70 sm:h-96" />
              </div>
              <div className="mt-5 space-y-3">
                <div className="h-4 w-11/12 rounded-full bg-white/75" />
                <div className="h-4 w-10/12 rounded-full bg-white/65" />
                <div className="h-4 w-8/12 rounded-full bg-white/55" />
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (authChecked && !user) {
    return null;
  }

  return (
    <div className="page-enter relative z-0 w-full px-2 pb-10 pt-2 sm:px-4">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="relative min-h-[660px] sm:min-h-[730px]">
          <div className="page-ambient-glow" />
          <div className="relative mx-auto mt-3 w-full max-w-3xl overflow-hidden rounded-[34px] border border-white/60 bg-white/70 p-6 shadow-[0_24px_74px_rgba(15,23,42,0.22)] backdrop-blur-xl sm:p-7">
            {introPhase !== "hidden" ? (
              <div className={introPhase === "visible" ? "start-content" : "start-content start-content-exit"}>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">Ready to vote</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">Warming up the vibe...</h1>
                <p className="mt-3 text-sm text-zinc-600">Shuffling captions so your next laugh hits right away.</p>
                <div className="start-progress-track mt-6 h-2.5 w-full overflow-hidden rounded-full bg-white/70">
                  <span className="start-progress-shimmer block h-full w-full rounded-full" />
                </div>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={startRequested && !queueReady}
                  className="ui-button mt-7 inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:bg-zinc-500"
                >
                  {startRequested && !queueReady ? "Loading..." : "Start"}
                </button>
                {startRequested && !queueReady ? (
                  <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-zinc-600">
                    <span className="start-spinner inline-block h-3.5 w-3.5 rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                    Syncing your queue...
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">Tap Start when you&apos;re ready.</p>
                )}
              </div>
            ) : loading ? (
              <div className="relative overflow-hidden">
                <div className="skeleton-shimmer pointer-events-none absolute inset-0 opacity-70" />
                <div className="mb-4 h-3 w-36 rounded-full bg-white/65" />
                <div className="overflow-hidden rounded-[22px] border border-white/65">
                  <div className="h-72 w-full animate-pulse bg-gradient-to-br from-zinc-200/75 via-white/70 to-zinc-200/70 sm:h-96" />
                </div>
                <div className="mt-5 space-y-3">
                  <div className="h-4 w-11/12 rounded-full bg-white/75" />
                  <div className="h-4 w-10/12 rounded-full bg-white/65" />
                  <div className="h-4 w-8/12 rounded-full bg-white/55" />
                </div>
                <div className="mt-8 flex items-center justify-center gap-8">
                  <div className="h-[96px] w-[96px] rounded-full bg-white/70 shadow-[0_10px_28px_rgba(24,24,27,0.12)]" />
                  <div className="h-[96px] w-[96px] rounded-full bg-white/65 shadow-[0_10px_28px_rgba(24,24,27,0.12)]" />
                </div>
              </div>
            ) : captions.length === 0 ? (
              <section className="flex flex-col items-center gap-4 py-6 text-center sm:py-8">
                <h1 className="text-2xl font-semibold text-zinc-900">
                  {sessionTotalCount === 0 ? "No captions left" : "You&apos;re all caught up 🎉"}
                </h1>
                <p className="text-sm text-zinc-700">
                  {sessionTotalCount === 0
                    ? "There are no captions available in your queue right now."
                    : "You&apos;ve rated everything currently in your queue."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void loadQueue();
                  }}
                  className="ui-button h-11 rounded-full bg-zinc-900 px-6 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Reload more captions
                </button>
              </section>
            ) : currentCaption ? (
              <div className="relative isolate">
                <div className="mb-5 flex items-center justify-center">
                  <div className="progress-chip rounded-full border border-white/70 bg-white/72 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-700 shadow-[0_10px_24px_rgba(15,23,42,0.14)] backdrop-blur-sm">
                    {progress}
                  </div>
                </div>

                <div className="relative z-10 mx-auto w-full overflow-visible" style={cardSlideStyle}>
                  <img
                    src={currentCaption.image_url as string}
                    alt="Caption image"
                    className="mx-auto h-auto max-h-[42vh] w-full object-contain sm:max-h-[52vh]"
                    onError={() => handleImageLoadError(currentCaption.id, currentCaption.image_url)}
                  />
                  <p className="mx-auto mt-5 max-w-2xl text-left text-base leading-relaxed text-zinc-800 sm:text-[1.07rem]">
                    {currentCaption.content}
                  </p>
                  <div className="mt-8 flex items-center justify-center gap-7 sm:gap-10">
                    <button
                      type="button"
                      onClick={() => handleVoteWithSlide(1)}
                      disabled={submittingVote || slidePhase !== "idle"}
                      aria-label="Upvote"
                      className="vote-reaction upvote ui-button inline-flex h-[112px] w-[112px] items-center justify-center rounded-full border border-emerald-100/90 bg-white/95 text-[2.3rem] shadow-[0_18px_42px_rgba(16,185,129,0.26)] ring-1 ring-emerald-100/90 transition disabled:cursor-not-allowed disabled:opacity-60"
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
                      className="vote-reaction downvote ui-button inline-flex h-[112px] w-[112px] items-center justify-center rounded-full border border-sky-100/90 bg-white/95 text-[2.3rem] shadow-[0_18px_42px_rgba(59,130,246,0.23)] ring-1 ring-sky-100/90 transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="inline-flex items-center justify-center leading-none">😢</span>
                    </button>
                  </div>
                </div>
                {submittingVote ? <div className="mt-3 text-center text-sm text-zinc-600">Saving...</div> : null}
                {savedToastVisible ? (
                  <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-emerald-200/80 bg-white/90 px-4 py-1.5 text-xs font-semibold tracking-[0.06em] text-emerald-700 shadow-[0_10px_28px_rgba(16,185,129,0.18)] backdrop-blur-sm">
                    Saved
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Something went wrong</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}
      </section>

      <div className="pointer-events-none fixed inset-0 z-[70]">
        {celebrationBursts.map((burst) => (
          <div key={burst.id} className="absolute inset-0 overflow-hidden">
            <div className={burst.kind === "up" ? "overlay-wash overlay-wash-up" : "overlay-wash overlay-wash-down"} />
            {burst.particles.map((item, index) => {
              const burstItemStyle = {
                left: `${item.xPercent}%`,
                top: `${item.yPercent}%`,
                animationDelay: `${item.delayMs}ms`,
                ["--drift-x" as const]: `${item.driftX}px`,
                ["--drift-y" as const]: `${item.driftY}px`,
                ["--rotation" as const]: `${item.rotateDeg}deg`,
                fontSize: `${item.sizePx}px`,
                animationDuration: `${item.durationMs}ms`,
                opacity: item.opacity,
              } as CSSProperties;

              return (
                <span
                  key={`${burst.id}-${index}`}
                  className={burst.kind === "up" ? "upvote-celebration-item absolute leading-none" : "downvote-celebration-item absolute leading-none"}
                  style={burstItemStyle}
                >
                  {item.emoji}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRatedDrawerOpen(true)}
        className="ui-button fixed bottom-6 right-6 h-11 rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(24,24,27,0.26)] hover:bg-zinc-800"
      >
        Already rated
      </button>

      {ratedDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close rated drawer"
            className="flex-1 bg-black/35 backdrop-blur-[2px]"
            onClick={() => setRatedDrawerOpen(false)}
          />
          <aside className="drawer-enter h-full w-[min(480px,92vw)] overflow-y-auto border-l border-white/45 bg-white/95 p-5 shadow-2xl backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Already rated</h2>
              <button
                type="button"
                onClick={() => setRatedDrawerOpen(false)}
                className="ui-button h-9 w-9 rounded-full border border-zinc-200 bg-white text-lg text-zinc-700 hover:bg-zinc-100"
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
                  className="ui-card rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"
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
                        <span>{item.vote_value === 1 ? "🩷✨" : "😢"}</span>
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
        .skeleton-shimmer {
          background: linear-gradient(
            120deg,
            rgba(255, 255, 255, 0.08) 5%,
            rgba(255, 255, 255, 0.48) 34%,
            rgba(255, 255, 255, 0.08) 60%
          );
          background-size: 220% 100%;
          animation: shimmer 1300ms linear infinite;
        }

        .vote-reaction:active:not(:disabled) {
          animation: reaction-bounce 300ms ease;
        }

        .page-ambient-glow {
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            radial-gradient(circle at 22% 28%, rgba(255, 214, 231, 0.36), transparent 46%),
            radial-gradient(circle at 76% 22%, rgba(211, 240, 255, 0.3), transparent 44%),
            radial-gradient(circle at 50% 72%, rgba(248, 238, 175, 0.22), transparent 50%);
          filter: blur(26px);
          animation: ambient-breathe 2600ms ease-in-out infinite;
        }

        .start-content {
          text-align: center;
          padding: 18px 8px;
          opacity: 1;
          transform: translateY(0) scale(1);
          transition:
            opacity ${START_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1),
            transform ${START_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .start-content-exit {
          opacity: 0;
          transform: translateY(-16px) scale(0.985);
          pointer-events: none;
        }

        .start-progress-track {
          box-shadow: inset 0 1px 4px rgba(15, 23, 42, 0.08);
        }

        .start-progress-shimmer {
          background: linear-gradient(
            100deg,
            rgba(228, 236, 246, 0.42) 8%,
            rgba(255, 255, 255, 0.95) 34%,
            rgba(221, 233, 248, 0.52) 60%,
            rgba(228, 236, 246, 0.42) 92%
          );
          background-size: 220% 100%;
          animation: shimmer 1100ms linear infinite;
        }

        .start-spinner {
          animation: spin 900ms linear infinite;
        }

        .progress-chip {
          letter-spacing: 0.22em;
        }

        .caption-fade {
          background: linear-gradient(
            180deg,
            rgba(8, 10, 16, 0) 0%,
            rgba(8, 10, 16, 0.24) 44%,
            rgba(8, 10, 16, 0.56) 100%
          );
          backdrop-filter: blur(2px);
        }

        .vote-reaction.upvote:hover:not(:disabled) {
          box-shadow: 0 26px 52px rgba(16, 185, 129, 0.38), 0 0 0 10px rgba(16, 185, 129, 0.14);
          transform: translateY(-3px) scale(1.03);
        }

        .vote-reaction.downvote:hover:not(:disabled) {
          box-shadow: 0 26px 52px rgba(59, 130, 246, 0.3), 0 0 0 10px rgba(59, 130, 246, 0.12);
          transform: translateY(-3px) scale(1.03);
        }

        .overlay-wash {
          position: absolute;
          inset: 0;
          opacity: 0;
          pointer-events: none;
        }

        .overlay-wash-up {
          background:
            radial-gradient(circle at 15% 24%, rgba(255, 211, 236, 0.36), rgba(255, 255, 255, 0) 46%),
            radial-gradient(circle at 82% 18%, rgba(211, 240, 255, 0.28), rgba(255, 255, 255, 0) 48%),
            radial-gradient(circle at 54% 76%, rgba(255, 247, 197, 0.22), rgba(255, 255, 255, 0) 54%);
          animation: overlay-flash 1200ms ease-out forwards;
        }

        .overlay-wash-down {
          background:
            radial-gradient(circle at 40% 14%, rgba(160, 190, 215, 0.3), rgba(255, 255, 255, 0) 44%),
            radial-gradient(circle at 68% 32%, rgba(127, 159, 188, 0.2), rgba(255, 255, 255, 0) 56%);
          animation: overlay-flash 1200ms ease-out forwards;
        }

        .upvote-celebration-item {
          animation-name: upvote-float;
          animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
          animation-fill-mode: forwards;
          transform: translate(-50%, -50%) rotate(var(--rotation)) scale(0.72);
          text-shadow: 0 8px 18px rgba(15, 23, 42, 0.2);
        }

        .downvote-celebration-item {
          animation-name: downvote-drizzle;
          animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
          animation-fill-mode: forwards;
          transform: translate(-50%, -50%) rotate(var(--rotation)) scale(0.8);
          filter: saturate(0.82);
          text-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -40% 0;
          }
        }

        @keyframes reaction-bounce {
          0% {
            transform: scale(1);
          }
          35% {
            transform: scale(0.93);
          }
          68% {
            transform: scale(1.06);
          }
          100% {
            transform: scale(1);
          }
        }

        @keyframes ambient-breathe {
          0%,
          100% {
            opacity: 0.78;
            transform: scale(0.98);
          }
          50% {
            opacity: 1;
            transform: scale(1.03);
          }
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes overlay-flash {
          0% {
            opacity: 0;
          }
          14% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        @keyframes upvote-float {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--rotation)) scale(0.72);
          }
          10% {
            opacity: 1;
          }
          52% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--drift-x)), calc(-50% + var(--drift-y)))
              rotate(calc(var(--rotation) + 26deg))
              scale(1.2);
          }
        }

        @keyframes downvote-drizzle {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--rotation)) scale(0.76);
          }
          18% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + calc(var(--drift-x) * 0.32)), calc(-50% + var(--drift-y)))
              rotate(calc(var(--rotation) - 8deg)) scale(0.95);
          }
        }
      `}</style>
    </div>
  );
}
