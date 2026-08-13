import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "./components/PwaRegister";

export const metadata: Metadata = {
  title: "PAMUS GRIT",
  description: "Pamus Grit Academy Management v2",

  manifest: "/manifest.webmanifest",
  applicationName: "PAMUS GRIT",
  appleWebApp: {
    capable: true,
    title: "PAMUS GRIT",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};


export const viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <PwaRegister />{children}</body>
    </html>
  );
}