import { NextRequest, NextResponse } from "next/server";
import { getFileStore } from "@/lib/files";
import { requireAuthed } from "@/lib/auth";

const MAX_BYTES = 20 * 1024 * 1024; // 20MB - generous for questionnaires/decks, not for video

export async function POST(req: NextRequest) {
  const unauthorized = await requireAuthed(req);
  if (unauthorized) return unauthorized;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const candidateId = form?.get("candidateId");
  if (!(file instanceof File) || typeof candidateId !== "string" || !candidateId) {
    return NextResponse.json({ error: "missing file or candidateId" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `file exceeds ${MAX_BYTES / 1024 / 1024}MB limit` }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const { url, size } = await getFileStore().upload(candidateId, file.name, file.type || "application/octet-stream", bytes);

  return NextResponse.json({
    id: crypto.randomUUID(),
    name: file.name,
    url,
    size,
    uploadedAt: new Date().toISOString(),
  });
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireAuthed(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : null;
  if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });

  await getFileStore().remove(url);
  return NextResponse.json({ ok: true });
}
