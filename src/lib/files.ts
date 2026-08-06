export interface FileStore {
  /** Stores the bytes under a path scoped to candidateId and returns a fetchable URL + size. */
  upload(candidateId: string, filename: string, contentType: string, bytes: Buffer): Promise<{ url: string; size: number }>;
  /** No-op if the url doesn't belong to this store or is already gone. */
  remove(url: string): Promise<void>;
}

let cached: FileStore | null = null;

/** Same lazy-switch pattern as store.ts's getStore(). A Blob store connected
 * via the dashboard's OIDC-based flow (the default now) injects BLOB_STORE_ID
 * but NOT a static BLOB_READ_WRITE_TOKEN - @vercel/blob authenticates via
 * Vercel's OIDC token instead, which only resolves when actually running on
 * Vercel (confirmed: a local `put()` with a pulled prod OIDC token throws
 * BlobOidcEnvironmentNotAllowedError, since that token is environment-scoped
 * server-side). So check for either credential shape, not just the token -
 * checking the token alone would wrongly fall through to the local-disk
 * store in production and hit the same read-only-filesystem failure noted
 * in store.ts's history. Local dev without either still falls back to
 * public/uploads. */
export function getFileStore(): FileStore {
  if (cached) return cached;
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
    const { BlobFileStore } = require("./files-blob") as typeof import("./files-blob");
    cached = new BlobFileStore();
  } else {
    const { LocalFileStore } = require("./files-local") as typeof import("./files-local");
    cached = new LocalFileStore();
  }
  return cached;
}
