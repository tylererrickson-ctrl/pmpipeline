import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { ConflictError } from "@/lib/store";
import { isBoardState } from "@/lib/board-types";
import { requireAuthed } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAuthed(req);
  if (unauthorized) return unauthorized;

  const state = await getStore().read();
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAuthed(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  if (!isBoardState(body)) {
    return NextResponse.json({ error: "missing stages/candidates" }, { status: 400 });
  }

  try {
    const written = await getStore().write(body);
    return NextResponse.json(written);
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json(
        { error: "conflict", message: "state changed since this tab last loaded it", current: err.current },
        { status: 409 }
      );
    }
    throw err;
  }
}
