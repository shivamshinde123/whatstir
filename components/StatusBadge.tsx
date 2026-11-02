const COLORS: Record<string, string> = {
  Active: "#34c759",
  Acquired: "#007aff",
  Public: "#af52de",
  Inactive: "#8e8e93",
};

export default function StatusBadge({ status }: { status: string | null }) {
  const label = status ?? "Status unknown";
  const color = (status && COLORS[status]) ?? COLORS.Inactive;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 16%, var(--bg))`,
        color: `color-mix(in srgb, ${color} 70%, var(--text))`,
      }}
    >
      {label}
    </span>
  );
}
