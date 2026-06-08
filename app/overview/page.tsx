import Link from "next/link";
import { getTesourariaData, type EventoResumo, type MovimentoDetalhe } from "../supabase-data";

type Summary = {
  entradas: number;
  saidas: number;
  aPagamento: number;
  lucro: number;
  faturado: number;
  naoFaturado: number;
  pagoQ26: number;
  transferencias: number;
  dinheiro: number;
};

type OverviewRow = Summary & {
  nome: string;
  slug: string;
};

const moneyFormatter = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2
});

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function normalizePayment(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

function emptySummary(): Summary {
  return {
    entradas: 0,
    saidas: 0,
    aPagamento: 0,
    lucro: 0,
    faturado: 0,
    naoFaturado: 0,
    pagoQ26: 0,
    transferencias: 0,
    dinheiro: 0
  };
}

function addMovimento(summary: Summary, movimento: MovimentoDetalhe) {
  const amount = Number(movimento.montante ?? 0);

  if (movimento.tipo === "entrada") {
    summary.entradas += amount;
    return;
  }

  if (movimento.tipo === "a_pagamento") {
    summary.aPagamento += amount;
  } else {
    summary.saidas += amount;
  }

  if (movimento.fatura_com_nif === true) summary.faturado += amount;
  if (movimento.fatura_com_nif === false) summary.naoFaturado += amount;

  const payment = normalizePayment(movimento.tipo_pagamento);
  if (payment === "c q26") summary.pagoQ26 += amount;
  if (payment === "transferencia") summary.transferencias += amount;
  if (payment === "dinheiro") summary.dinheiro += amount;
}

function finalizeSummary(summary: Summary) {
  summary.lucro = summary.entradas - summary.saidas;
  return summary;
}

function summarizeEvent(event: EventoResumo, movimentos: MovimentoDetalhe[]): OverviewRow {
  const summary = finalizeSummary(
    movimentos.reduce((acc, movimento) => {
      addMovimento(acc, movimento);
      return acc;
    }, emptySummary())
  );

  return {
    slug: event.slug,
    nome: event.nome,
    ...summary
  };
}

function chartHeight(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) return "0%";
  return `${Math.max(8, (value / maxValue) * 100)}%`;
}

export default async function OverviewPage() {
  const { eventos, movimentos, error } = await getTesourariaData();
  const eventList = eventos
    .filter((event) => event.slug !== "contas")
    .sort((a, b) => a.ordem_folha - b.ordem_folha);

  const rows = eventList.map((event) =>
    summarizeEvent(
      event,
      movimentos.filter((movimento) => movimento.evento_slug === event.slug)
    )
  );

  const totals = finalizeSummary(
    rows.reduce((acc, row) => {
      acc.entradas += row.entradas;
      acc.saidas += row.saidas;
      acc.aPagamento += row.aPagamento;
      acc.faturado += row.faturado;
      acc.naoFaturado += row.naoFaturado;
      acc.pagoQ26 += row.pagoQ26;
      acc.transferencias += row.transferencias;
      acc.dinheiro += row.dinheiro;
      return acc;
    }, emptySummary())
  );

  const chartItems = [
    { label: "Entradas Totais", value: totals.entradas, className: "bar-blue" },
    { label: "Saídas Totais", value: totals.saidas, className: "bar-orange" },
    { label: "A Pagamento Total", value: totals.aPagamento, className: "bar-muted" }
  ];
  const chartMax = Math.max(...chartItems.map((item) => item.value), 1);

  return (
    <main className="shell overview-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Q26</p>
          <h1>OverView</h1>
        </div>
        <div className="top-actions">
          <Link className="nav-button" href="/">
            Tesouraria
          </Link>
          <div className="status">
            <span className="status-dot" />
            Supabase
          </div>
        </div>
      </section>

      {error ? <section className="notice">Não consegui ligar ao Supabase. {error}</section> : null}

      <section className="overview-layout" aria-label="Resumo geral">
        <div className="overview-card-grid">
          <article>
            <span>Resumo Totais</span>
            <small>Entradas Totais</small>
            <strong className="value-blue">{formatMoney(totals.entradas)}</strong>
          </article>
          <article>
            <span>Resumo Faturados</span>
            <small>Faturados Totais</small>
            <strong className="value-green">{formatMoney(totals.faturado)}</strong>
          </article>
          <article>
            <span>Saídas Totais</span>
            <small>Despesas totais</small>
            <strong className="value-blue">{formatMoney(totals.saidas)}</strong>
          </article>
          <article>
            <span>Não Faturados Totais</span>
            <small>Fatura C/NIF: Não</small>
            <strong className="value-red">{formatMoney(totals.naoFaturado)}</strong>
          </article>
          <article>
            <span>A Pagamento Total</span>
            <small>Valores pendentes</small>
            <strong className="value-blue">{formatMoney(totals.aPagamento)}</strong>
          </article>
          <article>
            <span>Pago Conta Q26</span>
            <small>C. Q26</small>
            <strong className="value-purple">{formatMoney(totals.pagoQ26)}</strong>
          </article>
          <article>
            <span>Saldo Total</span>
            <small>Lucro final</small>
            <strong className={totals.lucro >= 0 ? "value-green" : "value-red"}>{formatMoney(totals.lucro)}</strong>
          </article>
          <article>
            <span>Transferencias</span>
            <small>Pagas por transferencia</small>
            <strong className="value-green">{formatMoney(totals.transferencias)}</strong>
          </article>
        </div>

        <section className="chart-panel" aria-label="Gráfico de barras dos totais">
          <div className="chart-heading">
            <div>
              <p className="eyebrow">Gráfico</p>
              <h2>Totais gerais</h2>
            </div>
          </div>
          <div className="bar-chart" aria-label="Entradas, saídas e a pagamento">
            {chartItems.map((item) => (
              <div className="bar-column" key={item.label}>
                <div className="bar-track">
                  <div className={`chart-bar ${item.className}`} style={{ height: chartHeight(item.value, chartMax) }}>
                    <span>{formatMoney(item.value)}</span>
                  </div>
                </div>
                <strong>{item.label}</strong>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            {chartItems.map((item) => (
              <span key={item.label}>
                <i className={item.className} />
                {item.label}
              </span>
            ))}
          </div>
        </section>
      </section>

      <section className="overview-table-panel" aria-label="Resumo por evento">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Eventos</p>
            <h2>Panorama por evento</h2>
          </div>
          <span>{rows.length} eventos</span>
        </div>
        <div className="table-wrap overview-table-wrap">
          <table className="overview-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Entradas</th>
                <th>Saídas</th>
                <th>A Pagamento</th>
                <th>Lucro</th>
                <th>Faturado</th>
                <th>Não Faturado</th>
                <th>Pag. C.Q26</th>
                <th>Transferencias</th>
                <th>Dinheiro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slug}>
                  <td className="item-cell">{row.nome}</td>
                  <td className="money">{formatMoney(row.entradas)}</td>
                  <td className="money">{formatMoney(row.saidas)}</td>
                  <td className="money">{formatMoney(row.aPagamento)}</td>
                  <td className={row.lucro >= 0 ? "money positive" : "money negative"}>{formatMoney(row.lucro)}</td>
                  <td className="money">{formatMoney(row.faturado)}</td>
                  <td className="money">{formatMoney(row.naoFaturado)}</td>
                  <td className="money">{formatMoney(row.pagoQ26)}</td>
                  <td className="money">{formatMoney(row.transferencias)}</td>
                  <td className="money">{formatMoney(row.dinheiro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
