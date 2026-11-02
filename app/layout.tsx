import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Whatstir",
  description: "Explore Y Combinator startups by sector and the problems they solve.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
