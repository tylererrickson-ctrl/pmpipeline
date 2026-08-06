import { NextRequest, NextResponse } from "next/server";
import { isAuthedRequest } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  if (await isAuthedRequest(req)) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Page routes only - excludes all of /api (each API route checks auth itself
  // via requireAuthed and returns a proper 401 JSON body; a redirect response
  // here would instead hand fetch() an HTML login page to try to parse as JSON).
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
