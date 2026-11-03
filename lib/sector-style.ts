/** Botanical specimen colours (style trial), one per sector, used as soft tints on the treemap. */
const COLORS: Record<string, string> = {
  b2b: "#4a6d47", // Sage Leaf
  consumer: "#c27c93", // Rose Clay
  fintech: "#2b6b5e", // Deep Teal
  healthcare: "#729d92", // Sage Foam
  industrials: "#80581c", // Amber Pin
  education: "#991e4b", // Crimson Specimen
  "real-estate-and-construction": "#ad9d80", // Sand
  government: "#2b390a", // Olive Press
  other: "#6b7860", // Sage Gray
};

export const sectorColor = (id: string): string => COLORS[id] ?? COLORS.other;
