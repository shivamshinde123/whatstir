import Link from "next/link";
import { sectorColor } from "@/lib/sector-style";
import { isCompact, isTiny, type Tile } from "@/lib/treemap";

const fmt = new Intl.NumberFormat("en-US");
export const tileLabel = (t: Pick<Tile, "name" | "count">) =>
  `${t.name}, ${fmt.format(t.count)} ${t.count === 1 ? "company" : "companies"}`;

/** Absolutely positioned sector tiles. Each is a link into that sector's workspace. */
export default function Treemap({ tiles, query = "", selected = [], onToggle }: { tiles: Tile[]; query?: string; selected?: string[]; onToggle?: (id: string) => void }) {
  return (
    <ul className="relative h-full w-full" aria-label="Sectors sized by number of companies">
      {tiles.map((t) => {
        const TileElement = onToggle ? "button" : Link;
        const compact = isCompact(t);
        const tiny = isTiny(t);
        const color = sectorColor(t.id);
        return (
          <li
            key={t.id}
            className={`absolute ${tiny ? "p-px" : "p-[3px]"}`}
            style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
          >
            <TileElement
              href={`/sector/${t.id}${query}`}
              type={onToggle ? "button" : undefined}
              aria-pressed={onToggle ? selected.includes(t.id) : undefined}
              onClick={onToggle ? () => onToggle(t.id) : undefined}
              aria-label={tileLabel(t)}
              title={tileLabel(t)}
              data-compact={compact || undefined}
              className={`pressable text-left aria-pressed:ring-2 aria-pressed:ring-accent flex h-full w-full flex-col justify-between overflow-hidden border border-separator bg-[var(--tile-bg)] transition-[background-color] duration-200 hover:bg-[var(--tile-hover)] ${tiny ? "rounded-[4px] p-0" : "rounded-[10px] p-4"}`}
              style={{
                ["--tile-bg" as string]: `color-mix(in srgb, ${color} 14%, var(--bg))`,
                ["--tile-hover" as string]: `color-mix(in srgb, ${color} 24%, var(--bg))`,
              }}
            >
              {compact ? (
                <span className={`m-auto font-semibold tabular-nums ${tiny ? "text-[11px]" : "text-sm"}`}>
                  {onToggle && selected.includes(t.id) ? "\u2713 " : ""}{fmt.format(t.count)}
                </span>
              ) : (
                <>
                  <span className="text-tag truncate">
                    {t.name} <span aria-hidden="true">{onToggle ? (selected.includes(t.id) ? "\u2713" : "+") : "\u2192"}</span>
                  </span>
                  <span
                    className="font-medium tabular-nums leading-none tracking-[-0.03em]"
                    // Mixed toward the text colour, for contrast.
                    style={{
                      color: `color-mix(in srgb, ${color} 72%, var(--text))`,
                      fontSize: t.h > 160 && t.w > 220 ? "3.3rem" : "1.625rem",
                    }}
                  >
                    {fmt.format(t.count)}
                  </span>
                </>
              )}
            </TileElement>
          </li>
        );
      })}
    </ul>
  );
}
