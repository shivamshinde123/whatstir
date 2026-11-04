"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Action } from "@/lib/answer";
import type { Message, SessionState } from "@/lib/session";
import type { SectorWorkspace } from "@/lib/workspace";
import Basket from "./Basket";
import Chat from "./Chat";
import CompareView from "./CompareView";
import ProfilePanel from "./ProfilePanel";
import ResultsGrid, { MAX_SELECTION } from "./ResultsGrid";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import SubcategoryBar from "./SubcategoryBar";

type Data = SectorWorkspace & { gate: boolean };
type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Data };

const NONE: ReadonlySet<number> = new Set();
/** Per-browser: whether the basket column is folded into a rail (decision 80). */
export const BASKET_COLLAPSED_KEY = "whatstir-basket-collapsed";

const fmt = new Intl.NumberFormat("en-US");

/** The sector workspace: basket on the left, results grid in the middle, chat on the right. */
export default function Workspace({ sectorId, sectorName }: { sectorId: string; sectorName: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [subcategory, setSubcategory] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(NONE);
  const [pending, setPending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [askSelected, setAskSelected] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [basketCollapsed, setBasketCollapsedState] = useState(false);
  /** A YC batch carried over from the home page's filter (?batch=); narrows the basket only. */
  const [batch, setBatchState] = useState<string | null>(null);
  // Questions go to the selection only while "Ask about these" is on and something is selected.
  const selectionScope = askSelected && selected.length > 0;

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const [res, sres] = await Promise.all([fetch(`/api/sectors/${sectorId}`), fetch(`/api/sectors/${sectorId}/session`)]);
      if (!res.ok || !sres.ok) throw new Error(`${res.status}/${sres.status}`);
      const [data, s] = await Promise.all([res.json() as Promise<Data>, sres.json() as Promise<SessionState>]);
      setSession(s);
      setFresh(NONE);
      setState({ kind: "ready", data });
      const params = new URLSearchParams(window.location.search);
      const wantedBatch = params.get("batch");
      if (wantedBatch && data.companies.some((c) => c.batch === wantedBatch)) setBatchState(wantedBatch);
      const linked = Number(params.get("company"));
      if (Number.isSafeInteger(linked) && linked > 0) {
        setProfileId(linked);
        setProfileOpen(true);
      }
    } catch {
      setState({ kind: "error" });
    }
  }, [sectorId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  // Read the saved choice after mount, so the server render and hydration always match.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a saved preference on mount
      if (localStorage.getItem(BASKET_COLLAPSED_KEY) === "1") setBasketCollapsedState(true);
    } catch {
      // Storage can be unavailable (private mode); the basket simply starts open.
    }
  }, []);
  const setBasketCollapsed = useCallback((collapsed: boolean) => {
    setBasketCollapsedState(collapsed);
    try {
      if (collapsed) localStorage.setItem(BASKET_COLLAPSED_KEY, "1");
      else localStorage.removeItem(BASKET_COLLAPSED_KEY);
    } catch {
      // Not saved; the choice still applies until reload.
    }
  }, []);

  const clearBatch = useCallback(() => {
    setBatchState(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("batch");
    window.history.replaceState(null, "", url);
  }, []);

  const data = state.kind === "ready" ? state.data : null;
  const inBatch = useMemo(() => (data ? data.companies.filter((c) => !batch || c.batch === batch) : []), [data, batch]);
  // With a batch chosen, the group chips count only that batch's companies, so they match the basket.
  const subcategories = useMemo(
    () =>
      !data || !batch
        ? (data?.subcategories ?? [])
        : data.subcategories.map((s) => ({ ...s, count: inBatch.filter((c) => c.subcategoryIds.includes(s.id)).length })),
    [data, batch, inBatch],
  );
  const inScope = useMemo(
    () => inBatch.filter((c) => subcategory === null || c.subcategoryIds.includes(subcategory)),
    [inBatch, subcategory],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? inScope.filter((c) => c.name.toLowerCase().includes(q)) : inScope;
  }, [inScope, query]);
  const groupName = subcategory === null ? sectorName : (data?.subcategories.find((s) => s.id === subcategory)?.name ?? sectorName);
  // Questions follow the batch too ("Fall 2026 B2B"); an explicit selection is just those companies.
  const scopeName = selectionScope ? `${selected.length} selected` : batch ? `${batch} ${groupName}` : groupName;

  const ask = useCallback(
    async (
      text: string,
      action: Action = "ask",
      scope: Message["scope"] = selectionScope
        ? { subcategoryId: null, batch: null, selectedCompanyIds: selected }
        : { subcategoryId: subcategory, batch, selectedCompanyIds: [] },
    ) => {
      if (!session) return;
      setPending(text);
      setSendError(null);
      try {
        const res = await fetch(`/api/sessions/${session.session.id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text,
            action,
            subcategoryId: scope.subcategoryId ?? null,
            batch: scope.batch ?? null,
            selectedCompanyIds: scope.selectedCompanyIds ?? [],
          }),
        });
        const body = await res.json().catch(() => null);
        if (res.ok) {
          setSession((s) => s && { ...s, messages: [...s.messages, body.userMessage, body.message], tiles: body.tiles });
          setFresh(new Set<number>(body.newTileIds));
        } else if (res.status === 502 && body?.userMessage) {
          // The question and a failed reply were saved; the reply offers Retry.
          setSession((s) => s && { ...s, messages: [...s.messages, body.userMessage, body.message] });
        } else if (res.status === 409) {
          // The session ended elsewhere (another tab started over): pick up the new one.
          const s = await fetch(`/api/sectors/${sectorId}/session`);
          if (!s.ok) throw new Error(String(s.status));
          setSession(await s.json());
          setFresh(NONE);
          setSendError(text);
        } else {
          throw new Error(String(res.status));
        }
      } catch {
        setSendError(text);
      } finally {
        setPending(null);
      }
    },
    [session, sectorId, subcategory, batch, selectionScope, selected],
  );
  const retry = useCallback((text: string, action: Action, scope: Message["scope"]) => ask(text, action, scope), [ask]);

  const toggle = useCallback(
    (id: number) =>
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_SELECTION ? [...s, id] : s)),
    [],
  );
  const clearSelection = useCallback(() => {
    setSelected([]);
    setAskSelected(false);
  }, []);
  const askAboutSelected = useCallback(() => {
    setAskSelected(true);
    document.getElementById("question")?.focus();
  }, []);

  const reset = useCallback(async () => {
    setSendError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/sectors/${sectorId}/session/reset`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setSession(await res.json());
      setFresh(NONE);
      clearSelection();
    } catch {
      setNotice("Couldn't start a new session. Try again.");
    }
  }, [sectorId, clearSelection]);

  // The ring follows the latest successful answer only.
  const cited = useMemo<ReadonlySet<number>>(() => {
    const last = session?.messages.findLast((m) => m.role === "assistant" && m.status === "ok");
    return last ? new Set(last.companyIds) : NONE;
  }, [session]);
  const collected = useMemo<ReadonlySet<number>>(() => new Set(session?.tiles.map((t) => t.companyId)), [session]);

  const openProfile = useCallback(
    (id: number, from: HTMLElement) => {
      opener.current = from;
      setProfileId(id);
      setProfileOpen(true);
      // The profile opens inside the basket column, so it has to be open to show it.
      setBasketCollapsed(false);
    },
    [setBasketCollapsed],
  );
  const closeProfile = useCallback(() => setProfileOpen(false), []);

  // Return focus to whatever opened the profile, once the panel has actually closed.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !profileOpen) opener.current?.focus();
    wasOpen.current = profileOpen;
  }, [profileOpen]);

  return (
    // Desktop: exactly one screen tall (with a floor), so the three columns get all the height.
    <div className="flex flex-1 flex-col lg:h-dvh lg:min-h-[680px] lg:flex-none">
      <SiteHeader showSignOut={data?.gate} />
      <main className="flex min-h-0 w-full flex-1 flex-col px-4 pb-4 pt-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href={batch ? `/?batch=${encodeURIComponent(batch)}` : "/"} className="text-sm text-link hover:underline">
            ‹ All sectors
          </Link>
          <h1 className="text-2xl font-semibold tracking-[-0.015em]">{sectorName}</h1>
          <p className="text-sm text-text-secondary" aria-live="polite">
            {data ? (batch ? `${fmt.format(inBatch.length)} of ${fmt.format(data.sector.total)} companies` : `${fmt.format(data.sector.total)} companies`) : " "}
          </p>
          {batch && (
            <span className="inline-flex items-center gap-1 self-center rounded-full bg-accent/10 py-0.5 pl-2.5 pr-1 text-sm text-link">
              {batch}
              <button
                type="button"
                onClick={clearBatch}
                aria-label={`Show all batches, not just ${batch}`}
                className="pressable flex size-5 items-center justify-center rounded-full hover:bg-accent/15"
              >
                ×
              </button>
            </span>
          )}
          {data && (
            <div className="lg:ml-auto">
              <SubcategoryBar total={inBatch.length} subcategories={subcategories} selected={subcategory} onSelect={setSubcategory} />
            </div>
          )}
        </div>

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
            {/* Desktop: basket 30%, results 30%, chat 40%; a collapsed basket is a 3rem rail. */}
            <div
              className={`mt-3 grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:transition-[grid-template-columns] lg:duration-300 lg:ease-out motion-reduce:transition-none ${
                basketCollapsed
                  ? "lg:grid-cols-[3rem_minmax(0,3fr)_minmax(0,4fr)]"
                  : "lg:grid-cols-[minmax(0,3fr)_minmax(0,3fr)_minmax(0,4fr)]"
              }`}
            >
              <section
                aria-label="Company basket"
                data-collapsed={basketCollapsed || undefined}
                className="relative h-[55vh] overflow-hidden rounded-[var(--radius-card)] bg-surface lg:h-auto"
              >
                {basketCollapsed && (
                  <button
                    type="button"
                    onClick={() => setBasketCollapsed(false)}
                    aria-label="Show the company list"
                    aria-expanded="false"
                    aria-controls="company-basket"
                    title="Show the company list"
                    className="pressable group hidden h-full w-full flex-col items-center gap-3 pt-3 text-text transition-colors hover:bg-bg/60 lg:flex"
                  >
                    <span
                      aria-hidden="true"
                      data-rail-chevron
                      className="flex size-7 items-center justify-center rounded-full bg-accent text-base leading-none text-bg transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    >
                      ›
                    </span>
                    <span aria-hidden="true" className="text-tag [writing-mode:vertical-rl]">
                      Companies · {fmt.format(inScope.length)}
                    </span>
                  </button>
                )}
                {/* On phones the basket is always shown; the rail is desktop-only. */}
                <div id="company-basket" className={`h-full ${basketCollapsed ? "lg:hidden" : ""}`}>
                  <Basket
                    companies={shown}
                    collected={collected}
                    inScope={inScope.length}
                    query={query}
                    onQuery={setQuery}
                    selectedId={profileOpen ? profileId : null}
                    onOpen={openProfile}
                    onCollapse={() => setBasketCollapsed(true)}
                  />
                </div>
                <ProfilePanel companyId={profileId} open={profileOpen} onClose={closeProfile} />
              </section>

              <section aria-label="Results" className="min-h-0">
                <ResultsGrid
                  tiles={session?.tiles ?? []}
                  cited={cited}
                  fresh={fresh}
                  onOpen={openProfile}
                  selected={selected}
                  onToggle={toggle}
                  onCompare={() => setComparing(true)}
                  onAskSelected={askAboutSelected}
                  onClear={clearSelection}
                />
                {comparing && <CompareView ids={selected} onClose={() => setComparing(false)} />}
              </section>

              <section aria-label="Chat" className="h-[70vh] min-h-0 rounded-[var(--radius-card)] bg-surface lg:h-auto">
                <Chat
                  messages={session?.messages ?? []}
                  pending={pending}
                  sendError={sendError}
                  notice={notice}
                  scopeName={scopeName}
                  onClearScope={selectionScope ? () => setAskSelected(false) : undefined}
                  onAsk={ask}
                  onRetry={retry}
                  onReset={reset}
                />
              </section>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
