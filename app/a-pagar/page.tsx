import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getSession } from "../auth";
import { getTesourariaData, type MovimentoDetalhe } from "../supabase-data";
import { TopbarActions } from "../topbar-actions";
import { TopbarBrand } from "../topbar-brand";
import { PendingPaymentsClient } from "./pending-payments-client";

function isPendingPayment(movimento: MovimentoDetalhe) {
  return movimento.tipo !== "entrada" && movimento.pago === false;
}

export default async function PendingPaymentsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/a-pagar");
  if (session.role === "view") redirect("/overview");

  const [{ movimentos, error }, appLogo] = await Promise.all([getTesourariaData(), getAppLogo()]);
  const pendingPayments = movimentos
    .filter(isPendingPayment)
    .sort(
      (a, b) =>
        (a.data_pagamento ?? "").localeCompare(b.data_pagamento ?? "") ||
        a.evento_nome.localeCompare(b.evento_nome) ||
        a.item.localeCompare(b.item)
    );

  return (
    <main className="shell pending-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Pagamentos em falta" />
        <TopbarActions active="a-pagar" session={session} />
      </section>

      {error ? <section className="notice">Não consegui ligar ao Supabase. {error}</section> : null}

      <PendingPaymentsClient initialMovimentos={pendingPayments} role={session.role} />
    </main>
  );
}
