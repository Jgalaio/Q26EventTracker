"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ReportLogo } from "../app-settings";
import { ROLE_LABELS, canAccessAdmin, type AuthSession } from "../auth-types";
import type { EventoResumo, MovimentoDetalhe } from "../supabase-data";

type ReportScope = "geral" | "evento";

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

type ReportEvent = {
  event: EventoResumo;
  movimentos: MovimentoDetalhe[];
  summary: Summary;
};

type ReportsClientProps = {
  eventos: EventoResumo[];
  movimentos: MovimentoDetalhe[];
  error: string | null;
  session: AuthSession;
  generatedAt: string;
  reportLogo: ReportLogo | null;
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

function normalizePayment(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

function isContaPayment(value: string | null | undefined) {
  const payment = normalizePayment(value);
  return payment === "transferencia" || payment === "c q26";
}

function isEventCounted(event: EventoResumo) {
  if (typeof event.contabilizar_totais === "boolean") return event.contabilizar_totais;
  return event.slug !== "decoracao";
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

function summarizeMovimentos(movimentos: MovimentoDetalhe[]) {
  return finalizeSummary(
    movimentos.reduce((summary, movimento) => {
      addMovimento(summary, movimento);
      return summary;
    }, emptySummary())
  );
}

function chartHeight(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) return "0%";
  return `${Math.max(9, (value / maxValue) * 100)}%`;
}

function barWidth(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) return "0%";
  return `${Math.max(2, (value / maxValue) * 100)}%`;
}

function eventPie(summary: Summary) {
  const entradas = Math.max(0, summary.entradas);
  const saidas = Math.max(0, summary.saidas);
  const total = entradas + saidas;
  const entradasPercent = total > 0 ? Math.round((entradas / total) * 100) : 0;
  const saidasPercent = total > 0 ? 100 - entradasPercent : 0;

  return {
    entradasPercent,
    saidasPercent,
    background:
      total > 0
        ? `conic-gradient(#1f66e5 0 ${entradasPercent}%, #93b7f4 ${entradasPercent}% 100%)`
        : "conic-gradient(#d8e5ff 0 100%)"
  };
}

export function ReportsClient({ eventos, movimentos, error, session, generatedAt, reportLogo }: ReportsClientProps) {
  const eventList = useMemo(() => {
    return eventos
      .filter((event) => event.slug !== "contas")
      .sort((a, b) => a.ordem_folha - b.ordem_folha);
  }, [eventos]);
  const [reportScope, setReportScope] = useState<ReportScope>("geral");
  const [selectedSlug, setSelectedSlug] = useState(() => eventList[0]?.slug ?? "");

  const reportEvents = useMemo<ReportEvent[]>(() => {
    return eventList.map((event) => {
      const eventMovimentos = movimentos.filter((movimento) => movimento.evento_slug === event.slug);
      return {
        event,
        movimentos: eventMovimentos,
        summary: summarizeMovimentos(eventMovimentos)
      };
    });
  }, [eventList, movimentos]);

  const selectedEvent = useMemo(() => {
    return reportEvents.find((item) => item.event.slug === selectedSlug) ?? reportEvents[0] ?? null;
  }, [reportEvents, selectedSlug]);

  const visibleEvents = useMemo(() => {
    if (reportScope === "geral") return reportEvents;
    return selectedEvent ? [selectedEvent] : [];
  }, [reportEvents, reportScope, selectedEvent]);

  const totals = useMemo(() => {
    return finalizeSummary(
      visibleEvents.filter((item) => reportScope === "evento" || isEventCounted(item.event)).reduce((summary, item) => {
        summary.entradas += item.summary.entradas;
        summary.saidas += item.summary.saidas;
        summary.aPagamento += item.summary.aPagamento;
        summary.faturado += item.summary.faturado;
        summary.naoFaturado += item.summary.naoFaturado;
        summary.pagoQ26 += item.summary.pagoQ26;
        summary.transferencias += item.summary.transferencias;
        summary.dinheiro += item.summary.dinheiro;
        return summary;
      }, emptySummary())
    );
  }, [reportScope, visibleEvents]);

  const accountEntries = useMemo(() => {
    return movimentos.filter((movimento) => movimento.evento_slug === "contas" && movimento.tipo === "entrada");
  }, [movimentos]);

  const accountSaidas = useMemo(() => {
    return movimentos.filter(
      (movimento) =>
        movimento.evento_slug !== "contas" && movimento.tipo === "saida" && isContaPayment(movimento.tipo_pagamento)
    );
  }, [movimentos]);

  const accountTotals = useMemo(() => {
    const entradas = accountEntries.reduce((sum, movimento) => sum + Number(movimento.montante ?? 0), 0);
    const saidas = accountSaidas.reduce((sum, movimento) => sum + Number(movimento.montante ?? 0), 0);
    return { entradas, saidas, saldo: entradas - saidas };
  }, [accountEntries, accountSaidas]);

  const decorationSummary = useMemo(() => {
    return reportEvents.find((item) => item.event.slug === "decoracao")?.summary ?? emptySummary();
  }, [reportEvents]);

  const chartItems = [
    { label: "Entradas Totais", value: totals.entradas, className: "cover-bar-blue" },
    { label: "Saídas Totais", value: totals.saidas, className: "cover-bar-orange" },
    { label: "A Pagamento Total", value: totals.aPagamento, className: "cover-bar-yellow" }
  ];
  const chartMax = Math.max(...chartItems.map((item) => item.value), 1);
  const overviewChartMax = Math.max(
    ...visibleEvents.flatMap((item) => [
      item.summary.entradas,
      item.summary.saidas,
      Math.abs(item.summary.lucro)
    ]),
    1
  );
  const printedDate = dateFormatter.format(new Date(generatedAt));
  const reportSubtitle = reportScope === "geral" ? "Relatório geral" : selectedEvent?.event.nome ?? "Evento selecionado";

  return (
    <main className="shell reports-shell">
      <section className="topbar no-print">
        <div>
          <p className="eyebrow">Q26</p>
          <h1>Relatórios</h1>
        </div>
        <div className="top-actions">
          {canAccessAdmin(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/admin">
              Admin
            </Link>
          ) : null}
          <Link className="nav-button secondary-nav-button" href="/">
            Tesouraria
          </Link>
          <Link className="nav-button" href="/overview">
            OverView
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
          <div className="status">
            <span className="status-dot" />
            Supabase
          </div>
        </div>
      </section>

      {error ? <section className="notice no-print">Não consegui ligar ao Supabase. {error}</section> : null}

      <section className="reports-toolbar no-print" aria-label="Opções do relatório">
        <div>
          <p className="eyebrow">Pré-visualização</p>
          <h2>{reportSubtitle}</h2>
        </div>
        <label>
          Tipo de relatório
          <select value={reportScope} onChange={(event) => setReportScope(event.target.value as ReportScope)}>
            <option value="geral">Relatório geral</option>
            <option value="evento">Evento selecionado</option>
          </select>
        </label>
        <label>
          Evento
          <select
            disabled={reportScope === "geral"}
            value={selectedEvent?.event.slug ?? ""}
            onChange={(event) => {
              setSelectedSlug(event.target.value);
              setReportScope("evento");
            }}
          >
            {eventList.map((event) => (
              <option key={event.slug} value={event.slug}>
                {event.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => window.print()}>
          Imprimir / PDF
        </button>
      </section>

      <section className="report-stage" aria-label="Pré-visualização do relatório">
        <article className="report-page report-front-page">
          <header className="report-front-header">
            <div className={reportLogo ? "report-logo-card custom-logo-card" : "report-logo-card"} aria-label="Logo do relatório">
              {reportLogo ? (
                <img alt="Logo do relatório" className="report-logo-image" src={reportLogo.dataUrl} />
              ) : (
                <>
                  <div className="report-logo-mark">
                    <span>Q26</span>
                  </div>
                  <strong>Quarentões 26</strong>
                  <small>Pontével</small>
                </>
              )}
            </div>
            <div className="report-title-block">
              <h2>Relatório de Contas Q26</h2>
              <p>{reportSubtitle}</p>
              <span>Última Atualização</span>
              <strong>{printedDate}</strong>
            </div>
          </header>

          <p className="report-authors">
            Relatório Elaborado Por: <strong>J. Galaio / Ana Lopes / Marta Amendoeira</strong>
          </p>

          <div className="report-cover-grid">
            <section className="report-cover-chart" aria-label="Gráfico dos totais">
              <div className="cover-chart-scale">
                <span>{formatMoney(chartMax)}</span>
                <span>{formatMoney(chartMax * 0.75)}</span>
                <span>{formatMoney(chartMax * 0.5)}</span>
                <span>{formatMoney(chartMax * 0.25)}</span>
                <span>{formatMoney(0)}</span>
              </div>
              <div className="cover-chart-bars">
                {chartItems.map((item) => (
                  <div className="cover-bar-column" key={item.label}>
                    <div className="cover-bar-track">
                      <div
                        className={`cover-bar ${item.className}`}
                        style={{ height: chartHeight(item.value, chartMax) }}
                      >
                        <span>{formatMoney(item.value)}</span>
                      </div>
                    </div>
                    <small>{item.label}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="report-cover-summary" aria-label="Resumo total">
              <article>
                <span>Resumo Totais</span>
                <small>Entradas Totais</small>
                <strong>{formatMoney(totals.entradas)}</strong>
              </article>
              <article>
                <span>Saídas Totais</span>
                <small>Despesas Totais</small>
                <strong>{formatMoney(totals.saidas)}</strong>
              </article>
              <article>
                <span>A Pagamento Total</span>
                <small>Valores pendentes</small>
                <strong>{formatMoney(totals.aPagamento)}</strong>
              </article>
              <article>
                <span>SALDO Total</span>
                <small>Lucro final</small>
                <strong className={totals.lucro >= 0 ? "positive" : "negative"}>{formatMoney(totals.lucro)}</strong>
              </article>
            </section>
          </div>

          <section className="report-cover-accounts" aria-label="Resumo de contas">
            <article>
              <span>Contas #1 "Mealheiro Q26"</span>
              <strong>{formatMoney(decorationSummary.lucro)}</strong>
            </article>
            <article>
              <span>Contas #2 "Associação"</span>
              <strong>{formatMoney(accountTotals.saldo)}</strong>
            </article>
          </section>

          <footer className="report-cover-note">
            Eventos marcados como só registo, como Decoração, e Contas não entram nos totais finais.
          </footer>
        </article>

        <article className="report-page report-detail-page">
          <header className="report-section-heading">
            <div>
              <p className="eyebrow">Resumo</p>
              <h2>{reportSubtitle}</h2>
            </div>
            <strong>{formatMoney(totals.lucro)}</strong>
          </header>

          <div className="report-summary">
            <article>
              <span>Entradas</span>
              <strong>{formatMoney(totals.entradas)}</strong>
            </article>
            <article>
              <span>Saídas</span>
              <strong>{formatMoney(totals.saidas)}</strong>
            </article>
            <article>
              <span>A pagamento</span>
              <strong>{formatMoney(totals.aPagamento)}</strong>
            </article>
            <article>
              <span>Saldo</span>
              <strong className={totals.lucro >= 0 ? "positive" : "negative"}>{formatMoney(totals.lucro)}</strong>
            </article>
          </div>

          <section className="report-overview-bars" aria-label="Gráfico horizontal dos eventos">
            <div className="report-chart-heading">
              <div>
                <p className="eyebrow">Eventos</p>
                <h3>Entradas, despesas e lucro</h3>
              </div>
              <div className="report-chart-legend">
                <span><i className="bar-blue-solid" />Entradas</span>
                <span><i className="bar-orange-solid" />Despesas</span>
                <span><i className="bar-green-solid" />Lucro</span>
              </div>
            </div>
            <div className="horizontal-chart">
              {visibleEvents.map((item) => (
                <div className="horizontal-chart-row" key={item.event.slug}>
                  <strong>{item.event.nome}</strong>
                  <div className="horizontal-bars">
                    <span className="horizontal-bar-cell">
                      <i className="horizontal-bar bar-blue-solid" style={{ width: barWidth(item.summary.entradas, overviewChartMax) }} />
                      <em>{formatMoney(item.summary.entradas)}</em>
                    </span>
                    <span className="horizontal-bar-cell">
                      <i className="horizontal-bar bar-orange-solid" style={{ width: barWidth(item.summary.saidas, overviewChartMax) }} />
                      <em>{formatMoney(item.summary.saidas)}</em>
                    </span>
                    <span className="horizontal-bar-cell">
                      <i
                        className={`horizontal-bar ${item.summary.lucro >= 0 ? "bar-green-solid" : "bar-red-solid"}`}
                        style={{ width: barWidth(Math.abs(item.summary.lucro), overviewChartMax) }}
                      />
                      <em>{formatMoney(item.summary.lucro)}</em>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </article>

        {visibleEvents.length ? (
          visibleEvents.map((item) => {
            const pie = eventPie(item.summary);

            return (
              <article className="report-page report-event-page" key={item.event.slug}>
                <section className="report-event">
                  <div className="report-event-heading">
                    <div>
                      <p className="eyebrow">{item.event.tipo === "evento" ? "Evento" : "Categoria"}</p>
                      <h3>{item.event.nome}</h3>
                      {!isEventCounted(item.event) ? <span className="event-status-badge detail">Só registo</span> : null}
                    </div>
                    <strong>{formatMoney(item.summary.lucro)}</strong>
                  </div>
                  <div className="report-event-totals">
                    <span>Entradas {formatMoney(item.summary.entradas)}</span>
                    <span>Saídas {formatMoney(item.summary.saidas)}</span>
                    <span>A pagamento {formatMoney(item.summary.aPagamento)}</span>
                    <span>Saldo {formatMoney(item.summary.lucro)}</span>
                  </div>
                  <div className="report-table-wrap">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Tipo</th>
                          <th>Item</th>
                          <th>Data</th>
                          <th>Montante</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.movimentos.length ? (
                          item.movimentos.map((movimento) => (
                            <tr key={movimento.id}>
                              <td>{movementLabel(movimento.tipo)}</td>
                              <td className="item-cell">{movimento.item}</td>
                              <td>{formatDate(movimento.data_pagamento)}</td>
                              <td className="money">{formatMoney(movimento.montante)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4}>Sem movimentos.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="report-event-pie" aria-label={`Entradas versus despesas de ${item.event.nome}`}>
                  <div className="pie-chart" style={{ background: pie.background }}>
                    <span>{pie.entradasPercent}%</span>
                  </div>
                  <div className="pie-legend">
                    <span>
                      <i className="pie-blue" />
                      Entradas {pie.entradasPercent}%
                    </span>
                    <span>
                      <i className="pie-orange" />
                      Despesas {pie.saidasPercent}%
                    </span>
                  </div>
                </section>
              </article>
            );
          })
        ) : (
          <article className="report-page report-detail-page">
            <p className="report-empty">Ainda não há eventos para mostrar no relatório.</p>
          </article>
        )}
      </section>
    </main>
  );
}
