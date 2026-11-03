"use client";

import { useLayoutEffect, useRef } from "react";
import type { Tile } from "@/lib/session";
import Logo from "./Logo";

const fmt = new Intl.NumberFormat("en-US");

const FLIGHT_MS = 600;
/** Critically damped spring (Apple: damping 1, response 0.4 s), sampled into a CSS easing. */
const SPRING = `linear(${Array.from({ length: 21 }, (_, i) => {
  const t = (i / 20) * (FLIGHT_MS / 1000);
  const w = (2 * Math.PI) / 0.4;
  return i === 20 ? 1 : +(1 - (1 + w * t) * Math.exp(-w * t)).toFixed(4);
}).join(", ")})`;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Flies each new tile's logo in from its spot in the basket (or from the basket's centre when
 * that logo isn't on screen there). The flight is a fixed-position clone, so the real tile is in
 * place and clickable from the first frame; its own logo appears as the clone lands.
 */
function fly(grid: HTMLElement, ids: number[]) {
  const tiles = ids
    .map((id) => grid.querySelector<HTMLElement>(`[data-tile-id="${id}"]`))
    .filter((t): t is HTMLElement => t !== null && typeof t.animate === "function");
  if (!tiles.length) return;
  tiles[0].scrollIntoView({ block: "nearest" });

  if (reducedMotion()) {
    for (const t of tiles) t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
    return;
  }

  const basket = document.querySelector<HTMLElement>('[aria-label="Companies in this sector"]');
  const area = basket?.getBoundingClientRect();
  tiles.forEach((tile, i) => {
    const logo = tile.querySelector<HTMLElement>("[data-logo]");
    if (!logo) return;
    const to = logo.getBoundingClientRect();
    const source = basket?.querySelector(`[data-company-id="${tile.dataset.tileId}"] > :first-child`);
    let from = source?.getBoundingClientRect();
    const onScreen = from && area && from.bottom > area.top && from.top < area.bottom && from.width > 0;
    if (!onScreen) {
      if (!area) return;
      from = new DOMRect(area.x + area.width / 2 - to.width / 2, area.y + area.height / 2 - to.height / 2, to.width, to.height);
    }

    const clone = logo.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-logo");
    clone.setAttribute("aria-hidden", "true");
    clone.dataset.flight = "";
    Object.assign(clone.style, {
      position: "fixed",
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      margin: "0",
      zIndex: "50",
      pointerEvents: "none",
      transformOrigin: "top left",
    });
    document.body.append(clone);
    const delay = Math.min(i, 12) * 35;
    const dx = from!.left - to.left;
    const dy = from!.top - to.top;
    const s = from!.width / to.width;
    clone
      .animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: "none" }], {
        duration: FLIGHT_MS,
        delay,
        easing: SPRING,
        fill: "backwards",
      })
      .finished.catch(() => {})
      .finally(() => clone.remove());
    // The real logo stays hidden until the clone lands on it.
    logo.animate([{ opacity: 0 }, { opacity: 0, offset: 0.99 }, { opacity: 1 }], { duration: FLIGHT_MS + delay });
  });
}

/** The session's one cumulative grid. Tiles keep their order; only new ones animate in. */
export default function ResultsGrid({
  tiles,
  cited,
  fresh,
  onOpen,
}: {
  tiles: Tile[];
  /** Companies cited by the latest answer; ringed. */
  cited: ReadonlySet<number>;
  /** Companies the latest answer added; these fly in. */
  fresh: ReadonlySet<number>;
  onOpen: (id: number, opener: HTMLElement) => void;
}) {
  const grid = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    if (grid.current && fresh.size) fly(grid.current, [...fresh]);
  }, [fresh]);

  if (!tiles.length) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-separator p-6 text-center">
        <p className="font-medium">Ask a question to start collecting companies.</p>
        <p className="mt-1 max-w-sm text-sm text-text-secondary">
          Companies an answer relies on will gather here, and stay as you keep asking.
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-h-[60vh] min-h-48 flex-col rounded-[var(--radius-card)] border border-separator lg:h-full lg:max-h-none">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-4">
        <h2 className="font-semibold">Results</h2>
        <span className="text-sm tabular-nums text-text-secondary" aria-live="polite" data-testid="results-count">
          {fmt.format(tiles.length)} {tiles.length === 1 ? "company" : "companies"}
        </span>
      </div>
      {cited.size > 0 && (
        <p className="px-4 pt-1 text-caption text-text-secondary">
          <span aria-hidden="true" className="mr-1 inline-block size-2 rounded-full bg-accent align-middle" />
          Ringed: cited by the latest answer
        </p>
      )}
      <ul
        ref={grid}
        aria-label="Results grid"
        className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2 overflow-y-auto p-3"
      >
        {tiles.map((t) => (
          <li key={t.companyId}>
            <button
              type="button"
              data-tile-id={t.companyId}
              data-new={fresh.has(t.companyId) || undefined}
              data-cited={cited.has(t.companyId) || undefined}
              aria-label={cited.has(t.companyId) ? `${t.name}, cited by the latest answer` : t.name}
              title={t.name}
              onClick={(e) => onOpen(t.companyId, e.currentTarget)}
              className="pressable flex h-[112px] w-full flex-col items-center gap-2 rounded-2xl bg-surface px-2 pt-3 text-center transition-shadow hover:bg-bg data-[cited]:ring-2 data-[cited]:ring-accent"
            >
              <span data-logo className="inline-flex">
                <Logo id={t.companyId} name={t.name} url={t.logoUrl} size={48} />
              </span>
              <span className="line-clamp-2 w-full text-xs leading-tight">{t.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
