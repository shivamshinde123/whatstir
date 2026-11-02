"use client";

import { useState } from "react";

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** Stable hue per company so the fallback tile is recognisable but not random between renders. */
const hue = (id: number) => (id * 47) % 360;

/**
 * Company logo, or its initials when there's no logo or it fails to load. Decorative: the
 * company name is always shown next to it, so the image itself has empty alt text.
 */
export default function Logo({
  id,
  name,
  url,
  size = 40,
}: {
  id: number;
  name: string;
  url: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const box = { width: size, height: size };

  if (!url || failed) {
    const h = hue(id);
    return (
      <span
        aria-hidden="true"
        data-fallback="initials"
        className="inline-flex shrink-0 items-center justify-center rounded-[22%] font-semibold"
        style={{
          ...box,
          fontSize: size * 0.38,
          backgroundColor: `color-mix(in srgb, hsl(${h} 65% 50%) 16%, var(--bg))`,
          color: `color-mix(in srgb, hsl(${h} 65% 45%) 72%, var(--text))`,
        }}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote logos, thousands of them; next/image adds nothing here
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      data-loaded={loaded || undefined}
      // White backing only once loaded (many logos are transparent and drawn for white).
      className={`shrink-0 rounded-[22%] object-contain ${loaded ? "bg-white" : "bg-surface"}`}
      style={box}
    />
  );
}
