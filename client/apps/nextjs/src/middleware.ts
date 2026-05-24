import { NextResponse, type NextRequest } from "next/server";

// Expose the request path to the root layout so it can set <html lang/dir>
// per locale (the layout sits above the [locale] segment and can't read params).
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
