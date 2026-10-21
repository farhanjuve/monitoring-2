import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Pupuk Monitor",
  description: "Dashboard pemantauan stok pupuk dan galeri CCTV",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${inter.variable} ${sora.variable} font-sans`}>
        <AppShell>{children}</AppShell>
        <SpeedInsights />
      </body>
    </html>
  );
}
