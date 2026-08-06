import fs from "fs";
import path from "path";
import { BoardState } from "./board-types";
import { BoardStore, ConflictError } from "./store";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "state.local.json");
const SEED_PATH = path.join(DATA_DIR, "state.seed.json");

// Dev-only store: a local JSON file plus an in-process write queue (mirrors
// board/server.py's threading.Lock) so overlapping requests within this one
// process can't interleave a read-check-write. Good enough for `next dev`;
// production uses store-redis.ts instead, which does the compare-and-swap
// atomically on the Redis side since serverless invocations don't share memory.
export class LocalFileBoardStore implements BoardStore {
  private queue: Promise<unknown> = Promise.resolve();

  private ensureSeeded(): void {
    if (fs.existsSync(STATE_PATH)) return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const seed = fs.existsSync(SEED_PATH)
      ? fs.readFileSync(SEED_PATH, "utf-8")
      : JSON.stringify({
          stages: ["Introduction", "Investment Committee", "Offer", "Structuring/Onboarding", "Investment Enablement"],
          eliminatedStage: "Eliminated",
          futureLaunchStage: "Future Launches",
          candidates: [],
          _rev: 0,
        } satisfies BoardState);
    fs.writeFileSync(STATE_PATH, seed, "utf-8");
  }

  async read(): Promise<BoardState> {
    this.ensureSeeded();
    const raw = fs.readFileSync(STATE_PATH, "utf-8");
    return JSON.parse(raw) as BoardState;
  }

  write(next: BoardState): Promise<BoardState> {
    const run = this.queue.then(() => this.writeLocked(next));
    // Swallow so one failed write doesn't wedge the queue for subsequent callers.
    this.queue = run.catch(() => undefined);
    return run as Promise<BoardState>;
  }

  private async writeLocked(next: BoardState): Promise<BoardState> {
    this.ensureSeeded();
    const current = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as BoardState;
    if ((next._rev ?? 0) !== (current._rev ?? 0)) {
      throw new ConflictError(current);
    }
    const written: BoardState = { ...next, _rev: (current._rev ?? 0) + 1 };
    const tmpPath = STATE_PATH + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(written, null, 2), "utf-8");
    fs.renameSync(tmpPath, STATE_PATH);
    return written;
  }
}
