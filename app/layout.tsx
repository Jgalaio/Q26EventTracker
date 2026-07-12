import type { Metadata } from "next";
import { getAppFavicon } from "./app-settings";
import { SessionTimeout } from "./session-timeout";
import "./globals.css";

const baseMetadata: Metadata = {
  title: "Tesouraria Q26",
  description: "Dashboard de tesouraria dos eventos Q26 ligado ao Supabase."
};

export async function generateMetadata(): Promise<Metadata> {
  const favicon = await getAppFavicon();
  return {
    ...baseMetadata,
    icons: favicon ? { icon: favicon.dataUrl } : undefined
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT">
      <body>
        <SessionTimeout />
        {children}
      </body>
    </html>
  );
}
