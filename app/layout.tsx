import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tesouraria Q26",
  description: "Dashboard de tesouraria dos eventos Q26 ligado ao Supabase."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
