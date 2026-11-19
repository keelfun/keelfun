import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { BRAND } from "@/lib/config";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${BRAND} — fair launches on Base`,
  description: "Launch a token on Base in one transaction: instant Uniswap v4 liquidity, LP locked forever, fees to you, your holders or a split.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://keelfun.app"),
  openGraph: { images: ["/og.png"], type: "website" },
  twitter: { card: "summary_large_image", images: ["/og.png"], site: "@keelfun" },
};

export const viewport: Viewport = { themeColor: "#05070d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-dvh antialiased`}>
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
