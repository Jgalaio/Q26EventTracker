import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { ROLE_LABELS } from "../auth-types";
import { getSession } from "../auth";
import { NotesMenu } from "../notes-menu";
import { getTesourariaData, type MovimentoDetalhe } from "../supabase-data";
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
        <div className="top-actions">
          <NotesMenu role={session.role} />
          <Link className="nav-button" href="/">
            Tesouraria
          </Link>
          <Link className="nav-button secondary-nav-button" href="/overview">
            OverView
          </Link>
          <Link className="nav-button secondary-nav-button" href="/reports">
            Relatórios
          </Link>
          <div className="user-chip">
            <span>{session.username}</span>
            <strong>{ROLE_LABELS[session.role]}</strong>
          </div>
          <form action="/api/logout" method="post">
            <button className="logout-button" type="submit">
              Sair
            </button>
          </form>
        </div>
      </section>

      {error ? <section className="notice">Não consegui ligar ao Supabase. {error}</section> : null}

      <PendingPaymentsClient initialMovimentos={pendingPayments} role={session.role} />
    </main>
  );
}
