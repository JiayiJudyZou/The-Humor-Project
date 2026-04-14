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
  contentType: string;
  token: string;
  onStepUpdate?: (update: PipelineStepUpdate) => void;
};

export type NormalizeImageFileResult = {
  file: File;
  contentType: string;
  width?: number;
  height?: number;
  processedWidth?: number;
  processedHeight?: number;
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

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);

const PREPROCESS_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

function normalizeContentType(rawType: string): string | null {
  const trimmed = rawType.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "image/jpg") return "image/jpeg";
  if (SUPPORTED_IMAGE_TYPES.has(trimmed)) return trimmed;
  return null;
}

function getContentTypeFromFileName(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0 || lastDot === fileName.length - 1) return null;
  const extension = fileName.slice(lastDot + 1).trim().toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? null;
}

export function normalizeImageContentType(file: Pick<File, "type" | "name">): string | null {
  return normalizeContentType(file.type) ?? getContentTypeFromFileName(file.name);
}

function loadImageElement(file: File): Promise<{ image: HTMLImageElement; cleanup: () => void }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    image.onload = () => {
      resolve({ image, cleanup });
    };

    image.onerror = () => {
      cleanup();
      reject(new Error("Unable to decode image in browser."));
    };

    image.src = objectUrl;
  });
}

async function maybeReadImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const loaded = await loadImageElement(file);
    const width = loaded.image.naturalWidth || undefined;
    const height = loaded.image.naturalHeight || undefined;
    loaded.cleanup();
    return { width, height };
  } catch {
    return {};
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  outputType: "image/jpeg" | "image/png"
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to convert canvas to blob."));
          return;
        }
        resolve(blob);
      },
      outputType,
      outputType === "image/jpeg" ? 0.92 : undefined
    );
  });
}

export async function normalizeImageFileForUpload(file: File): Promise<NormalizeImageFileResult> {
  const contentType = normalizeImageContentType(file);
  if (!contentType) {
    throw new Error(
      `Unsupported file type: ${file.type || "unknown"}. Supported: image/jpeg, image/jpg, image/png, image/webp, image/gif, image/heic`
    );
  }

  if (typeof window === "undefined") {
    return { file, contentType };
  }

  if (!PREPROCESS_IMAGE_TYPES.has(contentType)) {
    const dimensions = await maybeReadImageDimensions(file);
    return {
      file,
      contentType,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  let loadedImage: { image: HTMLImageElement; cleanup: () => void } | null = null;
  try {
    loadedImage = await loadImageElement(file);
  } catch {
    return { file, contentType };
  }

  const width = loadedImage.image.naturalWidth || undefined;
  const height = loadedImage.image.naturalHeight || undefined;

  if (!width || !height) {
    loadedImage.cleanup();
    return { file, contentType };
  }

  const shorterSide = Math.min(width, height);
  if (shorterSide >= 512) {
    loadedImage.cleanup();
    return { file, contentType, width, height };
  }

  const scale = 512 / shorterSide;
  const processedWidth = Math.max(1, Math.round(width * scale));
  const processedHeight = Math.max(1, Math.round(height * scale));
  const outputType: "image/jpeg" | "image/png" =
    contentType === "image/jpeg" ? "image/jpeg" : "image/png";

  const canvas = document.createElement("canvas");
  canvas.width = processedWidth;
  canvas.height = processedHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    loadedImage.cleanup();
    return { file, contentType, width, height };
  }

  context.drawImage(loadedImage.image, 0, 0, processedWidth, processedHeight);

  try {
    const processedBlob = await canvasToBlob(canvas, outputType);
    const processedFile = new File([processedBlob], file.name, {
      type: outputType,
      lastModified: file.lastModified,
    });
    return {
      file: processedFile,
      contentType: outputType,
      width,
      height,
      processedWidth,
      processedHeight,
    };
  } catch {
    return { file, contentType, width, height };
  } finally {
    loadedImage.cleanup();
  }
}

export async function runCaptionPipeline({
  file,
  contentType,
  token,
  onStepUpdate,
}: RunPipelineParams): Promise<PipelineResult> {
  if (!token.trim()) {
    throw new PipelineError(1, "Missing access token. Please sign in again.");
  }
  if (!contentType.trim()) {
    throw new PipelineError(1, "Missing file content type.");
  }

  onStepUpdate?.({ step: 1, status: "running" });
  let presignedUrl = "";
  let cdnUrl = "";
  try {
    const presigned = await postJson<GeneratePresignedResponse>(
      "/pipeline/generate-presigned-url",
      token,
      { contentType },
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
        "Content-Type": contentType,
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
