import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Workspace from "@/components/Workspace";
import { SECTOR_NAMES } from "@/lib/sector";

// The nine sectors are known ahead of time; anything else is a 404 without touching the database.
export function generateStaticParams() {
  return Object.keys(SECTOR_NAMES).map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/sector/[id]">): Promise<Metadata> {
  const name = SECTOR_NAMES[(await params).id];
  return { title: name ? `${name} · Whatstir` : "Not found · Whatstir" };
}

export default async function SectorPage({ params }: PageProps<"/sector/[id]">) {
  const { id } = await params;
  const name = SECTOR_NAMES[id];
  if (!name) notFound();
  return <Workspace sectorId={id} sectorName={name} />;
}
