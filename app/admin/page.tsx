import type { Metadata } from "next";
import AdminView from "@/components/AdminView";

export const metadata: Metadata = { title: "Data refresh · Whatstir" };

export default function AdminPage() {
  return <AdminView />;
}
