export const PIPELINE_API_BASE_URL = "https://api.almostcrackd.ai";

export type PipelineStep = 1 | 2 | 3 | 4;

export type PipelineStepStatus = "idle" | "running" | "success" | "error";

export type PipelineStepUpdate = {
  step: PipelineStep;
  status: PipelineStepStatus;
  message?: string;
};

export type CaptionRecord = Record<string, unknown>;

export type PipelineResult = {
  cdnUrl: string;
  imageId: string;
  captions: CaptionRecord[];
};

export type RunPipelineParams = {
  file: File;
  token: string;
  onStepUpdate?: (update: PipelineStepUpdate) => void;
};

export class PipelineError extends Error {
  step: PipelineStep;
  cdnUrl?: string;
  imageId?: string;

  constructor(
    step: PipelineStep,
    message: string,
    context?: { cdnUrl?: string; imageId?: string }
  ) {
    super(message);
    this.name = "PipelineError";
    this.step = step;
    this.cdnUrl = context?.cdnUrl;
    this.imageId = context?.imageId;
  }
}

type GeneratePresignedResponse = {
  presignedUrl: string;
  cdnUrl: string;
};

type RegisterImageResponse = {
  imageId: string;
};

type GenerateCaptionsOnlyParams = {
  token: string;
  imageId: string;
  onStepUpdate?: (update: PipelineStepUpdate) => void;
};

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();

  try {
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("application/json")) {
      const json = (await response.json()) as {
        message?: unknown;
        error?: unknown;
      };

      if (typeof json.message === "string" && json.message.trim()) {
        return json.message;
      }
      if (typeof json.error === "string" && json.error.trim()) {
        return json.error;
      }
      return fallback;
    }

    const text = await response.text();
    const trimmed = text.trim();
    const looksLikeHtml =
      trimmed.startsWith("<!DOCTYPE html") ||
      trimmed.startsWith("<html") ||
      trimmed.startsWith("<HTML") ||
      /<body[\s>]/i.test(trimmed) ||
      /<\/html>/i.test(trimmed);

    if (looksLikeHtml) {
      return "Gateway timeout from server (504). Please retry.";
    }

    return trimmed || fallback;
  } catch {
    return fallback;
  }
}

async function postJson<T>(
  path: string,
  token: string,
  body: unknown,
  step: PipelineStep
): Promise<T> {
  const response = await fetch(`${PIPELINE_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    console.debug("[pipeline] postJson error", {
      path,
      status: response.status,
      statusText: response.statusText,
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const rawText = await response.clone().text();
        JSON.parse(rawText);
      } catch {
        const responseText = await response.clone().text();
        console.debug(
          "[pipeline] postJson failed to parse JSON error body",
          responseText.slice(0, 500)
        );
      }
    }

    throw new PipelineError(step, message);
  }

  return (await response.json()) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function assertString(value: unknown, label: string, step: PipelineStep): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PipelineError(step, `Invalid ${label} returned by API.`);
  }
  return value;
}

export async function runCaptionPipeline({
  file,
  token,
  onStepUpdate,
}: RunPipelineParams): Promise<PipelineResult> {
  if (!token.trim()) {
    throw new PipelineError(1, "Missing access token. Please sign in again.");
  }

  onStepUpdate?.({ step: 1, status: "running" });
  let presignedUrl = "";
  let cdnUrl = "";
  try {
    const presigned = await postJson<GeneratePresignedResponse>(
      "/pipeline/generate-presigned-url",
      token,
      { contentType: file.type },
      1
    );
    presignedUrl = assertString(presigned.presignedUrl, "presignedUrl", 1);
    cdnUrl = assertString(presigned.cdnUrl, "cdnUrl", 1);
  } catch (error) {
    onStepUpdate?.({
      step: 1,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
  onStepUpdate?.({ step: 1, status: "success" });

  onStepUpdate?.({ step: 2, status: "running" });
  try {
    const uploadResponse = await fetch(presignedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      const message = await readErrorMessage(uploadResponse);
      throw new PipelineError(2, message);
    }
  } catch (error) {
    onStepUpdate?.({
      step: 2,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    });

    if (error instanceof PipelineError) {
      throw error;
    }

    throw new PipelineError(2, error instanceof Error ? error.message : "Upload failed");
  }
  onStepUpdate?.({ step: 2, status: "success" });

  onStepUpdate?.({ step: 3, status: "running" });
  let imageId = "";
  try {
    const registered = await postJson<RegisterImageResponse>(
      "/pipeline/upload-image-from-url",
      token,
      { imageUrl: cdnUrl, isCommonUse: false },
      3
    );
    imageId = assertString(registered.imageId, "imageId", 3);
  } catch (error) {
    onStepUpdate?.({
      step: 3,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
  onStepUpdate?.({ step: 3, status: "success" });

  try {
    const captions = await generateCaptionsOnly({
      token,
      imageId,
      onStepUpdate,
    });

    return {
      cdnUrl,
      imageId,
      captions,
    };
  } catch (error) {
    if (error instanceof PipelineError) {
      error.cdnUrl = error.cdnUrl ?? cdnUrl;
      error.imageId = error.imageId ?? imageId;
      throw error;
    }

    throw new PipelineError(
      4,
      error instanceof Error ? error.message : "Unknown error",
      { cdnUrl, imageId }
    );
  }
}

export async function generateCaptionsOnly({
  token,
  imageId,
  onStepUpdate,
}: GenerateCaptionsOnlyParams): Promise<CaptionRecord[]> {
  if (!token.trim()) {
    throw new PipelineError(4, "Missing access token. Please sign in again.");
  }

  onStepUpdate?.({ step: 4, status: "running" });

  const maxAttempts = 3;
  const retryableStatuses = new Set([429, 502, 503, 504]);
  let lastMessage = "Caption generation failed.";

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch(`${PIPELINE_API_BASE_URL}/pipeline/generate-captions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageId }),
      });

      if (response.ok) {
        const captionsRaw = (await response.json()) as unknown;
        if (!Array.isArray(captionsRaw)) {
          throw new PipelineError(4, "Invalid captions response returned by API.");
        }

        const captions = captionsRaw.filter(
          (item): item is CaptionRecord => typeof item === "object" && item !== null
        );
        onStepUpdate?.({ step: 4, status: "success" });
        return captions;
      }

      const message = await readErrorMessage(response);
      lastMessage = message;
      const shouldRetry = retryableStatuses.has(response.status) && attempt < maxAttempts;

      if (shouldRetry) {
        const nextAttempt = attempt + 1;
        onStepUpdate?.({
          step: 4,
          status: "running",
          message: `Retrying (${nextAttempt}/3)...`,
        });
        await delay(attempt * 800);
        continue;
      }

      throw new PipelineError(4, message);
    }

    throw new PipelineError(4, lastMessage);
  } catch (error) {
    onStepUpdate?.({
      step: 4,
      status: "error",
      message: error instanceof Error ? error.message : lastMessage,
    });

    if (error instanceof PipelineError) {
      throw error;
    }

    throw new PipelineError(4, error instanceof Error ? error.message : lastMessage);
  }
}
