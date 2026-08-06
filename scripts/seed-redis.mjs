// One-time seed: push data/state.seed.json directly into Redis, bypassing
// the app's own CAS logic (which would otherwise seed an EMPTY default state
// the moment anyone's browser hits GET /api/state before this runs).
//
// Usage: node --env-file=.env.production.local scripts/seed-redis.mjs
import { Redis } from "@upstash/redis";
import { readFileSync } from "fs";

const KEY = "pm-pipeline-board:state";

const seed = JSON.parse(readFileSync(new URL("../data/state.seed.json", import.meta.url), "utf-8"));
if (typeof seed._rev !== "number") seed._rev = 0;

// Vercel's Upstash-for-Redis integration injects KV_REST_API_URL/TOKEN, not
// the UPSTASH_REDIS_REST_* names Redis.fromEnv() looks for - match src/lib/store.ts.
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (!url || !token) throw new Error("Redis env credentials not found");

const redis = new Redis({ url, token });
await redis.set(KEY, JSON.stringify(seed));
console.log(`Seeded ${seed.candidates.length} candidates at rev ${seed._rev} into Redis key "${KEY}"`);
