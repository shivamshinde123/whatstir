import type { Metadata } from "next";
import ThemeTrendsView from "@/components/ThemeTrendsView";

export const metadata: Metadata = { title: "Problem themes over time · Whatstir" };
export default function TrendsPage() { return <ThemeTrendsView />; }
