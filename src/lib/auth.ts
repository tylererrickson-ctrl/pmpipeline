import { NextRequest, NextResponse } from "next/server";

export const AUTH_COOKIE = "board_auth";

// Web Crypto (crypto.subtle) rather than Node's `crypto` module so the exact
// same code works whether this runs under the Node runtime (route handlers)
// or the Edge runtime (middleware) - both expose globalThis.crypto.subtle,
// Node's `crypto` module does not exist on Edge.
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedAuthToken(): Promise<string> {
  const password = process.env.BOARD_PASSWORD;
  if (!password) {
    throw new Error("BOARD_PASSWORD environment variable is not set");
  }
  return sha256Hex(password);
}

export async function isAuthedRequest(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (!cookie) return false;
  return cookie === (await expectedAuthToken());
}

/** For API routes: returns a 401 response if unauthenticated, else null. */
export async function requireAuthed(req: NextRequest): Promise<NextResponse | null> {
  if (await isAuthedRequest(req)) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
