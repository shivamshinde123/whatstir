import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Workspace from "@/components/Workspace";
import { db } from "@/lib/db";
import { getThemeHeader, parseThemeId } from "@/lib/themes";

export const metadata = { title: "Problem theme workspace · Whatstir" };

export default function ThemePage(props: PageProps<"/themes/[id]">) {
  return <Suspense fallback={<p role="status" className="p-8">Loading theme workspace…</p>}><ThemeContent {...props} /></Suspense>;
}

async function ThemeContent({ params }: PageProps<"/themes/[id]">) {
  await connection();
  const id = parseThemeId((await params).id);
  if (!id) notFound();
  const theme = await getThemeHeader(db(), id);
  if (!theme) notFound();
  return <Workspace sectorId={theme.sectorIds.join("+")} sectorName={theme.name} themeId={id} />;
}
