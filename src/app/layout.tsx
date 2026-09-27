import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Atkinson_Hyperlegible, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ResearchBackground } from "@/components/desk/research-background";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "KIVO — The Evidence Desk",
  description:
    "A local-first research workbench for discovering scholarly records, tracing citations, capturing source-grounded evidence, and synthesising literature reviews.",
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "KIVO — The Evidence Desk",
    description:
      "Discover scholarly records, trace citations, capture source-grounded evidence, and synthesise literature reviews. Local-first. No black boxes.",
    siteName: "KIVO",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eee8d5" },
    { media: "(prefers-color-scheme: dark)", color: "#002b36" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${bricolage.variable} ${atkinson.variable} ${plexMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ResearchBackground />
          {children}
          <Toaster position="bottom-right" offset={16} />
        </ThemeProvider>
      </body>
    </html>
  );
}
