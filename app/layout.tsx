import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { getAppFavicon } from "./app-settings";
import { getSession } from "./auth";
import { SessionTimeout } from "./session-timeout";
import { getPendingWhatsNew } from "./whats-new";
import { WhatsNewPopup } from "./whats-new-popup";
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const pendingWhatsNew = session ? await getPendingWhatsNew(session.username) : null;

  return (
    <html lang="pt-PT">
      <body>
        <SessionTimeout />
        {children}
        <WhatsNewPopup release={pendingWhatsNew} username={session?.username ?? null} />
        <Analytics />
      </body>
    </html>
  );
}
