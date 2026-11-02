import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <h1 className="text-headline">This page doesn&apos;t exist.</h1>
        <p className="mt-3 text-text-secondary">The sector or page you were looking for isn&apos;t here.</p>
        <Link href="/" className="pressable mt-6 rounded-full bg-accent px-5 py-2 font-medium text-white">
          Browse all sectors
        </Link>
      </main>
    </>
  );
}
