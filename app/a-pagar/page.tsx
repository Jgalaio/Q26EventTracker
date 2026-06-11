import Link from "next/link";
import { redirect } from "next/navigation";
import { ROLE_LABELS } from "../auth-types";
import { getSession } from "../auth";
import { getTesourariaData, type MovimentoDetalhe } from "../supabase-data";

const moneyFormatter = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function movementLabel(tipo: MovimentoDetalhe["tipo"]) {
  if (tipo === "saida") return "Saída";
  return "A pagamento";
}

function isPendingPayment(movimento: MovimentoDetalhe) {
  return movimento.tipo !== "entrada" && movimento.pago === false;
}

export default async function PendingPaymentsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/a-pagar");
  if (session.role === "view") redirect("/overview");

  const { movimentos, error } = await getTesourariaData();
  const pendingPayments = movimentos
    .filter(isPendingPayment)
    .sort(
      (a, b) =>
        (a.data_pagamento ?? "").localeCompare(b.data_pagamento ?? "") ||
        a.evento_nome.localeCompare(b.evento_nome) ||
        a.item.localeCompare(b.item)
    );
  const pendingTotal = pendingPayments.reduce((sum, movimento) => sum + Number(movimento.montante ?? 0), 0);

  return (
    <main className="shell pending-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Q26</p>
          <h1>A pagar</h1>
        </div>
        <div className="top-actions">
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

      <section className="metrics pending-metrics" aria-label="Resumo de faturas por pagar">
        <article>
          <span>Faturas a pagamento</span>
          <strong>{pendingPayments.length}</strong>
        </article>
        <article>
          <span>Total em falta</span>
          <strong>{formatMoney(pendingTotal)}</strong>
        </article>
      </section>

      <section className="table-panel" aria-label="Registos por pagar">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Consulta</p>
            <h2>Registos com Pago = Não</h2>
          </div>
          <span>{formatMoney(pendingTotal)}</span>
        </div>

        <div className="table-wrap pending-table-wrap">
          <table className="outgoing-table pending-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Tipo</th>
                <th>Item</th>
                <th>Descrição</th>
                <th>Data</th>
                <th>Montante</th>
                <th>Pagamento</th>
                <th>Fatura</th>
                <th>Fatura C/NIF</th>
              </tr>
            </thead>
            <tbody>
              {pendingPayments.length ? (
                pendingPayments.map((movimento) => (
                  <tr className="pending-payment-row" key={movimento.id}>
                    <td>{movimento.evento_nome}</td>
                    <td>{movementLabel(movimento.tipo)}</td>
                    <td className="item-cell">{movimento.item}</td>
                    <td>{movimento.descricao ?? "-"}</td>
                    <td>{formatDate(movimento.data_pagamento)}</td>
                    <td className="money">{formatMoney(movimento.montante)}</td>
                    <td>{movimento.tipo_pagamento ?? "-"}</td>
                    <td>{movimento.numero_fatura ?? "-"}</td>
                    <td>{movimento.fatura_com_nif === null ? "-" : movimento.fatura_com_nif ? "Sim" : "Não"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty-movement-row" colSpan={9}>
                    Não existem faturas por pagar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
