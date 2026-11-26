import type { Metadata } from "next";
import ThemesView from "@/components/ThemesView";

export const metadata: Metadata = { title: "Problem themes · Whatstir" };

export default function ThemesPage() {
  return <ThemesView />;
}
