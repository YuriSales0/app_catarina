import { NextResponse, type NextRequest } from "next/server";
import { newId } from "@/lib/ids";

/**
 * Lightweight edge gate: attaches a request id and sends unauthenticated
 * visitors of parent routes to /login. It only checks for the presence of a
 * session cookie; the real authorization happens server-side in every page and
 * action through requireActor() and requireStudentAccess().
 */
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/_next", "/favicon.ico", "/health"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") ?? newId();
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);

  const isPublic = pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const hasSession =
    request.cookies.has("authjs.session-token") || request.cookies.has("__Secure-authjs.session-token");

  if (!isPublic && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
