import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pamus Grit English",
  description: "Pamus Grit Academy Management v2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
