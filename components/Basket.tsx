"use client";

import type { BasketCompany } from "@/lib/workspace";
import Logo from "./Logo";

const fmt = new Intl.NumberFormat("en-US");
const NONE: ReadonlySet<number> = new Set();

/**
 * The sector's companies as a scrolling wall of logos. `content-visibility: auto` lets the
 * browser skip off-screen cells, so thousands of companies stay fast without virtualisation.
 */
export default function Basket({
  companies,
  collected = NONE,
  inScope,
  query,
  onQuery,
  selectedId,
  onOpen,
  onCollapse,
}: {
  companies: BasketCompany[];
  /** Companies already in the results grid; their logos stay behind as faded ghosts. */
  collected?: ReadonlySet<number>;
  /** How many are in the current subcategory scope, before the name filter. */
  inScope: number;
  query: string;
  onQuery: (q: string) => void;
  selectedId: number | null;
  onOpen: (id: number, opener: HTMLElement) => void;
  /** Desktop only: folds the basket into a slim rail (decision 80). */
  onCollapse?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-4">
        <h2 className="text-tag text-text-secondary">Companies</h2>
        <span className="ml-auto text-sm tabular-nums text-text-secondary" aria-live="polite">
          {companies.length === inScope ? fmt.format(inScope) : `${fmt.format(companies.length)} of ${fmt.format(inScope)}`}
        </span>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse the company list"
            aria-expanded="true"
            aria-controls="company-basket"
            title="Collapse the company list"
            className="pressable hidden h-7 items-center gap-1 self-center rounded-full bg-bg px-2.5 text-sm font-medium text-text ring-1 ring-text-tertiary/60 transition-colors hover:bg-separator hover:ring-text-secondary lg:inline-flex"
          >
            <span aria-hidden="true" className="text-base leading-none">‹</span>
            Collapse
          </button>
        )}
      </div>
      <div className="px-4 pb-3 pt-2">
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter by name"
          aria-label="Filter companies by name"
          className="h-9 w-full rounded-lg border border-separator bg-bg px-3 text-sm outline-none focus:border-accent"
        />
      </div>

      {companies.length ? (
        <ul
          aria-label="Companies in this sector"
          className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1 overflow-y-auto px-2 pb-4"
        >
          {companies.map((c) => (
            <li key={c.id} style={{ contentVisibility: "auto", containIntrinsicSize: "76px 88px" }}>
              <button
                type="button"
                data-company-id={c.id}
                aria-current={selectedId === c.id || undefined}
                data-collected={collected.has(c.id) || undefined}
                title={c.name}
                onClick={(e) => onOpen(c.id, e.currentTarget)}
                className="pressable flex h-[88px] w-full flex-col items-center gap-1.5 rounded-xl px-1 pt-2 text-center transition-colors hover:bg-bg aria-[current]:bg-bg aria-[current]:ring-2 aria-[current]:ring-accent [&[data-collected]>:first-child]:opacity-35"
              >
                <Logo id={c.id} name={c.name} url={c.logoUrl} />
                <span className="line-clamp-2 w-full text-[11px] leading-tight">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-text-secondary">
          {query.trim() ? `No companies match “${query.trim()}”.` : "No companies in this group yet."}
        </p>
      )}
    </div>
  );
}
