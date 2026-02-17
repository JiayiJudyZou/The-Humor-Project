import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let hasLoggedSupabaseConfigWarning = false;

const PREVIOUS_SUPABASE_PROJECT_REF = "qihsgnfjqmkjmoowyfbn";

function decodeBase64Url(base64Url: string): string | null {
  if (typeof atob !== "function") return null;

  const normalized = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  try {
    return atob(padded);
  } catch {
    return null;
  }
}

function extractProjectRefFromAnonKey(anonKey: string): string | null {
  const parts = anonKey.split(".");
  if (parts.length < 2) return null;

  const decodedPayload = decodeBase64Url(parts[1]);
  if (!decodedPayload) return null;

  try {
    const payload = JSON.parse(decodedPayload) as { ref?: unknown };
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

function warnIfSupabaseConfigLooksMismatched() {
  if (process.env.NODE_ENV === "production" || hasLoggedSupabaseConfigWarning) {
    return;
  }

  hasLoggedSupabaseConfigWarning = true;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return;

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anonKey?.startsWith("sb_publishable_") || anonKey?.startsWith("eyJ")) {
    return;
  }
  if (anonKey) return;

  console.error(
    "[Supabase config mismatch] NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or empty. Update NEXT_PUBLIC_SUPABASE_ANON_KEY from Supabase Dashboard > Project Settings > API > anon public.",
    { supabaseUrl, anonKeyHint: "<missing>" }
  );
}

function parseDocumentCookies(): Array<{ name: string; value: string }> {
  if (typeof document === "undefined" || !document.cookie) {
    return [];
  }

  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      const name =
        separatorIndex === -1 ? entry : entry.slice(0, separatorIndex);
      const value = separatorIndex === -1 ? "" : entry.slice(separatorIndex + 1);
      return { name, value };
    });
}

export function createClient() {
  if (!browserClient) {
    warnIfSupabaseConfigLooksMismatched();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL. Set it in your environment before creating the Supabase browser client."
      );
    }
    if (!key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Set it in your environment before creating the Supabase browser client."
      );
    }

    browserClient = createBrowserClient(
      url,
      key,
      {
        cookies: {
          getAll() {
            return parseDocumentCookies();
          },
          setAll(cookiesToSet) {
            if (typeof document === "undefined") return;

            cookiesToSet.forEach(({ name, value, options }) => {
              const parts = [`${name}=${value}`];
              const path = options?.path ?? "/";
              const sameSite = options?.sameSite ?? "lax";

              parts.push(`Path=${path}`);

              if (options?.domain) {
                parts.push(`Domain=${options.domain}`);
              }

              if (options?.secure) {
                parts.push("Secure");
              }

              if (options?.httpOnly) {
                parts.push("HttpOnly");
              }

              if (sameSite) {
                const sameSiteValue =
                  typeof sameSite === "string" ? sameSite : "Lax";
                const normalizedSameSite =
                  sameSiteValue.charAt(0).toUpperCase() +
                  sameSiteValue.slice(1).toLowerCase();
                parts.push(`SameSite=${normalizedSameSite}`);
              }

              if (typeof options?.maxAge === "number") {
                parts.push(`Max-Age=${options.maxAge}`);
              }

              if (options?.expires) {
                const expiresValue =
                  options.expires instanceof Date
                    ? options.expires.toUTCString()
                    : new Date(options.expires).toUTCString();
                parts.push(`Expires=${expiresValue}`);
              }

              document.cookie = parts.join("; ");
            });
          },
        },
      }
    );
  }

  return browserClient;
}

export const createSupabaseBrowserClient = createClient;
