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
  label: string;
  status: PipelineStepStatus;
  message?: string;
};

type CaptionDisplay = {
  id: string;
  text: string;
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
  { step: 1, label: "1. Generate presigned upload URL", status: "idle" },
  { step: 2, label: "2. Upload image bytes", status: "idle" },
  { step: 3, label: "3. Register uploaded image URL", status: "idle" },
  { step: 4, label: "4. Generate captions", status: "idle" },
];

function getCaptionText(record: Record<string, unknown>): string {
  const candidates = [record.caption, record.content, record.text, record.title];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return JSON.stringify(record);
}

function getStatusBadgeClass(status: PipelineStepStatus): string {
  if (status === "success") return "bg-emerald-100 text-emerald-800";
  if (status === "running") return "bg-blue-100 text-blue-800";
  if (status === "error") return "bg-red-100 text-red-800";
  return "bg-zinc-100 text-zinc-700";
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

  useEffect(() => {
    setImagePreviewFailed(false);
  }, [cdnUrl]);

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

  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-col gap-6"
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Upload</h1>
        <p className="text-sm text-zinc-700">
          Upload an image and generate captions through the REST pipeline.
        </p>
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

      <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">Progress</h2>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li
              key={step.step}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-900">{step.label}</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusBadgeClass(step.status)}`}
                >
                  {step.status}
                </span>
              </div>
              {step.message ? <p className="text-xs text-red-700">{step.message}</p> : null}
            </li>
          ))}
        </ol>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

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
    </section>
  );
}
