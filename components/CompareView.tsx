"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanyProfile } from "@/lib/workspace";
import Logo from "./Logo";
import StatusBadge from "./StatusBadge";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; profiles: CompanyProfile[] };

const Unknown = () => (
  <span data-unknown className="text-text-secondary">
    Unknown
  </span>
);

const ROWS: { label: string; cell: (p: CompanyProfile) => React.ReactNode }[] = [
  { label: "Customer", cell: (p) => p.problemCard?.customer ?? <Unknown /> },
  { label: "Problem", cell: (p) => p.problemCard?.problem ?? <Unknown /> },
  { label: "Workaround", cell: (p) => p.problemCard?.workaround ?? <Unknown /> },
  { label: "Solution", cell: (p) => p.problemCard?.solution ?? <Unknown /> },
  { label: "Batch", cell: (p) => p.batch ?? <Unknown /> },
  { label: "Status", cell: (p) => (p.status ? <StatusBadge status={p.status} /> : <Unknown />) },
  {
    label: "Website",
    cell: (p) =>
      p.website ? (
        <a href={p.website} target="_blank" rel="noopener noreferrer" className="break-all text-link hover:underline">
          {p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} ↗
        </a>
      ) : (
        <Unknown />
      ),
  },
];

/**
 * Side-by-side problem cards for 2–3 companies, in a native modal <dialog>: it traps focus,
 * closes on Esc, and gives focus back to the Compare button when it closes.
 */
export default function CompareView({ ids, onClose }: { ids: number[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/companies/${id}`);
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as CompanyProfile;
      }),
    ).then(
      (profiles) => live && setState({ kind: "ready", profiles }),
      () => live && setState({ kind: "error" }),
    );
    return () => {
      live = false;
    };
  }, [ids, attempt]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="compare-title"
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      className="m-auto max-h-[85dvh] w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-card)] bg-bg p-0 text-text shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm motion-safe:animate-[compare-in_200ms_ease-out]"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="material flex items-center justify-between border-b border-separator px-5 py-3">
          <h2 id="compare-title" className="font-semibold">
            Compare {ids.length} companies
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close compare"
            className="pressable flex size-8 items-center justify-center rounded-full bg-surface text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="overflow-auto p-5">
          {state.kind === "loading" && (
            <div role="status" aria-label="Loading companies" className="h-64 rounded-xl bg-surface motion-safe:animate-pulse" />
          )}
          {state.kind === "error" && (
            <div className="flex flex-col items-start gap-3">
              <p className="font-medium">Couldn&apos;t load these companies.</p>
              <button
                type="button"
                onClick={() => {
                  setState({ kind: "loading" });
                  setAttempt((a) => a + 1);
                }}
                className="pressable rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white"
              >
                Try again
              </button>
            </div>
          )}
          {state.kind === "ready" && (
            <table className="w-full table-fixed border-collapse text-sm">
              <caption className="mb-3 text-left text-caption text-text-secondary">
                Problem cards are AI-generated from each company&apos;s own description.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-28 pb-3">
                    <span className="sr-only">Field</span>
                  </th>
                  {state.profiles.map((p) => (
                    <th key={p.id} scope="col" className="px-2 pb-3 text-left align-bottom">
                      <span className="flex items-center gap-2">
                        <Logo id={p.id} name={p.name} url={p.logoUrl} size={32} />
                        <span className="font-semibold">{p.name}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-separator">
                {ROWS.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="py-2.5 pr-2 text-left align-top text-caption font-normal text-text-secondary">
                      {r.label}
                    </th>
                    {state.profiles.map((p) => (
                      <td key={p.id} className="px-2 py-2.5 align-top">
                        {r.cell(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </dialog>
  );
}
