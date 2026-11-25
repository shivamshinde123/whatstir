import type { Metadata } from "next";
import FoundersView from "@/components/FoundersView";

export const metadata: Metadata = { title: "Repeat founders · Whatstir" };

export default function FoundersPage() {
  return <FoundersView />;
}
