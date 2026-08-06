import fs from "fs";
import path from "path";
import { FileStore } from "./files";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

/** Strips anything that isn't a plain path segment so a crafted candidateId
 * or filename (e.g. "../../etc") can't escape UPLOAD_ROOT. */
function safeSegment(segment: string): string {
  return segment.replace(/[/\\]/g, "").replace(/^\.+/, "") || "file";
}

// Dev-only store (mirrors store-local.ts): writes under public/uploads so
// Next's own static file handling serves it back with no extra route.
// Production always uses files-blob.ts instead.
export class LocalFileStore implements FileStore {
  async upload(candidateId: string, filename: string, _contentType: string, bytes: Buffer) {
    const safeCandidateId = safeSegment(candidateId);
    const safeFilename = safeSegment(filename);
    const dir = path.join(UPLOAD_ROOT, safeCandidateId);
    fs.mkdirSync(dir, { recursive: true });
    const storedName = `${crypto.randomUUID()}-${safeFilename}`;
    fs.writeFileSync(path.join(dir, storedName), bytes);
    return { url: `/uploads/${safeCandidateId}/${storedName}`, size: bytes.length };
  }

  async remove(url: string) {
    if (!url.startsWith("/uploads/")) return;
    const filePath = path.join(process.cwd(), "public", url);
    fs.rm(filePath, { force: true }, () => undefined);
  }
}
