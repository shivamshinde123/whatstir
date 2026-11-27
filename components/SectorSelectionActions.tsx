"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type Props = { selected: string[]; batch: string | null; onCancel: () => void };

export default function SectorSelectionActions({ selected, batch, onCancel }: Props) {
  const [open, setOpen] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const menuId = useId();
  const ready = selected.length >= 2;

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && disclosure.current && !disclosure.current.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      disclosure.current?.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const research = `/sector/${selected.join("+")}${batch ? `?${new URLSearchParams({ batch })}` : ""}`;
  const trends = new URLSearchParams({ sectors: selected.join(","), ...(batch ? { batch } : {}) });
  const noun = selected.length === 1 ? "sector" : "sectors";

  return (
    <section aria-label="Selected sectors" className="relative mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-separator bg-surface p-3 text-sm">
      <p role="status" className="mr-auto">
        {selected.length} {noun} selected{ready ? "" : ". Select at least two sectors."}
      </p>
      {ready && (
        <>
          <Link href={research} className="pressable rounded-full bg-black px-4 py-2 text-white">Research companies</Link>
          <details ref={disclosure} open={open}>
            <summary
              aria-controls={menuId}
              aria-expanded={open}
              className="cursor-pointer list-none rounded-full border border-separator bg-white px-4 py-2 [&::-webkit-details-marker]:hidden"
              onClick={(event) => {
                event.preventDefault();
                setOpen((value) => !value);
              }}
            >
              More analyses
            </summary>
            {open && (
              <nav id={menuId} aria-label="More analyses" className="absolute left-0 top-full z-30 mt-2 w-full rounded-lg border border-separator bg-white p-2 sm:left-auto sm:right-0 sm:w-80">
                {selected.length <= 4 ? (
                  <Link href={`/compare?${new URLSearchParams({ sectors: selected.join(",") })}`} className="block rounded-md p-3 hover:bg-surface">
                    <span className="font-semibold">Compare sectors</span>
                    <span className="mt-1 block text-xs text-text-secondary">Compare company counts, composition and statistics across all batches.</span>
                  </Link>
                ) : (
                  <div className="p-3">
                    <span className="text-text-secondary">Compare sectors</span>
                    <p className="mt-1 text-xs text-text-secondary">Select up to four sectors to compare statistics.</p>
                  </div>
                )}
                <Link href={`/themes/trends?${trends}`} className="block rounded-md p-3 hover:bg-surface">
                  <span className="font-semibold">View theme trends</span>
                  <span className="mt-1 block text-xs text-text-secondary">See how problem-theme shares change across batches.</span>
                </Link>
              </nav>
            )}
          </details>
        </>
      )}
      <button type="button" onClick={onCancel} className="rounded-full px-3 py-2 text-link underline">Cancel</button>
    </section>
  );
}
