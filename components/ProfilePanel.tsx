"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanyProfile } from "@/lib/workspace";
import Logo from "./Logo";
import NotesList from "./NotesList";
import StatusBadge from "./StatusBadge";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; profile: CompanyProfile };

const Unknown = () => <span className="text-text-secondary">Unknown</span>;

const CARD_ROWS = [
  ["customer", "Customer"],
  ["problem", "Problem"],
  ["workaround", "Current workaround"],
  ["solution", "Solution"],
] as const;

/** Company profile; slides in over the basket column (and out the same way). */
export default function ProfilePanel({
  companyId,
  open,
  onClose,
}: {
  companyId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async (id: number) => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/companies/${id}`);
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: "ready", profile: (await res.json()) as CompanyProfile });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the company changes
    if (companyId !== null) void load(companyId);
  }, [companyId, load]);

  // Move focus into the panel when it opens; Esc closes it.
  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, state.kind]);

  const p = state.kind === "ready" ? state.profile : null;

  return (
    <aside
      aria-label="Company profile"
      aria-hidden={!open}
      inert={!open}
      data-open={open}
      className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-bg transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-opacity data-[open=false]:pointer-events-none data-[open=false]:-translate-x-full motion-reduce:data-[open=false]:translate-x-0 motion-reduce:data-[open=false]:opacity-0 lg:absolute lg:z-10"
    >
      <div className="material sticky top-0 z-10 flex items-center justify-between border-b border-separator px-4 py-2">
        <span className="text-sm text-text-secondary">Profile</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close profile"
          className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-surface text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="px-5 pb-8 pt-5">
        {state.kind === "loading" && (
          <div role="status" aria-label="Loading profile" className="space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-surface motion-safe:animate-pulse" />
            <div className="h-5 w-2/3 rounded bg-surface motion-safe:animate-pulse" />
            <div className="h-20 rounded bg-surface motion-safe:animate-pulse" />
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex flex-col items-start gap-3">
            <p className="font-medium">Couldn&apos;t load this company.</p>
            <button
              type="button"
              onClick={() => companyId !== null && load(companyId)}
              className="pressable rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white"
            >
              Try again
            </button>
          </div>
        )}

        {p && (
          <article>
            <div className="flex items-start gap-3">
              <Logo id={p.id} name={p.name} url={p.logoUrl} size={56} />
              <div className="min-w-0">
                <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold leading-tight outline-none">
                  {p.name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                  {p.batch && <span>{p.batch}</span>}
                  <StatusBadge status={p.status} />
                </div>
              </div>
            </div>

            <p className="mt-4 font-medium">{p.oneLiner ?? <Unknown />}</p>
            {p.description && <p className="mt-2 text-sm leading-relaxed text-text-secondary">{p.description}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {p.website ? (
                <a
                  href={p.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pressable rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white"
                >
                  Visit website ↗
                </a>
              ) : (
                <span className="rounded-full bg-surface px-4 py-1.5 text-sm text-text-secondary">Website not available</span>
              )}
              {p.ycUrl && (
                <a
                  href={p.ycUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pressable rounded-full bg-surface px-4 py-1.5 text-sm font-medium"
                >
                  YC page ↗
                </a>
              )}
            </div>

            <section className="mt-6" aria-labelledby="card-heading">
              <h3 id="card-heading" className="flex items-baseline justify-between font-semibold">
                Problem card <span className="text-caption font-normal text-text-secondary">AI-generated</span>
              </h3>
              {p.problemCard ? (
                <dl className="mt-2 divide-y divide-separator rounded-xl bg-surface text-sm">
                  {CARD_ROWS.map(([key, label]) => (
                    <div key={key} className="px-3 py-2">
                      <dt className="text-caption text-text-secondary">{label}</dt>
                      <dd>{p.problemCard![key] ?? <Unknown />}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-text-secondary">Not generated yet.</p>
              )}
            </section>

            {p.subcategories.length > 0 && (
              <section className="mt-6" aria-labelledby="groups-heading">
                <h3 id="groups-heading" className="font-semibold">
                  Groups
                </h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {p.subcategories.map((s) => (
                    <li key={s.id} title={s.explanation ?? undefined} className="rounded-full bg-surface px-2.5 py-0.5 text-sm">
                      {s.name}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-6" aria-labelledby="founders-heading">
              <h3 id="founders-heading" className="font-semibold">
                Founders
              </h3>
              {p.founders.length ? (
                <ul className="mt-2 space-y-2 text-sm">
                  {p.founders.map((f) => (
                    <li key={f.name} className="flex items-baseline justify-between gap-3">
                      <span>
                        {f.name}
                        {f.title && <span className="text-text-secondary"> · {f.title}</span>}
                      </span>
                      {f.linkedinUrl ? (
                        <a
                          href={f.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${f.name} on LinkedIn`}
                          className="shrink-0 text-link hover:underline"
                        >
                          LinkedIn ↗
                        </a>
                      ) : (
                        <span className="shrink-0 text-text-secondary">LinkedIn not available</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-text-secondary">No founders listed.</p>
              )}
            </section>

            <section className="mt-6" aria-labelledby="notes-heading">
              <h3 id="notes-heading" className="mb-2 font-semibold">
                Notes
              </h3>
              <NotesList key={p.id} companyId={p.id} />
            </section>

            <p className="mt-6 text-caption text-text-secondary">
              Source: yc-oss, refreshed {new Date(p.refreshedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
              {p.missingFromSource && " · no longer listed in the source"}
            </p>
          </article>
        )}
      </div>
    </aside>
  );
}
