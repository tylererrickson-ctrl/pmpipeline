import { Redis } from "@upstash/redis";
import { BoardState } from "./board-types";
import { BoardStore, ConflictError, redisEnvCreds } from "./store";

const KEY = "pm-pipeline-board:state";

const DEFAULT_SEED: BoardState = {
  stages: ["Introduction", "Investment Committee", "Offer", "Structuring/Onboarding", "Investment Enablement"],
  eliminatedStage: "Eliminated",
  futureLaunchStage: "Future Launches",
  candidates: [],
  _rev: 0,
};

// Atomic compare-and-swap: only writes if the value's _rev still matches
// expectedRev. Serverless invocations don't share memory (no in-process lock
// possible like store-local.ts's), so the check-then-set has to happen in a
// single round trip on the Redis side via a Lua script, not as two separate
// GET/SET calls from Node.
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
local currentRev = 0
if current then
  local ok, decoded = pcall(cjson.decode, current)
  if ok and decoded['_rev'] then
    currentRev = decoded['_rev']
  end
end
if currentRev ~= tonumber(ARGV[2]) then
  return current
end
redis.call('SET', KEYS[1], ARGV[1])
return 'OK'
`;

export class RedisBoardStore implements BoardStore {
  private redis: Redis;

  constructor() {
    const creds = redisEnvCreds();
    if (!creds) throw new Error("Redis env credentials not found (checked UPSTASH_REDIS_REST_* and KV_REST_API_*)");
    this.redis = new Redis(creds);
  }

  async read(): Promise<BoardState> {
    const raw = await this.redis.get<BoardState | string>(KEY);
    if (raw === null || raw === undefined) {
      // First run: seed it. NX so a concurrent first-reader can't stomp another's seed.
      await this.redis.set(KEY, JSON.stringify(DEFAULT_SEED), { nx: true });
      const seeded = await this.redis.get<BoardState | string>(KEY);
      return typeof seeded === "string" ? JSON.parse(seeded) : (seeded as BoardState);
    }
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }

  async write(next: BoardState): Promise<BoardState> {
    const written: BoardState = { ...next, _rev: (next._rev ?? 0) + 1 };
    const result = await this.redis.eval(
      CAS_SCRIPT,
      [KEY],
      [JSON.stringify(written), String(next._rev ?? 0)]
    );
    if (result === "OK") return written;
    const current = typeof result === "string" ? JSON.parse(result) : (result as BoardState);
    throw new ConflictError(current);
  }
}
