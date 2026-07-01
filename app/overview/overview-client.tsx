"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { AppLogo } from "../app-settings";
import { ROLE_LABELS, canAccessAdmin, canWrite, type AuthSession } from "../auth-types";
import { NotesMenu } from "../notes-menu";
import type { MovimentoDetalhe } from "../supabase-data";
import { TopbarBrand } from "../topbar-brand";
import { exportOverviewEventToExcel } from "./excel-export";

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

export type OverviewRow = Summary & {
  nome: string;
  slug: string;
  contabilizarTotais: boolean;
  movimentos: MovimentoDetalhe[];
};

type OverviewClientProps = {
  rows: OverviewRow[];
  totals: Summary;
  cashValue: number;
  physicalCashCount: number | null;
  error: string | null;
  session: AuthSession;
  appLogo: AppLogo | null;
};

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
  if (!value) return "-";
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function movementLabel(tipo: MovimentoDetalhe["tipo"]) {
  if (tipo === "entrada") return "Entrada";
  if (tipo === "saida") return "Saída";
  return "A pagamento";
}

function chartHeight(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) return "0%";
  return `${Math.max(8, (value / maxValue) * 100)}%`;
}

export function OverviewClient({ rows, totals, cashValue, physicalCashCount, error, session, appLogo }: OverviewClientProps) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const countedRows = rows.filter((row) => row.contabilizarTotais).length;
  const physicalCashDifference = physicalCashCount === null ? null : physicalCashCount - cashValue;
  const chartItems = [
    { label: "Entradas Totais", value: totals.entradas, className: "bar-blue" },
    { label: "Saídas Totais", value: totals.saidas, className: "bar-orange" },
    { label: "Pagamentos em falta", value: totals.aPagamento, className: "bar-muted" }
  ];
  const chartMax = Math.max(...chartItems.map((item) => item.value), 1);

  return (
    <main className="shell overview-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="OverView" />
        <div className="top-actions">
          <NotesMenu role={session.role} />
          {canAccessAdmin(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/admin">
              Admin
            </Link>
          ) : null}
          {canWrite(session.role) ? (
            <Link className="nav-button" href="/">
              Tesouraria
            </Link>
          ) : null}
          {canWrite(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/reports">
              Relatórios
            </Link>
          ) : null}
          {canWrite(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/facturacao">
              Fat.Finanças
            </Link>
          ) : null}
          {canWrite(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/fat-patrocinios">
              Fat. Patrocínios
            </Link>
          ) : null}
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

      <section className="overview-layout" aria-label="Resumo geral">
        <div className="overview-card-grid with-money-card">
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
          <article className={`payment-status-card ${totals.aPagamento > 0 ? "is-due" : "is-clear"}`}>
            <Link className="payment-card-link" href="/a-pagar">
              <span>Pagamentos em falta</span>
              <small>Valores pendentes</small>
              <strong>{formatMoney(totals.aPagamento)}</strong>
            </Link>
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
          <article className="overview-money-card">
            <span>Valor Dinheiro</span>
            <small>Lucro + Montante Q25 - Saldo Conta Q26</small>
            <strong className={cashValue >= 0 ? "value-green" : "value-red"}>{formatMoney(cashValue)}</strong>
          </article>
          <article className="overview-money-card">
            <span>Dif. Dinheiro Físico</span>
            <small>Contado: {physicalCashCount === null ? "Por preencher" : formatMoney(physicalCashCount)}</small>
            <strong className={physicalCashDifference === null || physicalCashDifference >= 0 ? "value-green" : "value-red"}>
              {physicalCashDifference === null ? "—" : formatMoney(physicalCashDifference)}
            </strong>
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
          <span>{countedRows} contabilizados / {rows.length} eventos</span>
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
                <th>Excel</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedSlug === row.slug;
                return (
                  <Fragment key={row.slug}>
                    <tr
                      className={[
                        "overview-summary-row",
                        isExpanded ? "expanded" : "",
                        row.contabilizarTotais ? "" : "not-counted"
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td className="item-cell">
                        <button
                          aria-expanded={isExpanded}
                          className="overview-event-toggle"
                          onClick={() => setExpandedSlug(isExpanded ? null : row.slug)}
                          type="button"
                        >
                          <span>{isExpanded ? "-" : "+"}</span>
                          {row.nome}
                        </button>
                        {!row.contabilizarTotais ? <span className="event-status-badge inline">Só registo</span> : null}
                      </td>
                      <td className="money">{formatMoney(row.entradas)}</td>
                      <td className="money">{formatMoney(row.saidas)}</td>
                      <td className="money">{formatMoney(row.aPagamento)}</td>
                      <td className={row.lucro >= 0 ? "money positive" : "money negative"}>{formatMoney(row.lucro)}</td>
                      <td className="money">{formatMoney(row.faturado)}</td>
                      <td className="money">{formatMoney(row.naoFaturado)}</td>
                      <td className="money">{formatMoney(row.pagoQ26)}</td>
                      <td className="money">{formatMoney(row.transferencias)}</td>
                      <td className="money">{formatMoney(row.dinheiro)}</td>
                      <td>
                        <button
                          className="overview-export-button"
                          onClick={() => exportOverviewEventToExcel(row)}
                          type="button"
                        >
                          Exportar Excel
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="overview-expanded-row">
                        <td colSpan={11}>
                          <div className="overview-movements">
                            <div className="overview-movements-heading">
                              <strong>{row.nome}</strong>
                              <span>{row.movimentos.length} movimentos</span>
                            </div>
                            <table className="overview-detail-table">
                              <thead>
                                <tr>
                                  <th>Tipo</th>
                                  <th>Item</th>
                                  <th>Data</th>
                                  <th>Montante</th>
                                  <th>Pagamento</th>
                                  <th>Fatura</th>
                                  <th>Fatura C/NIF</th>
                                  <th>Pago</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.movimentos.length ? (
                                  row.movimentos.map((movimento) => (
                                    <tr key={movimento.id}>
                                      <td>
                                        <span className={`pill ${movimento.tipo}`}>{movementLabel(movimento.tipo)}</span>
                                      </td>
                                      <td className="item-cell">{movimento.item}</td>
                                      <td>{formatDate(movimento.data_pagamento)}</td>
                                      <td className="money">{formatMoney(movimento.montante)}</td>
                                      <td>{movimento.tipo_pagamento ?? "-"}</td>
                                      <td>{movimento.numero_fatura ?? "-"}</td>
                                      <td>
                                        {movimento.fatura_com_nif === null
                                          ? "-"
                                          : movimento.fatura_com_nif
                                            ? "Sim"
                                            : "Não"}
                                      </td>
                                      <td>{movimento.pago === null ? "-" : movimento.pago ? "Sim" : "Não"}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td className="empty-movement-row" colSpan={8}>
                                      Sem movimentos neste evento.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="overview-total-row">
                <th scope="row">Totais</th>
                <td className="money">{formatMoney(totals.entradas)}</td>
                <td className="money">{formatMoney(totals.saidas)}</td>
                <td className="money">{formatMoney(totals.aPagamento)}</td>
                <td className="money">{formatMoney(totals.lucro)}</td>
                <td className="money">{formatMoney(totals.faturado)}</td>
                <td className="money">{formatMoney(totals.naoFaturado)}</td>
                <td className="money">{formatMoney(totals.pagoQ26)}</td>
                <td className="money">{formatMoney(totals.transferencias)}</td>
                <td className="money">{formatMoney(totals.dinheiro)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </main>
  );
}
