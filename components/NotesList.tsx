"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Note } from "@/lib/notes";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; notes: Note[] };

const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const Time = ({ iso }: { iso: string }) => <time dateTime={iso}>{when.format(new Date(iso))}</time>;

async function send(url: string, method: string, body?: unknown): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res;
}

function NoteItem({ note, showCompany, onSaved, onDeleted }: {
  note: Note;
  showCompany: boolean;
  onSaved: (n: Note) => void;
  onDeleted: (id: number) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState(note.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await (await send(`/api/notes/${note.id}`, "PATCH", { body: draft })).json());
      setMode("view");
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await send(`/api/notes/${note.id}`, "DELETE");
      onDeleted(note.id);
    } catch {
      setError("Couldn't delete. Try again.");
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl bg-surface px-3 py-2.5 text-sm" aria-label={`Note: ${note.body.slice(0, 40)}`}>
      {showCompany && (
        <p className="mb-1 text-caption">
          {note.company ? (
            <Link href={`/sector/${note.company.sectorId}?company=${note.company.id}`} className="font-medium text-link hover:underline">
              {note.company.name}
            </Link>
          ) : (
            <span className="text-text-secondary">General note</span>
          )}
        </p>
      )}
      {mode === "edit" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation(); // don't also close the profile
                setDraft(note.body);
                setMode("view");
              }
            }}
            aria-label="Edit note"
            rows={3}
            maxLength={10_000}
            autoFocus
            className="w-full resize-y rounded-lg border border-separator bg-bg p-2 outline-none focus:border-accent"
          />
          <div className="mt-1.5 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setDraft(note.body);
                setMode("view");
              }}
              className="pressable rounded-full px-3 py-1 hover:bg-bg"
            >
              Cancel
            </button>
            <button type="submit" disabled={busy || !draft.trim()} className="pressable rounded-full bg-accent px-3 py-1 font-medium text-white disabled:opacity-40">
              Save
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words">{note.body}</p>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-caption text-text-secondary">
            <span>
              Added <Time iso={note.createdAt} />
              {note.updatedAt !== note.createdAt && (
                <>
                  {" · Edited "}
                  <Time iso={note.updatedAt} />
                </>
              )}
            </span>
            {mode === "confirm" ? (
              <span className="flex items-center gap-1">
                Delete this note?
                <button type="button" onClick={() => setMode("view")} className="pressable rounded-full px-2 py-0.5 text-text hover:bg-bg">
                  Cancel
                </button>
                <button type="button" disabled={busy} onClick={() => void remove()} className="pressable rounded-full bg-danger px-2 py-0.5 font-medium text-white">
                  Delete
                </button>
              </span>
            ) : (
              <span className="flex gap-1">
                <button type="button" onClick={() => setMode("edit")} className="pressable rounded-full px-2 py-0.5 text-link hover:bg-bg">
                  Edit
                </button>
                <button type="button" onClick={() => setMode("confirm")} className="pressable rounded-full px-2 py-0.5 text-link hover:bg-bg">
                  Delete
                </button>
              </span>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-1 text-caption text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * Notes for one company (inside its profile), or every note (on /notes, where each links back
 * to its company). Add, edit in place, delete after confirming.
 */
export default function NotesList({ companyId, onGate }: { companyId?: number; onGate?: (gate: boolean) => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await send(companyId === undefined ? "/api/notes" : `/api/notes?companyId=${companyId}`, "GET");
      const body = (await res.json()) as { notes: Note[]; gate: boolean };
      onGate?.(body.gate);
      setState({ kind: "ready", notes: body.notes });
    } catch {
      setState({ kind: "error" });
    }
  }, [companyId, onGate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const note = (await (await send("/api/notes", "POST", { body: draft, companyId: companyId ?? null })).json()) as Note;
      setState((s) => (s.kind === "ready" ? { ...s, notes: [note, ...s.notes] } : s));
      setDraft("");
    } catch {
      setError("Couldn't save the note. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const update = (fn: (notes: Note[]) => Note[]) => setState((s) => (s.kind === "ready" ? { ...s, notes: fn(s.notes) } : s));

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && !busy) void add();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="New note"
          placeholder={companyId === undefined ? "Write a note…" : "Add a note about this company…"}
          rows={2}
          maxLength={10_000}
          className="w-full resize-y rounded-lg border border-separator bg-bg p-2 text-sm outline-none focus:border-accent"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-caption text-danger">{error && <span role="alert">{error}</span>}</span>
          <button type="submit" disabled={busy || !draft.trim()} className="pressable rounded-full bg-accent px-3 py-1 text-sm font-medium text-white disabled:opacity-40">
            Add note
          </button>
        </div>
      </form>

      {state.kind === "loading" && <div role="status" aria-label="Loading notes" className="mt-3 h-12 rounded-xl bg-surface motion-safe:animate-pulse" />}
      {state.kind === "error" && (
        <p className="mt-3 text-sm">
          Couldn&apos;t load notes.{" "}
          <button type="button" onClick={() => void load()} className="pressable font-medium text-link hover:underline">
            Try again
          </button>
        </p>
      )}
      {state.kind === "ready" &&
        (state.notes.length ? (
          <ul aria-label="Notes" className="mt-3 space-y-2">
            {state.notes.map((n) => (
              <NoteItem
                key={n.id}
                note={n}
                showCompany={companyId === undefined}
                onSaved={(saved) => update((ns) => [saved, ...ns.filter((x) => x.id !== saved.id)])}
                onDeleted={(id) => update((ns) => ns.filter((x) => x.id !== id))}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">No notes yet.</p>
        ))}
    </div>
  );
}
