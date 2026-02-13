import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

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
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
