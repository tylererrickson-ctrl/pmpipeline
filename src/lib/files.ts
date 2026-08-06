export interface FileStore {
  /** Stores the bytes under a path scoped to candidateId and returns a fetchable URL + size. */
  upload(candidateId: string, filename: string, contentType: string, bytes: Buffer): Promise<{ url: string; size: number }>;
  /** No-op if the url doesn't belong to this store or is already gone. */
  remove(url: string): Promise<void>;
}

let cached: FileStore | null = null;

/** Same lazy-switch pattern as store.ts's getStore(): production has
 * BLOB_READ_WRITE_TOKEN (Vercel injects this once Blob storage is attached
 * to the project); local dev without it falls back to writing under
 * public/uploads so files are servable by Next's static file handling with
 * no extra route needed. */
export function getFileStore(): FileStore {
  if (cached) return cached;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { BlobFileStore } = require("./files-blob") as typeof import("./files-blob");
    cached = new BlobFileStore();
  } else {
    const { LocalFileStore } = require("./files-local") as typeof import("./files-local");
    cached = new LocalFileStore();
  }
  return cached;
}
