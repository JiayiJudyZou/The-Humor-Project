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

  constructor(step: PipelineStep, message: string) {
    super(message);
    this.name = "PipelineError";
    this.step = step;
  }
}

type GeneratePresignedResponse = {
  presignedUrl: string;
  cdnUrl: string;
};

type RegisterImageResponse = {
  imageId: string;
};

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();

  try {
    const contentType = response.headers.get("content-type") ?? "";
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
    return text.trim() || fallback;
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
    throw new PipelineError(step, message);
  }

  return (await response.json()) as T;
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

  onStepUpdate?.({ step: 4, status: "running" });
  let captions: CaptionRecord[] = [];
  try {
    const captionsRaw = await postJson<unknown>(
      "/pipeline/generate-captions",
      token,
      { imageId },
      4
    );
    if (Array.isArray(captionsRaw)) {
      captions = captionsRaw.filter(
        (item): item is CaptionRecord =>
          typeof item === "object" && item !== null
      );
    } else {
      throw new PipelineError(4, "Invalid captions response returned by API.");
    }
  } catch (error) {
    onStepUpdate?.({
      step: 4,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
  onStepUpdate?.({ step: 4, status: "success" });

  return {
    cdnUrl,
    imageId,
    captions,
  };
}
