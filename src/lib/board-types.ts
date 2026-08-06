export type Attachment = {
  id: string;
  name: string;
  url: string;
  size: number;
  uploadedAt: string;
};

export type Candidate = {
  id: string;
  name: string;
  firm: string;
  stage: string;
  note: string;
  scheduled?: boolean;
  attachments?: Attachment[];
  updatedAt: string | null;
};

export type BoardState = {
  stages: string[];
  eliminatedStage: string;
  futureLaunchStage: string;
  candidates: Candidate[];
  _rev: number;
};

export function isBoardState(value: unknown): value is BoardState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.stages) && Array.isArray(v.candidates);
}
