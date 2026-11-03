import type { SubcategoryInfo } from "@/lib/workspace";

const fmt = new Intl.NumberFormat("en-US");

/** A dropdown that narrows the basket: All, AI, the problem groups, Unclassified. Never touches the grid. */
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
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <select
        aria-label="Subcategory"
        // Native option tooltips can't be styled, so the chosen group's description shows on the select.
        title={subcategories.find((s) => s.id === selected)?.description ?? undefined}
        value={selected ?? ""}
        onChange={(e) => onSelect(e.target.value === "" ? null : Number(e.target.value))}
        className="pressable max-w-[22rem] rounded-full border border-separator bg-bg py-1 pl-3 pr-8 text-sm"
      >
        <option value="">All · {fmt.format(total)}</option>
        {subcategories.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {fmt.format(s.count)}
          </option>
        ))}
      </select>
      <p className="text-caption text-text-secondary">
        {subcategories.length
          ? "AI-suggested groups, not official YC categories; counts can overlap."
          : "Groups haven't been generated for this sector yet."}
      </p>
    </div>
  );
}
