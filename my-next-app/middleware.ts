import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function isAllowedPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/auth/callback" ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/_next/")
  );
}

function withDebugHeaders(response: NextResponse, hasUser: boolean) {
  response.headers.set("x-mw-hit", "1");
  response.headers.set("x-user", hasUser ? "present" : "absent");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasUser = Boolean(user);

  if (isAllowedPath(pathname)) {
    return withDebugHeaders(response, hasUser);
  }

  if (!hasUser) {
    return withDebugHeaders(NextResponse.redirect(new URL("/login", request.url)), false);
  }

  return withDebugHeaders(response, true);
}

export const config = {
  matcher: [
    "/",
    "/crackd",
    "/crackd/:path*",
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
