import Link from "next/link";
import { sectorColor } from "@/lib/sector-style";
import { isCompact, isTiny, type Tile } from "@/lib/treemap";

const fmt = new Intl.NumberFormat("en-US");
export const tileLabel = (t: Pick<Tile, "name" | "count">) =>
  `${t.name}, ${fmt.format(t.count)} ${t.count === 1 ? "company" : "companies"}`;

/** Absolutely positioned sector tiles. Each is a link into that sector's workspace. */
export default function Treemap({ tiles }: { tiles: Tile[] }) {
  return (
    <ul className="relative h-full w-full" aria-label="Sectors sized by number of companies">
      {tiles.map((t) => {
        const compact = isCompact(t);
        const tiny = isTiny(t);
        const color = sectorColor(t.id);
        return (
          <li
            key={t.id}
            className={`absolute ${tiny ? "p-px" : "p-[3px]"}`}
            style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
          >
            <Link
              href={`/sector/${t.id}`}
              aria-label={tileLabel(t)}
              title={tileLabel(t)}
              data-compact={compact || undefined}
              className={`pressable flex h-full w-full flex-col justify-between overflow-hidden bg-[var(--tile-bg)] transition-[background-color] duration-200 hover:bg-[var(--tile-hover)] ${tiny ? "rounded-md p-0" : "rounded-xl p-3"}`}
              style={{
                ["--tile-bg" as string]: `color-mix(in srgb, ${color} 14%, var(--bg))`,
                ["--tile-hover" as string]: `color-mix(in srgb, ${color} 24%, var(--bg))`,
              }}
            >
              {compact ? (
                <span className={`m-auto font-semibold tabular-nums ${tiny ? "text-[11px]" : "text-sm"}`}>
                  {fmt.format(t.count)}
                </span>
              ) : (
                <>
                  <span className="truncate text-[15px] font-semibold leading-tight">{t.name}</span>
                  <span
                    className="font-semibold tabular-nums leading-none tracking-tight"
                    // Mixed toward the text colour: darker in light mode, lighter in dark, for contrast.
                    style={{
                      color: `color-mix(in srgb, ${color} 72%, var(--text))`,
                      fontSize: t.h > 160 && t.w > 220 ? "2.5rem" : "1.5rem",
                    }}
                  >
                    {fmt.format(t.count)}
                  </span>
                </>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
