"use client";

import { useEffect, useRef, useState } from "react";

const DELAY_MS = 350;
const GAP = 8;
const EDGE = 8;

type Tip = { text: string; x: number; y: number; below: boolean };

/**
 * One themed tooltip for the whole app, replacing the browser's native ones. Any element with a
 * `title` keeps it in the markup; while it's hovered (or focused from the keyboard) the title moves
 * to `data-tip`, so the browser's tooltip never appears, and this one shows instead.
 */
export default function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const restore = () => {
      window.clearTimeout(timer.current);
      const el = target.current;
      if (el?.dataset.tip !== undefined) {
        el.setAttribute("title", el.dataset.tip);
        delete el.dataset.tip;
        el.removeAttribute("aria-describedby");
      }
      target.current = null;
      setTip(null);
    };

    const show = (el: HTMLElement, delay: number) => {
      if (target.current === el) return;
      restore();
      const text = el.getAttribute("title");
      if (!text) return;
      el.dataset.tip = text;
      el.removeAttribute("title");
      target.current = el;
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const below = r.top < 48;
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + GAP : r.top - GAP, below });
        el.setAttribute("aria-describedby", "app-tooltip");
      }, delay);
    };

    const titled = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>("[title], [data-tip]") : null);

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = titled(e);
      if (el) show(el, DELAY_MS);
      else if (target.current) restore();
    };
    const onFocus = (e: FocusEvent) => {
      const el = titled(e);
      if (el && el.matches(":focus-visible")) show(el, 0);
    };
    const onOut = (e: Event) => {
      const next = (e as PointerEvent | FocusEvent).relatedTarget;
      if (target.current && !(next instanceof Node && target.current.contains(next))) restore();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") restore();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onOut);
    document.addEventListener("pointerdown", restore, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", restore, true);
    return () => {
      restore();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onOut);
      document.removeEventListener("pointerdown", restore, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", restore, true);
    };
  }, []);

  // Keep the bubble inside the viewport once its width is known.
  useEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    const left = Math.min(Math.max(tip.x - w / 2, EDGE), window.innerWidth - w - EDGE);
    el.style.left = `${left}px`;
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={box}
      id="app-tooltip"
      role="tooltip"
      className="app-tooltip"
      data-below={tip.below || undefined}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  );
}
