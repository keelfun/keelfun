import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { StatusBar } from "@/components/StatusBar";
import { BRAND } from "@/lib/config";
import { THEME_BOOT } from "@/lib/theme";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-serif-face", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: `${BRAND} — fair launches on Base`,
  description: "Launch a token on Base in one transaction: instant Uniswap v4 liquidity, LP locked forever, fees to you, your holders or a split.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://keelfun.app"),
  openGraph: { images: ["/og.png"], type: "website" },
  twitter: { card: "summary_large_image", images: ["/og.png"], site: "@Keelfunxyz" },
};

export const viewport: Viewport = { themeColor: "#05070d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${serif.variable} flex min-h-dvh flex-col overflow-x-clip antialiased lg:pb-8`}>
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 sm:px-6">{children}</main>
          <Footer />
          <StatusBar />
        </Providers>
      </body>
    </html>
  );
}
