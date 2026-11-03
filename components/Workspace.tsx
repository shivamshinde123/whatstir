"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Message, SessionState } from "@/lib/session";
import type { SectorWorkspace } from "@/lib/workspace";
import Basket from "./Basket";
import Chat from "./Chat";
import ProfilePanel from "./ProfilePanel";
import ResultsGrid from "./ResultsGrid";
import SiteHeader from "./SiteHeader";
import SubcategoryBar from "./SubcategoryBar";

type Data = SectorWorkspace & { gate: boolean };
type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Data };

const NONE: ReadonlySet<number> = new Set();

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

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const [res, sres] = await Promise.all([fetch(`/api/sectors/${sectorId}`), fetch(`/api/sectors/${sectorId}/session`)]);
      if (!res.ok || !sres.ok) throw new Error(`${res.status}/${sres.status}`);
      const [data, s] = await Promise.all([res.json() as Promise<Data>, sres.json() as Promise<SessionState>]);
      setSession(s);
      setFresh(NONE);
      setState({ kind: "ready", data });
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

  const ask = useCallback(
    async (text: string, scope: Message["scope"] = { subcategoryId: subcategory, selectedCompanyIds: [] }) => {
      if (!session) return;
      setPending(text);
      setSendError(null);
      try {
        const res = await fetch(`/api/sessions/${session.session.id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, subcategoryId: scope.subcategoryId ?? null, selectedCompanyIds: scope.selectedCompanyIds ?? [] }),
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
    [session, sectorId, subcategory],
  );

  const reset = useCallback(async () => {
    setSendError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/sectors/${sectorId}/session/reset`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setSession(await res.json());
      setFresh(NONE);
    } catch {
      setNotice("Couldn't start a new session. Try again.");
    }
  }, [sectorId]);

  // The ring follows the latest successful answer only.
  const cited = useMemo<ReadonlySet<number>>(() => {
    const last = session?.messages.findLast((m) => m.role === "assistant" && m.status === "ok");
    return last ? new Set(last.companyIds) : NONE;
  }, [session]);
  const collected = useMemo<ReadonlySet<number>>(() => new Set(session?.tiles.map((t) => t.companyId)), [session]);

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
            <div className="mt-4 grid gap-4 lg:h-[calc(100dvh-18rem)] lg:min-h-[520px] lg:grid-cols-[320px_minmax(0,1fr)_360px]">
              <section
                aria-label="Company basket"
                className="relative h-[55vh] overflow-hidden rounded-[var(--radius-card)] bg-surface lg:h-auto"
              >
                <Basket
                  companies={shown}
                  collected={collected}
                  inScope={inScope.length}
                  query={query}
                  onQuery={setQuery}
                  selectedId={profileOpen ? profileId : null}
                  onOpen={openProfile}
                />
                <ProfilePanel companyId={profileId} open={profileOpen} onClose={closeProfile} />
              </section>

              <section aria-label="Results" className="min-h-0">
                <ResultsGrid tiles={session?.tiles ?? []} cited={cited} fresh={fresh} onOpen={openProfile} />
              </section>

              <section aria-label="Chat" className="h-[70vh] min-h-0 rounded-[var(--radius-card)] bg-surface lg:h-auto">
                <Chat
                  messages={session?.messages ?? []}
                  pending={pending}
                  sendError={sendError}
                  notice={notice}
                  scopeName={scopeName}
                  onAsk={ask}
                  onRetry={ask}
                  onReset={reset}
                />
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}
