import type { SubcategoryInfo } from "@/lib/workspace";

const fmt = new Intl.NumberFormat("en-US");

/** Chips that narrow the basket: All, AI, the problem groups, Unclassified. Never touches the grid. */
export default function SubcategoryBar({
  total,
  subcategories,
  selected,
  onSelect,
}: {
  total: number;
  subcategories: SubcategoryInfo[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const chips = [{ id: null as number | null, name: "All", count: total, description: null as string | null }].concat(
    subcategories.map((s) => ({ id: s.id, name: s.name, count: s.count, description: s.description })),
  );

  return (
    <div className="mt-3">
      <div role="group" aria-label="Narrow by subcategory" className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.id ?? "all"}
            type="button"
            aria-pressed={selected === c.id}
            title={c.description ?? undefined}
            onClick={() => onSelect(c.id)}
            className="pressable whitespace-nowrap rounded-full border border-separator px-3 py-1 text-[0.8125rem] transition-colors hover:bg-surface aria-pressed:border-transparent aria-pressed:bg-text aria-pressed:text-bg"
          >
            {c.name} <span className="tabular-nums opacity-60">{fmt.format(c.count)}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-caption text-text-secondary">
        {subcategories.length
          ? "Groups are AI-suggested, not official YC categories. A company can be in more than one, so counts can overlap."
          : "Groups haven't been generated for this sector yet."}
      </p>
    </div>
  );
}
