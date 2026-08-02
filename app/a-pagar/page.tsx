import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getSession } from "../auth";
import { canViewTreasury } from "../auth-types";
import { getPendingPayments } from "../supabase-data";
import { TopbarActions } from "../topbar-actions";
import { TopbarBrand } from "../topbar-brand";
import { PendingPaymentsClient } from "./pending-payments-client";

export default async function PendingPaymentsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/a-pagar");
  if (!canViewTreasury(session)) redirect("/overview");

  const [pendingPayments, appLogo] = await Promise.all([getPendingPayments(), getAppLogo()]);

  return (
    <main className="shell pending-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Pagamentos em falta" />
        <TopbarActions active="a-pagar" session={session} />
      </section>

      {pendingPayments.error ? <section className="notice">Não consegui ligar ao Supabase. {pendingPayments.error}</section> : null}

      <PendingPaymentsClient initialMovimentos={pendingPayments.data} session={session} />
    </main>
  );
}
