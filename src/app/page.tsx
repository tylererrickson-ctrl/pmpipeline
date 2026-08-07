"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BoardState, Candidate, Attachment } from "@/lib/board-types";

const POLL_INTERVAL_MS = 4000;

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function categoryOf(state: BoardState, stage: string): "main" | "future" | "eliminated" {
  if (stage === state.eliminatedStage) return "eliminated";
  if (stage === state.futureLaunchStage) return "future";
  return "main";
}

export default function BoardPage() {
  const [state, setState] = useState<BoardState | null>(null);
  const [filter, setFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [status, setStatus] = useState("Loading…");
  const [statusError, setStatusError] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFirm, setNewFirm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCandidateIdRef = useRef<string | null>(null);

  // Skip clobbering an in-progress note edit when a background poll lands.
  const editingIdRef = useRef<string | null>(null);
  editingIdRef.current = editingId;

  const load = useCallback(async (isBackgroundPoll = false) => {
    try {
      const res = await fetch("/api/state");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error("bad response");
      const data: BoardState = await res.json();
      if (isBackgroundPoll && editingIdRef.current) return; // don't yank the textarea out from under someone typing
      setState(data);
      setStatus("Loaded");
      setStatusError(false);
    } catch {
      setStatus("Offline");
      setStatusError(true);
      if (!isBackgroundPoll) {
        setBanner('Could not reach the server. Reload the page in a moment.');
      }
    }
  }, []);

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const save = useCallback(async (next: BoardState) => {
    setStatus("Saving…");
    setStatusError(false);
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => null);
        if (body?.current) setState(body.current);
        setStatus("Reloaded");
        setStatusError(true);
        setBanner(
          "This board changed elsewhere since it was loaded. Your last change was NOT saved — the board just reloaded with the current data. Please redo that change."
        );
        return;
      }
      if (!res.ok) throw new Error("bad response");
      const written: BoardState = await res.json();
      setState(written);
      setBanner(null);
      setStatus("Saved ✓");
    } catch {
      setStatus("Save failed");
      setStatusError(true);
      setBanner("Save failed — check your connection and try again.");
    }
  }, []);

  function mutate(updater: (draft: BoardState) => void) {
    if (!state) return;
    const next: BoardState = JSON.parse(JSON.stringify(state));
    updater(next);
    setState(next);
    save(next);
  }

  function toggleScheduled(id: string) {
    mutate((next) => {
      const c = next.candidates.find((x) => x.id === id);
      if (!c) return;
      c.scheduled = !c.scheduled;
      c.updatedAt = new Date().toISOString();
    });
  }

  function moveCandidate(id: string, newStage: string) {
    mutate((next) => {
      const c = next.candidates.find((x) => x.id === id);
      if (!c || c.stage === newStage) return;
      c.stage = newStage;
      c.updatedAt = new Date().toISOString();
    });
  }

  function futureLaunchCandidate(id: string, currentNote: string) {
    const note = window.prompt(`Expected launch timing / context (optional):`, currentNote || "");
    if (note === null) return;
    mutate((next) => {
      const c = next.candidates.find((x) => x.id === id);
      if (!c) return;
      c.stage = next.futureLaunchStage;
      if (note.trim()) c.note = note.trim();
      c.updatedAt = new Date().toISOString();
    });
  }

  function eliminateCandidate(id: string) {
    const reason = window.prompt("Reason for eliminating (optional):", "");
    if (reason === null) return;
    mutate((next) => {
      const c = next.candidates.find((x) => x.id === id);
      if (!c) return;
      c.stage = next.eliminatedStage;
      if (reason.trim()) c.note = reason.trim();
      c.updatedAt = new Date().toISOString();
    });
  }

  function saveNote(id: string) {
    mutate((next) => {
      const c = next.candidates.find((x) => x.id === id);
      if (!c) return;
      c.note = draftNote.trim();
      c.updatedAt = new Date().toISOString();
    });
    setEditingId(null);
  }

  function addCandidate() {
    if (!state || !newName.trim()) return;
    let id = slugify(newName);
    if (state.candidates.some((c) => c.id === id)) id = `${id}-${Date.now()}`;
    mutate((next) => {
      next.candidates.push({
        id,
        name: newName.trim(),
        firm: newFirm.trim(),
        stage: next.stages[0],
        note: "",
        scheduled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    setAddOpen(false);
    setNewName("");
    setNewFirm("");
  }

  function triggerAttach(candidateId: string) {
    pendingCandidateIdRef.current = candidateId;
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const candidateId = pendingCandidateIdRef.current;
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file || !candidateId) return;

    setUploadingId(candidateId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("candidateId", candidateId);
      const res = await fetch("/api/attachments", { method: "POST", body: formData });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error("upload failed");
      const attachment: Attachment = await res.json();
      mutate((next) => {
        const c = next.candidates.find((x) => x.id === candidateId);
        if (!c) return;
        c.attachments = [...(c.attachments || []), attachment];
        c.updatedAt = new Date().toISOString();
      });
    } catch {
      setBanner("Attachment upload failed. Please try again.");
    } finally {
      setUploadingId(null);
    }
  }

  function removeAttachment(candidateId: string, attachment: Attachment) {
    mutate((next) => {
      const c = next.candidates.find((x) => x.id === candidateId);
      if (!c) return;
      c.attachments = (c.attachments || []).filter((a) => a.id !== attachment.id);
      c.updatedAt = new Date().toISOString();
    });
    // Best-effort: an orphaned blob left behind on failure isn't worth
    // blocking the UI over, since the metadata (the source of truth) is
    // already gone from board state above.
    fetch("/api/attachments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: attachment.url }),
    }).catch(() => undefined);
  }

  if (!state) {
    return (
      <>
        <header>
          <h1>Portfolio Manager Pipeline</h1>
          <span id="status" className={statusError ? "error" : undefined}>{status}</span>
        </header>
        {banner && <div id="banner" className="show">{banner}</div>}
      </>
    );
  }

  const allStages = [...state.stages, state.futureLaunchStage, state.eliminatedStage];
  const lowerFilter = filter.trim().toLowerCase();
  const matches = (c: Candidate) => !lowerFilter || (c.name + " " + (c.firm || "")).toLowerCase().includes(lowerFilter);

  return (
    <>
      <header>
        <h1>Portfolio Manager Pipeline</h1>
        <span className="sub">
          Introduction → Investment Committee → Offer → Structuring/Onboarding → Investment Enablement
        </span>
        <input
          id="search"
          type="text"
          placeholder="Filter by name or firm…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select id="stageFilter" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">All Categories</option>
          {allStages.map((stage) => (
            <option key={stage} value={stage}>{stage}</option>
          ))}
        </select>
        <button id="addBtn" onClick={() => setAddOpen((v) => !v)}>+ Add PM</button>
        <span id="status" className={statusError ? "error" : undefined}>{status}</span>
      </header>

      <div id="addForm" className={addOpen ? "open" : undefined}>
        <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input placeholder="Firm (optional)" value={newFirm} onChange={(e) => setNewFirm(e.target.value)} />
        <button onClick={addCandidate}>Add to {state.stages[0]}</button>
        <button
          onClick={() => {
            setAddOpen(false);
            setNewName("");
            setNewFirm("");
          }}
        >
          Cancel
        </button>
      </div>

      {banner && <div id="banner" className="show">{banner}</div>}

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={handleFileSelected}
      />

      <div id="board">
        {allStages.map((stage) => {
          if (stageFilter && stage !== stageFilter) return null;
          const category = categoryOf(state, stage);
          const candidates = state.candidates.filter((c) => c.stage === stage);
          const visible = candidates.filter(matches);
          return (
            <div
              key={stage}
              className={"column" + (category !== "main" ? " " + category : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                const id = e.dataTransfer.getData("text/plain");
                moveCandidate(id, stage);
              }}
            >
              <div className="column-header">
                <span>{stage}</span>
                <span className="count">
                  {visible.length}
                  {lowerFilter ? `/${candidates.length}` : ""}
                </span>
              </div>
              <div className={"cards" + (dragOverStage === stage ? " dragover" : "")}>
                {visible.map((c) => {
                  const idx = state.stages.indexOf(stage);
                  return (
                    <div
                      key={c.id}
                      className="card"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                      onClick={() => {
                        if (editingId === c.id) {
                          setEditingId(null);
                        } else {
                          setEditingId(c.id);
                          setDraftNote(c.note || "");
                        }
                      }}
                    >
                      <div className="card-name">{c.name}</div>
                      {c.firm && <div className="card-firm">{c.firm}</div>}
                      <button
                        className={"badge-toggle " + (c.scheduled ? "scheduled" : "not-scheduled")}
                        title="Click to toggle"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleScheduled(c.id);
                        }}
                      >
                        {c.scheduled ? "✓ Scheduled" : "○ Not Scheduled"}
                      </button>
                      {c.note && <div className="card-note">{c.note}</div>}
                      {c.createdAt && <div className="card-date">{formatDate(c.createdAt)}</div>}

                      {c.attachments && c.attachments.length > 0 && (
                        <div className="card-attachments">
                          {c.attachments.map((a) => (
                            <div key={a.id} className="attachment-chip">
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={a.name}
                                onClick={(e) => e.stopPropagation()}
                              >
                                📎 {a.name}
                              </a>
                              <span className="attachment-size">{formatSize(a.size)}</span>
                              <button
                                className="attachment-remove"
                                title="Remove attachment"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeAttachment(c.id, a);
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="card-actions">
                        <button
                          className="attach-btn"
                          disabled={uploadingId === c.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerAttach(c.id);
                          }}
                        >
                          {uploadingId === c.id ? "Uploading…" : "📎 Attach"}
                        </button>
                        {category === "eliminated" && (
                          <button
                            className="restore"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveCandidate(c.id, state.stages[0]);
                            }}
                          >
                            ↩ Restore
                          </button>
                        )}
                        {category === "future" && (
                          <>
                            <button
                              className="restore"
                              title={`Move back to ${state.stages[0]}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveCandidate(c.id, state.stages[0]);
                              }}
                            >
                              ↩ Restore
                            </button>
                            <button
                              className="eliminate"
                              onClick={(e) => {
                                e.stopPropagation();
                                eliminateCandidate(c.id);
                              }}
                            >
                              Eliminate ✕
                            </button>
                          </>
                        )}
                        {category === "main" && (
                          <>
                            {idx > 0 && (
                              <button
                                title={`Move back to ${state.stages[idx - 1]}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveCandidate(c.id, state.stages[idx - 1]);
                                }}
                              >
                                ◂
                              </button>
                            )}
                            {idx < state.stages.length - 1 && (
                              <button
                                title={`Move forward to ${state.stages[idx + 1]}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveCandidate(c.id, state.stages[idx + 1]);
                                }}
                              >
                                ▸
                              </button>
                            )}
                            <button
                              className="future-btn"
                              title="Park in Future Launches (go-live 3-6 months out)"
                              onClick={(e) => {
                                e.stopPropagation();
                                futureLaunchCandidate(c.id, c.note);
                              }}
                            >
                              📅 Future Launch
                            </button>
                            <button
                              className="eliminate"
                              onClick={(e) => {
                                e.stopPropagation();
                                eliminateCandidate(c.id);
                              }}
                            >
                              Eliminate ✕
                            </button>
                          </>
                        )}
                      </div>

                      {editingId === c.id && (
                        <div className="note-edit" onClick={(e) => e.stopPropagation()}>
                          <textarea value={draftNote} onChange={(e) => setDraftNote(e.target.value)} />
                          <button className="save-note" onClick={() => saveNote(c.id)}>
                            Save note
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
