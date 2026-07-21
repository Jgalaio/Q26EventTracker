import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getSession } from "../auth";
import { canViewSupport, isViewOnly } from "../auth-types";
import { getVisibleSupportTickets } from "../support-tickets";
import { TopbarActions } from "../topbar-actions";
import { TopbarBrand } from "../topbar-brand";
import { SupportClient } from "./support-client";

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/suporte");
  if (isViewOnly(session)) redirect("/overview");
  if (!canViewSupport(session)) redirect("/");

  const [appLogo, tickets] = await Promise.all([getAppLogo(), getVisibleSupportTickets(session)]);

  return (
    <main className="shell support-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Suporte" />
        <TopbarActions active="suporte" session={session} />
      </section>

      <SupportClient initialTickets={tickets} session={session} />
    </main>
  );
}
