import type { Metadata } from "next";
import SectorComparisonView from "@/components/SectorComparisonView";
export const metadata: Metadata = { title: "Compare sectors · Whatstir" };
export default function CompareSectorsPage() { return <SectorComparisonView />; }
