"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../../../lib/supabase/client";
import {
  PipelineError,
  type PipelineStep,
  type PipelineStepStatus,
  runCaptionPipeline,
} from "../../../../lib/pipeline";

type StepState = {
  step: PipelineStep;
  status: PipelineStepStatus;
  message?: string;
};

type CaptionDisplay = {
  id: string;
  text: string;
};

type UploadHistoryItem = {
  createdAt: string;
  cdnUrl: string;
  imageId: string;
  captions: string[];
};

const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);

const makeInitialSteps = (): StepState[] => [
  { step: 1, status: "idle" },
  { step: 2, status: "idle" },
  { step: 3, status: "idle" },
  { step: 4, status: "idle" },
];

const STEP_LABELS: Record<PipelineStep, string> = {
  1: "presigned URL",
  2: "upload",
  3: "register",
  4: "captions",
};

function getCaptionText(record: Record<string, unknown>): string {
  const candidates = [record.caption, record.content, record.text, record.title];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return JSON.stringify(record);
}

function getHistoryStorageKey(userId: string): string {
  return `uploadHistory:${userId}`;
}

function readHistoryFromStorage(userId: string): UploadHistoryItem[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(getHistoryStorageKey(userId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is UploadHistoryItem =>
          typeof entry === "object" &&
          entry !== null &&
          typeof entry.createdAt === "string" &&
          typeof entry.cdnUrl === "string" &&
          typeof entry.imageId === "string" &&
          Array.isArray(entry.captions) &&
          entry.captions.every((caption) => typeof caption === "string")
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

function getCurrentStep(steps: StepState[]): PipelineStep {
  const runningStep = steps.find((step) => step.status === "running");
  if (runningStep) return runningStep.step;

  const errorStep = steps.find((step) => step.status === "error");
  if (errorStep) return errorStep.step;

  const completedCount = steps.filter((step) => step.status === "success").length;
  if (completedCount === 0) return 1;
  if (completedCount >= 4) return 4;

  return (completedCount + 1) as PipelineStep;
}

function getProgressPercent(steps: StepState[]): number {
  return steps.filter((step) => step.status === "success").length * 25;
}

function getStepSegmentClass(step: StepState): string {
  if (step.status === "success") {
    return "border-emerald-300 bg-emerald-500 text-white";
  }
  if (step.status === "running") {
    return "border-blue-400 bg-blue-100 text-blue-800 ring-2 ring-blue-200";
  }
  if (step.status === "error") {
    return "border-red-300 bg-red-100 text-red-700";
  }

  return "border-zinc-300 bg-zinc-100 text-zinc-500";
}

function formatTimestamp(isoString: string): string {
  const asDate = new Date(isoString);
  if (Number.isNaN(asDate.getTime())) return isoString;
  return asDate.toLocaleString();
}

export default function UploadPage() {
  const supabase = useMemo(() => createClient(), []);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>(makeInitialSteps());
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<CaptionDisplay[]>([]);
  const [cdnUrl, setCdnUrl] = useState<string | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<UploadHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [historyCopyState, setHistoryCopyState] = useState<string | null>(null);
  const [historyImageErrors, setHistoryImageErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setImagePreviewFailed(false);
  }, [cdnUrl]);

  useEffect(() => {
    if (!historyOpen) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [historyOpen]);

  useEffect(() => {
    let mounted = true;

    const loadUserForHistory = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      const nextUserId = user?.id ?? null;
      setUserId(nextUserId);

      if (nextUserId) {
        setHistoryItems(readHistoryFromStorage(nextUserId));
      } else {
        setHistoryItems([]);
      }
    };

    void loadUserForHistory();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const resetRunState = () => {
    setSteps(makeInitialSteps());
    setError(null);
    setCaptions([]);
    setCdnUrl(null);
    setImageId(null);
    setCopiedId(null);
    setImagePreviewFailed(false);
  };

  const handleUploadAndGenerate = async () => {
    if (!file || running) return;

    if (!SUPPORTED_TYPES.has(file.type)) {
      setError(
        `Unsupported file type: ${file.type || "unknown"}. Supported: image/jpeg, image/jpg, image/png, image/webp, image/gif, image/heic`
      );
      return;
    }

    resetRunState();
    setRunning(true);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      setError(`Session error: ${sessionError.message}`);
      setRunning(false);
      return;
    }

    const token = session?.access_token;
    if (!token) {
      setError("No access token found. Please sign in again.");
      setRunning(false);
      return;
    }

    try {
      const result = await runCaptionPipeline({
        file,
        token,
        onStepUpdate: ({ step, status, message }) => {
          setSteps((prev) =>
            prev.map((entry) =>
              entry.step === step ? { ...entry, status, message } : entry
            )
          );
        },
      });

      setCdnUrl(result.cdnUrl);
      setImageId(result.imageId);

      const nextCaptions: CaptionDisplay[] = result.captions.map((record, index) => {
        const raw = record as Record<string, unknown>;
        return {
          id: String(raw.id ?? raw.captionId ?? index),
          text: getCaptionText(raw),
        };
      });
      setCaptions(nextCaptions);

      if (userId) {
        const nextHistoryEntry: UploadHistoryItem = {
          createdAt: new Date().toISOString(),
          cdnUrl: result.cdnUrl,
          imageId: result.imageId,
          captions: nextCaptions.map((caption) => caption.text),
        };

        setHistoryItems((prev) => {
          const nextHistoryItems = [nextHistoryEntry, ...prev].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          window.localStorage.setItem(
            getHistoryStorageKey(userId),
            JSON.stringify(nextHistoryItems)
          );
          return nextHistoryItems;
        });
      }
    } catch (unknownError) {
      if (unknownError instanceof PipelineError) {
        setError(`Step ${unknownError.step} failed: ${unknownError.message}`);
      } else {
        const message = unknownError instanceof Error ? unknownError.message : "Unknown error";
        setError(message);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleCopy = async (captionId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(captionId);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === captionId ? null : prev));
      }, 1400);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Copy failed";
      setError(`Copy failed: ${message}`);
    }
  };

  const toggleHistoryCaptions = (historyId: string) => {
    setExpandedHistory((prev) => ({ ...prev, [historyId]: !prev[historyId] }));
  };

  const handleCopyAllCaptions = async (historyId: string, historyCaptions: string[]) => {
    try {
      await navigator.clipboard.writeText(historyCaptions.join("\n"));
      setHistoryCopyState(historyId);
      window.setTimeout(() => {
        setHistoryCopyState((prev) => (prev === historyId ? null : prev));
      }, 1400);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Copy failed";
      setError(`Copy failed: ${message}`);
    }
  };

  const handleClearHistory = () => {
    if (!userId) return;

    window.localStorage.removeItem(getHistoryStorageKey(userId));
    setHistoryItems([]);
    setExpandedHistory({});
    setHistoryImageErrors({});
  };

  const closeHistory = () => {
    setHistoryOpen(false);
  };

  const currentStep = getCurrentStep(steps);
  const progressPercent = getProgressPercent(steps);
  const stepErrorMessage = steps.find((step) => step.status === "error")?.message ?? error;

  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-col gap-6"
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Upload</h1>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
        >
          History
        </button>
      </div>
      <p className="-mt-4 text-sm text-zinc-700">
        Upload an image and generate captions through the REST pipeline.
      </p>

      <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 text-sm text-zinc-800">
          <p className="font-semibold">
            Step {currentStep}/4
          </p>
          <p className="text-xs font-semibold text-zinc-600">{progressPercent}%</p>
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-2">
          {steps.map((step) => (
            <li
              key={step.step}
              className={`rounded-full border px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide ${getStepSegmentClass(step)}`}
              title={STEP_LABELS[step.step]}
            >
              {step.step}
            </li>
          ))}
        </ol>
        <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-zinc-600">
          {steps.map((step) => (
            <p key={`${step.step}-label`} className="truncate text-center">
              {STEP_LABELS[step.step]}
            </p>
          ))}
        </div>
        {stepErrorMessage ? (
          <p className="mt-2 text-xs text-red-700">{stepErrorMessage}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <label className="flex flex-1 flex-col gap-2 text-sm text-zinc-800">
            Choose image
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
              }}
              className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              disabled={running}
            />
          </label>

          <button
            type="button"
            onClick={handleUploadAndGenerate}
            disabled={!file || running}
            className="h-11 rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-500"
          >
            {running ? "Running..." : "Upload & Generate Captions"}
          </button>
        </div>
        {file ? (
          <p className="mt-3 text-xs text-zinc-600">
            Selected: {file.name} ({file.type || "unknown type"})
          </p>
        ) : null}
      </div>

      {running || cdnUrl || imageId ? (
        <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-zinc-900">Pipeline Result</h2>
          {cdnUrl ? (
            <p className="break-all text-sm text-zinc-700">
              <span className="font-semibold">cdnUrl:</span> {cdnUrl}
            </p>
          ) : null}
          {imageId ? (
            <p className="text-sm text-zinc-700">
              <span className="font-semibold">imageId:</span> {imageId}
            </p>
          ) : null}
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">Uploaded Image</h3>
            {cdnUrl ? (
              imagePreviewFailed ? (
                <p className="text-sm text-amber-700">Image preview failed to load</p>
              ) : (
                <img
                  src={cdnUrl}
                  alt="Uploaded image preview"
                  onError={() => setImagePreviewFailed(true)}
                  className="max-h-[360px] w-full rounded-xl object-contain shadow-sm"
                />
              )
            ) : (
              <div
                className="h-52 w-full animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 shadow-sm"
                aria-label="Uploaded image preview placeholder"
              />
            )}
          </div>
        </div>
      ) : null}

      {captions.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">Captions</h2>
          <ul className="flex flex-col gap-3">
            {captions.map((caption, index) => (
              <li
                key={`${caption.id}-${index}`}
                className="rounded-xl border border-zinc-200 bg-white p-3"
              >
                <p className="mb-2 text-sm text-zinc-900">{caption.text}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">Caption {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(caption.id, caption.text)}
                    className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    {copiedId === caption.id ? "Copied" : "Copy"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close history drawer"
            onClick={closeHistory}
            className="absolute inset-0 z-40 bg-black/30"
          />
          <div
            className="absolute inset-y-0 right-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-zinc-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900">Upload History</h2>
              <button
                type="button"
                onClick={closeHistory}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                Close
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-600">
                {historyItems.length} item{historyItems.length === 1 ? "" : "s"}
              </p>
              <button
                type="button"
                onClick={handleClearHistory}
                disabled={!userId || historyItems.length === 0}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear history
              </button>
            </div>

            {historyItems.length === 0 ? (
              <p className="text-sm text-zinc-600">No uploads saved yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {historyItems.map((item, index) => {
                  const historyId = `${item.imageId}:${item.createdAt}:${index}`;
                  const isExpanded = expandedHistory[historyId] ?? false;
                  const hasCdnUrl = typeof item.cdnUrl === "string" && item.cdnUrl.trim().length > 0;
                  const showImageFallback = historyImageErrors[historyId] ?? false;

                  return (
                    <li key={historyId} className="rounded-xl border border-zinc-200 p-3">
                      {hasCdnUrl ? (
                        showImageFallback ? (
                          <div className="mb-3 flex h-[180px] w-full items-center justify-center rounded-lg bg-zinc-100 px-2 text-xs text-zinc-600">
                            Preview unavailable
                          </div>
                        ) : (
                          <img
                            src={item.cdnUrl}
                            alt="Uploaded preview"
                            onError={() => {
                              setHistoryImageErrors((prev) => ({ ...prev, [historyId]: true }));
                            }}
                            className="mb-3 h-[180px] w-full rounded-lg bg-zinc-100 object-contain"
                          />
                        )
                      ) : (
                        <p className="mb-3 text-xs text-zinc-600">No cdnUrl saved</p>
                      )}
                      <p className="text-xs text-zinc-600">{formatTimestamp(item.createdAt)}</p>
                      <p className="mb-2 break-all text-xs text-zinc-700">
                        <span className="font-semibold">imageId:</span> {item.imageId}
                      </p>

                      <button
                        type="button"
                        onClick={() => toggleHistoryCaptions(historyId)}
                        className="mb-2 rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                      >
                        {isExpanded ? "Hide captions" : "Show captions"}
                      </button>
                      {isExpanded ? (
                        <ol className="mb-2 list-decimal space-y-1 pl-4 text-sm text-zinc-900">
                          {item.captions.map((caption, captionIndex) => (
                            <li key={`${historyId}-caption-${captionIndex}`}>{caption}</li>
                          ))}
                        </ol>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleCopyAllCaptions(historyId, item.captions)}
                        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                      >
                        {historyCopyState === historyId ? "Copied" : "Copy all captions"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
