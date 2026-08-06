import { BoardState } from "./board-types";

export class ConflictError extends Error {
  current: BoardState;
  constructor(current: BoardState) {
    super("state changed since this client last loaded it");
    this.current = current;
  }
}

export interface BoardStore {
  read(): Promise<BoardState>;
  /** Writes `next` only if next._rev matches the currently stored _rev.
   * On success, returns the written state with _rev incremented.
   * On mismatch, throws ConflictError carrying the current state. */
  write(next: BoardState): Promise<BoardState>;
}

let cached: BoardStore | null = null;

/** Vercel's Upstash-for-Redis marketplace integration injects KV_REST_API_URL /
 * KV_REST_API_TOKEN (it kept the old Vercel KV naming for compatibility), NOT
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN despite that being the
 * @upstash/redis package's own documented convention. Check both so this
 * doesn't silently fall back to the local-file store in production again -
 * that store can't write on Vercel's read-only filesystem, which is exactly
 * what happened here the first time (every save failed with EROFS while
 * reads kept quietly succeeding off the bundled seed file). */
export function redisEnvCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function getStore(): BoardStore {
  if (cached) return cached;
  if (redisEnvCreds()) {
    // Lazy import so local dev without Redis env vars never needs the package configured.
    const { RedisBoardStore } = require("./store-redis") as typeof import("./store-redis");
    cached = new RedisBoardStore();
  } else {
    const { LocalFileBoardStore } = require("./store-local") as typeof import("./store-local");
    cached = new LocalFileBoardStore();
  }
  return cached;
}
