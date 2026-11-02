/** Apple system colours, one per sector, used as soft tints on the treemap. */
const COLORS: Record<string, string> = {
  b2b: "#007aff", // blue
  consumer: "#ff2d55", // pink
  fintech: "#34c759", // green
  healthcare: "#30b0c7", // teal
  industrials: "#ff9500", // orange
  education: "#af52de", // purple
  "real-estate-and-construction": "#a2845e", // brown
  government: "#5856d6", // indigo
  other: "#8e8e93", // gray
};

export const sectorColor = (id: string): string => COLORS[id] ?? COLORS.other;
