import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "./components/PwaRegister";

export const metadata: Metadata = {
  title: "Pamus Grit English",
  description: "Pamus Grit Academy Management v2",

  manifest: "/manifest.webmanifest",
  applicationName: "Pamus Grit English",
  appleWebApp: {
    capable: true,
    title: "Pamus Grit",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/pamus-icon.svg",
  },
};


export const viewport = {
  themeColor: "#1f2b46",
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