import type { Metadata, Viewport } from "next";
import { Inter, Tinos, JetBrains_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SessionProvider } from "@/components/session-provider";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const tinos = Tinos({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-tinos",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI2LaTeX — Your notes, clearer documents.",
  description:
    "An academic document workspace: chat with AI, scan your notes, and export a publication-ready PDF without writing a line of LaTeX.",
};

export const viewport: Viewport = {
  themeColor: "#f8fafc",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${tinos.variable} ${mono.variable}`}>
      <body>
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
