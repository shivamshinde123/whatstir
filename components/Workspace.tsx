"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectorWorkspace } from "@/lib/workspace";
import Basket from "./Basket";
import ProfilePanel from "./ProfilePanel";
import SiteHeader from "./SiteHeader";
import SubcategoryBar from "./SubcategoryBar";

type Data = SectorWorkspace & { gate: boolean };
type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Data };

const fmt = new Intl.NumberFormat("en-US");

/** The sector workspace: basket on the left, results grid in the middle, chat on the right. */
export default function Workspace({ sectorId, sectorName }: { sectorId: string; sectorName: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [subcategory, setSubcategory] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/sectors/${sectorId}`);
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: "ready", data: (await res.json()) as Data });
    } catch {
      setState({ kind: "error" });
    }
  }, [sectorId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  const data = state.kind === "ready" ? state.data : null;
  const inScope = useMemo(
    () => (data ? data.companies.filter((c) => subcategory === null || c.subcategoryIds.includes(subcategory)) : []),
    [data, subcategory],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? inScope.filter((c) => c.name.toLowerCase().includes(q)) : inScope;
  }, [inScope, query]);
  const scopeName =
    subcategory === null ? sectorName : (data?.subcategories.find((s) => s.id === subcategory)?.name ?? sectorName);

  const openProfile = useCallback((id: number, from: HTMLElement) => {
    opener.current = from;
    setProfileId(id);
    setProfileOpen(true);
  }, []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);

  // Return focus to whatever opened the profile, once the panel has actually closed.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !profileOpen) opener.current?.focus();
    wasOpen.current = profileOpen;
  }, [profileOpen]);

  return (
    <>
      <SiteHeader showSignOut={data?.gate} wide />
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 pb-8 pt-6 sm:px-6">
        <Link href="/" className="text-sm text-link hover:underline">
          ‹ All sectors
        </Link>
        <h1 className="text-headline mt-2">{sectorName}</h1>
        <p className="mt-1 text-text-secondary" aria-live="polite">
          {data ? `${fmt.format(data.sector.total)} companies` : " "}
        </p>

        {state.kind === "loading" && (
          <div role="status" aria-label="Loading sector" className="mt-6 h-[60vh] rounded-[var(--radius-card)] bg-surface motion-safe:animate-pulse" />
        )}

        {state.kind === "error" && (
          <div className="mt-6 flex h-64 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] bg-surface text-center">
            <p className="font-medium">Couldn&apos;t load this sector.</p>
            <button type="button" onClick={load} className="pressable rounded-full bg-accent px-5 py-2 text-sm font-medium text-white">
              Try again
            </button>
          </div>
        )}

        {data && (
          <>
            <SubcategoryBar
              total={data.sector.total}
              subcategories={data.subcategories}
              selected={subcategory}
              onSelect={setSubcategory}
            />
            <div className="mt-4 grid gap-4 lg:h-[calc(100dvh-15rem)] lg:min-h-[520px] lg:grid-cols-[320px_minmax(0,1fr)_360px]">
              <section
                aria-label="Company basket"
                className="relative h-[55vh] overflow-hidden rounded-[var(--radius-card)] bg-surface lg:h-auto"
              >
                <Basket
                  companies={shown}
                  inScope={inScope.length}
                  query={query}
                  onQuery={setQuery}
                  selectedId={profileOpen ? profileId : null}
                  onOpen={openProfile}
                />
                <ProfilePanel companyId={profileId} open={profileOpen} onClose={closeProfile} />
              </section>

              <section
                aria-label="Results"
                className="flex min-h-64 flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-separator p-6 text-center"
              >
                <p className="font-medium">Ask a question to start collecting companies.</p>
                <p className="mt-1 max-w-sm text-sm text-text-secondary">
                  Companies an answer relies on will gather here, and stay as you keep asking.
                </p>
              </section>

              <section aria-label="Chat" className="flex flex-col rounded-[var(--radius-card)] bg-surface p-4">
                <h2 className="font-semibold">Ask</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Scope: <span className="font-medium text-text">{scopeName}</span>
                </p>
                <div className="flex-1" />
                <textarea
                  disabled
                  rows={3}
                  placeholder={`Ask about ${scopeName} companies…`}
                  aria-label="Question"
                  className="mt-4 w-full resize-none rounded-xl border border-separator bg-bg p-3 text-sm disabled:opacity-60"
                />
                <p className="mt-2 text-caption text-text-secondary">Chat is coming soon.</p>
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}
