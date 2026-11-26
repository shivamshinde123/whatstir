import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Workspace from "@/components/Workspace";
import { parseSectorSet, sectorSetName } from "@/lib/sector-set";
import { SECTOR_NAMES } from "@/lib/sector";

// Pre-render single sectors. Combined sets are validated on demand without database access.
export function generateStaticParams() {
  return Object.keys(SECTOR_NAMES).map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/sector/[id]">): Promise<Metadata> {
  const ids = parseSectorSet((await params).id);
  const name = ids ? sectorSetName(ids) : null;
  return { title: name ? `${name} · Whatstir` : "Not found · Whatstir" };
}

export default function SectorPage(props: PageProps<"/sector/[id]">) {
  return <Suspense fallback={<div role="status" aria-label="Loading workspace" className="p-8 text-text-secondary">Loading workspace...</div>}>
    <SectorContent {...props} />
  </Suspense>;
}

async function SectorContent({ params, searchParams }: PageProps<"/sector/[id]">) {
  const { id } = await params;
  const ids = parseSectorSet(id);
  if (!ids) notFound();
  const key = ids.join("+");
  if (key !== decodeURIComponent(id)) {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(await searchParams)) {
      if (Array.isArray(value)) value.forEach((v) => query.append(name, v));
      else if (value !== undefined) query.set(name, value);
    }
    redirect(`/sector/${key}${query.size ? `?${query}` : ""}`);
  }
  return <Workspace sectorId={key} sectorName={sectorSetName(ids)} />;
}
