import type { Metadata } from "next";
import "./globals.css";
import { THEME_KEY } from "@/lib/theme";

// Runs before first paint, so a saved dark choice never flashes the light theme.
const applySavedTheme = `try{if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export const metadata: Metadata = {
  title: "Whatstir",
  description: "Explore Y Combinator startups by sector and the problems they solve.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The script above may set data-theme before React hydrates.
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applySavedTheme }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
