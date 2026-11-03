import type { Metadata } from "next";
import { Fragment_Mono, Inter, Newsreader } from "next/font/google";
import "./globals.css";
// Style trial: light only, so there is no theme script or switch.

// Self-hosted at build time by next/font, so no runtime requests to Google.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const newsreader = Newsreader({ subsets: ["latin"], weight: ["300"], variable: "--font-newsreader" });
const fragmentMono = Fragment_Mono({ subsets: ["latin"], weight: "400", variable: "--font-fragment-mono" });

export const metadata: Metadata = {
  title: "Whatstir",
  description: "Explore Y Combinator startups by sector and the problems they solve.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${newsreader.variable} ${fragmentMono.variable}`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
