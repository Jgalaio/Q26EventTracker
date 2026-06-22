"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AppLogo } from "../app-settings";
import { ROLE_LABELS, canAccessAdmin, type AuthSession } from "../auth-types";
import { NotesMenu } from "../notes-menu";
import type { EventoResumo, FaturacaoReport, FaturacaoReportItem, MovimentoDetalhe } from "../supabase-data";
import { TopbarBrand } from "../topbar-brand";

type FacturacaoClientProps = {
  eventos: EventoResumo[];
  movimentos: MovimentoDetalhe[];
  reports: FaturacaoReport[];
  reportsError: string | null;
  error: string | null;
  session: AuthSession;
  appLogo: AppLogo | null;
};

type DescriptionPopup = {
  title: string;
  text: string;
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
  if (!value) return "Sem data";
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function parseAmount(value: string) {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return 0;
  if (normalized.includes(",") && normalized.includes(".")) {
    return Number(normalized.replace(/\./g, "").replace(",", "."));
  }
  if (normalized.includes(",")) return Number(normalized.replace(",", "."));
  return Number(normalized);
}

function isMovementCounted(movimento: MovimentoDetalhe) {
  return movimento.contabilizar_totais !== false;
}

function isMarkedForLaterInvoice(movimento: MovimentoDetalhe) {
  const value = movimento.raw?.faturar_mais_tarde;
  return value === true || value === "sim" || value === "true";
}

function isFaturadaDespesa(movimento: MovimentoDetalhe) {
  return (
    movimento.tipo === "saida" &&
    movimento.fatura_com_nif === true &&
    movimento.evento_slug !== "contas" &&
    isMovementCounted(movimento)
  );
}

function isLaterInvoiceExpense(movimento: MovimentoDetalhe) {
  return (
    movimento.tipo === "saida" &&
    movimento.evento_slug !== "contas" &&
    isMovementCounted(movimento) &&
    isMarkedForLaterInvoice(movimento)
  );
}

function movementAmount(movimento: MovimentoDetalhe) {
  return Number(movimento.montante ?? 0);
}

function movementToReportItem(movimento: MovimentoDetalhe): FaturacaoReportItem {
  return {
    id: movimento.id,
    evento_slug: movimento.evento_slug,
    evento_nome: movimento.evento_nome,
    item: movimento.item,
    descricao: movimento.descricao,
    data_pagamento: movimento.data_pagamento,
    tipo_pagamento: movimento.tipo_pagamento,
    numero_fatura: movimento.numero_fatura,
    montante: movementAmount(movimento),
    raw: movimento.raw
  };
}

function reportItems(report: FaturacaoReport, key: "despesas_evento" | "itens_acrescentados") {
  return Array.isArray(report.payload?.[key]) ? report.payload[key] : [];
}

function reportCreatedAt(report: FaturacaoReport) {
  return report.payload?.finalizado_em ?? report.created_at;
}

function reportTotals(report: FaturacaoReport) {
  const totalFaturado = Number(report.payload?.totais?.total_faturado ?? report.total_faturado ?? 0);
  const valorFatura = Number(report.payload?.totais?.valor_fatura ?? report.valor_fatura ?? 0);

  return {
    despesasEvento: Number(report.payload?.totais?.despesas_evento ?? report.total_despesas ?? 0),
    itensAcrescentados: Number(report.payload?.totais?.itens_acrescentados ?? report.total_itens_acrescentados ?? 0),
    totalFaturado,
    valorFatura,
    diferenca: valorFatura - totalFaturado
  };
}

function PrintableInvoiceReport({ report }: { report: FaturacaoReport }) {
  const despesasEvento = reportItems(report, "despesas_evento");
  const itensAcrescentados = reportItems(report, "itens_acrescentados");
  const totals = reportTotals(report);

  const renderRows = (items: FaturacaoReportItem[], emptyText: string) =>
    items.length ? (
      items.map((item) => (
        <tr key={item.id}>
          <td>{item.evento_nome}</td>
          <td>{item.item}</td>
          <td>{item.numero_fatura ?? "-"}</td>
          <td>{item.tipo_pagamento ?? "-"}</td>
          <td className="money">{formatMoney(item.montante)}</td>
        </tr>
      ))
    ) : (
      <tr>
        <td className="empty-movement-row" colSpan={5}>
          {emptyText}
        </td>
      </tr>
    );

  return (
    <article className="billing-report-page">
      <header className="billing-report-header">
        <div>
          <p className="eyebrow">Q26</p>
          <h2>Relatório de Fatura</h2>
          <span>{report.evento_nome}</span>
        </div>
        <div>
          <strong>{formatMoney(totals.totalFaturado)}</strong>
          <span>{formatDate(reportCreatedAt(report).slice(0, 10))}</span>
        </div>
      </header>

      <section className="billing-report-summary">
        <article>
          <span>Despesas do evento</span>
          <strong>{formatMoney(totals.despesasEvento)}</strong>
        </article>
        <article>
          <span>Itens acrescentados</span>
          <strong>{formatMoney(totals.itensAcrescentados)}</strong>
        </article>
        <article>
          <span>Valor da fatura</span>
          <strong>{formatMoney(totals.valorFatura)}</strong>
        </article>
        <article>
          <span>Diferença</span>
          <strong className={totals.diferenca >= 0 ? "positive" : "negative"}>{formatMoney(totals.diferenca)}</strong>
        </article>
      </section>

      <section className="billing-report-section">
        <h3>Despesas do evento</h3>
        <table>
          <thead>
            <tr>
              <th>Evento</th>
              <th>Item</th>
              <th>Fatura</th>
              <th>Pagamento</th>
              <th>Montante</th>
            </tr>
          </thead>
          <tbody>{renderRows(despesasEvento, "Sem despesas do evento.")}</tbody>
        </table>
      </section>

      <section className="billing-report-section">
        <h3>Itens acrescentados</h3>
        <table>
          <thead>
            <tr>
              <th>Evento</th>
              <th>Item</th>
              <th>Fatura</th>
              <th>Pagamento</th>
              <th>Montante</th>
            </tr>
          </thead>
          <tbody>{renderRows(itensAcrescentados, "Sem itens acrescentados.")}</tbody>
        </table>
      </section>

      <footer className="billing-report-footer">
        <span>Registado por {report.created_by}</span>
        <span>Relatório {report.id}</span>
      </footer>
    </article>
  );
}

export function FacturacaoClient({ eventos, movimentos, reports, reportsError, error, session, appLogo }: FacturacaoClientProps) {
  const eventList = useMemo(() => {
    return eventos
      .filter((event) => event.slug !== "contas")
      .sort((a, b) => {
        const aTime = a.data_inicio ? new Date(`${a.data_inicio}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.data_inicio ? new Date(`${b.data_inicio}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime || a.ordem_folha - b.ordem_folha;
      });
  }, [eventos]);

  const [selectedSlug, setSelectedSlug] = useState(() => eventList[0]?.slug ?? "");
  const [invoiceValue, setInvoiceValue] = useState("");
  const [selectedPreviousIds, setSelectedPreviousIds] = useState<Set<string>>(new Set());
  const [clearedLaterInvoiceIds, setClearedLaterInvoiceIds] = useState<Set<string>>(new Set());
  const [savedReports, setSavedReports] = useState(reports);
  const [printableReport, setPrintableReport] = useState<FaturacaoReport | null>(null);
  const [descriptionPopup, setDescriptionPopup] = useState<DescriptionPopup | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  const selectedEvent = useMemo(() => {
    return eventList.find((event) => event.slug === selectedSlug) ?? eventList[0] ?? null;
  }, [eventList, selectedSlug]);

  const eventPositions = useMemo(() => {
    return new Map(eventList.map((event, index) => [event.slug, index]));
  }, [eventList]);

  const currentEventExpenses = useMemo(() => {
    if (!selectedEvent) return [];
    return movimentos
      .filter((movimento) => movimento.evento_slug === selectedEvent.slug && isFaturadaDespesa(movimento))
      .sort((a, b) => (a.data_pagamento ?? "").localeCompare(b.data_pagamento ?? "") || a.item.localeCompare(b.item));
  }, [movimentos, selectedEvent]);

  const previousExpenses = useMemo(() => {
    if (!selectedEvent) return [];
    const selectedPosition = eventPositions.get(selectedEvent.slug) ?? 0;
    return movimentos
      .filter((movimento) => {
        const movementPosition = eventPositions.get(movimento.evento_slug);
        return (
          isLaterInvoiceExpense(movimento) &&
          !clearedLaterInvoiceIds.has(movimento.id) &&
          movimento.evento_slug !== selectedEvent.slug &&
          typeof movementPosition === "number" &&
          movementPosition < selectedPosition
        );
      })
      .sort((a, b) => (b.data_pagamento ?? "").localeCompare(a.data_pagamento ?? "") || a.evento_nome.localeCompare(b.evento_nome));
  }, [clearedLaterInvoiceIds, eventPositions, movimentos, selectedEvent]);

  const selectedPreviousExpenses = useMemo(() => {
    return previousExpenses.filter((movimento) => selectedPreviousIds.has(movimento.id));
  }, [previousExpenses, selectedPreviousIds]);

  const currentExpensesTotal = currentEventExpenses.reduce((sum, movimento) => sum + movementAmount(movimento), 0);
  const previousExpensesTotal = selectedPreviousExpenses.reduce((sum, movimento) => sum + movementAmount(movimento), 0);
  const billedExpensesTotal = currentExpensesTotal + previousExpensesTotal;
  const invoiceAmount = parseAmount(invoiceValue);
  const invoiceDifference = (Number.isFinite(invoiceAmount) ? invoiceAmount : 0) - billedExpensesTotal;

  const togglePreviousExpense = (id: string) => {
    setSelectedPreviousIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectEvent = (slug: string) => {
    setSelectedSlug(slug);
    setSelectedPreviousIds(new Set());
    setBillingMessage(null);
  };

  const printReport = (report: FaturacaoReport) => {
    setPrintableReport(report);
    window.setTimeout(() => window.print(), 120);
  };

  const finalizeInvoice = async () => {
    if (!selectedEvent) {
      setBillingMessage("Escolhe um evento antes de finalizar.");
      return;
    }

    if (!invoiceValue.trim()) {
      setBillingMessage("Indica o valor da fatura.");
      return;
    }

    if (!Number.isFinite(invoiceAmount)) {
      setBillingMessage("Indica um valor de fatura válido.");
      return;
    }

    if (billedExpensesTotal <= 0) {
      setBillingMessage("Não existem despesas para faturar.");
      return;
    }

    const confirmed = window.confirm(`Finalizar e imprimir a fatura de ${selectedEvent.nome}?`);
    if (!confirmed) return;

    const selectedPreviousItems = selectedPreviousExpenses.map(movementToReportItem);
    const payload = {
      evento_id: selectedEvent.id,
      evento_slug: selectedEvent.slug,
      evento_nome: selectedEvent.nome,
      valor_fatura: invoiceAmount,
      despesas_evento: currentEventExpenses.map(movementToReportItem),
      itens_acrescentados: selectedPreviousItems,
      totais: {
        despesas_evento: currentExpensesTotal,
        itens_acrescentados: previousExpensesTotal,
        total_faturado: billedExpensesTotal,
        valor_fatura: invoiceAmount,
        diferenca: invoiceDifference
      }
    };

    setIsFinalizing(true);
    setBillingMessage(null);
    try {
      const response = await fetch("/api/faturacao/finalizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json().catch(() => null)) as { message?: string; report?: FaturacaoReport } | null;
      if (!response.ok || !body?.report) throw new Error(body?.message ?? "Não foi possível finalizar a fatura.");

      const clearedIds = selectedPreviousItems.map((item) => item.id);
      setSavedReports((current) => [body.report as FaturacaoReport, ...current]);
      setClearedLaterInvoiceIds((current) => new Set([...current, ...clearedIds]));
      setSelectedPreviousIds(new Set());
      setBillingMessage("Fatura finalizada e relatório guardado.");
      printReport(body.report);
    } catch (caught) {
      setBillingMessage(caught instanceof Error ? caught.message : "Não foi possível finalizar a fatura.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const renderDescription = (movimento: MovimentoDetalhe) => {
    if (!movimento.descricao) return "-";
    return (
      <button
        className="description-button"
        type="button"
        onClick={() => setDescriptionPopup({ title: movimento.item, text: movimento.descricao ?? "" })}
      >
        {movimento.descricao}
      </button>
    );
  };

  return (
    <main className="shell billing-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Fat.Finanças" />
        <div className="top-actions">
          <NotesMenu role={session.role} />
          {canAccessAdmin(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/admin">
              Admin
            </Link>
          ) : null}
          <Link className="nav-button secondary-nav-button" href="/">
            Tesouraria
          </Link>
          <Link className="nav-button secondary-nav-button" href="/reports">
            Relatórios
          </Link>
          <Link className="nav-button secondary-nav-button" href="/fat-patrocinios">
            Fat. Patrocínios
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
        </div>
      </section>

      {error ? <section className="notice">Não consegui ligar ao Supabase. {error}</section> : null}
      {reportsError ? <section className="notice">Não consegui carregar o histórico de faturas. {reportsError}</section> : null}

      <section className="billing-controls" aria-label="Dados da Fat.Finanças">
        <label>
          Evento
          <select value={selectedEvent?.slug ?? ""} onChange={(event) => selectEvent(event.target.value)}>
            {eventList.map((event) => (
              <option key={event.slug} value={event.slug}>
                {event.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor da fatura
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={invoiceValue}
            onChange={(event) => setInvoiceValue(event.target.value)}
          />
        </label>
        <div className="billing-actions">
          <button disabled={isFinalizing} type="button" onClick={finalizeInvoice}>
            {isFinalizing ? "A finalizar..." : "Finalizar/Imprimir"}
          </button>
        </div>
      </section>

      {billingMessage ? <section className="notice billing-message">{billingMessage}</section> : null}

      <section className="metrics billing-metrics" aria-label="Resumo de Fat.Finanças">
        <article>
          <span>Despesas faturadas</span>
          <strong>{formatMoney(currentExpensesTotal)}</strong>
        </article>
        <article>
          <span>Itens anteriores</span>
          <strong>{formatMoney(previousExpensesTotal)}</strong>
        </article>
        <article>
          <span>Total faturado</span>
          <strong>{formatMoney(billedExpensesTotal)}</strong>
        </article>
        <article>
          <span>Valor da fatura</span>
          <strong>{formatMoney(Number.isFinite(invoiceAmount) ? invoiceAmount : 0)}</strong>
        </article>
        <article>
          <span>Dif. Despesa/Fatura</span>
          <strong className={invoiceDifference >= 0 ? "positive" : "negative"}>{formatMoney(invoiceDifference)}</strong>
        </article>
      </section>

      <section className="billing-grid">
        <article className="billing-panel">
          <div className="table-heading">
            <div>
              <p className="eyebrow">{selectedEvent ? formatDate(selectedEvent.data_inicio) : "Evento"}</p>
              <h2>{selectedEvent?.nome ?? "Sem evento"}</h2>
            </div>
            <span>{currentEventExpenses.length} itens</span>
          </div>
          <div className="table-wrap billing-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Descrição</th>
                  <th>Data</th>
                  <th>Pagamento</th>
                  <th>Montante</th>
                </tr>
              </thead>
              <tbody>
                {currentEventExpenses.length ? (
                  currentEventExpenses.map((movimento) => (
                    <tr key={movimento.id}>
                      <td>{movimento.item}</td>
                      <td>{renderDescription(movimento)}</td>
                      <td>{formatDate(movimento.data_pagamento)}</td>
                      <td>{movimento.tipo_pagamento ?? "-"}</td>
                      <td>{formatMoney(movimento.montante)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-movement-row" colSpan={5}>
                      Sem despesas com Fatura C/NIF neste evento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="billing-panel">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Eventos anteriores</p>
              <h2>Itens a acrescentar</h2>
            </div>
            <span>{selectedPreviousExpenses.length} selecionados</span>
          </div>
          <div className="table-wrap billing-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Selecionar</th>
                  <th>Evento</th>
                  <th>Item</th>
                  <th>Descrição</th>
                  <th>Montante</th>
                </tr>
              </thead>
              <tbody>
                {previousExpenses.length ? (
                  previousExpenses.map((movimento) => (
                    <tr key={movimento.id}>
                      <td>
                        <input
                          aria-label={`Selecionar ${movimento.item}`}
                          checked={selectedPreviousIds.has(movimento.id)}
                          type="checkbox"
                          onChange={() => togglePreviousExpense(movimento.id)}
                        />
                      </td>
                      <td>{movimento.evento_nome}</td>
                      <td>{movimento.item}</td>
                      <td>{renderDescription(movimento)}</td>
                      <td>{formatMoney(movimento.montante)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-movement-row" colSpan={5}>
                      Sem itens marcados para faturar mais tarde em eventos anteriores.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="billing-history" aria-label="Faturas finalizadas">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Histórico</p>
            <h2>Faturas finalizadas</h2>
          </div>
          <span>{savedReports.length} relatórios</span>
        </div>
        <div className="table-wrap billing-history-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Evento</th>
                <th>Total faturado</th>
                <th>Valor da fatura</th>
                <th>Diferença</th>
                <th>Por</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {savedReports.length ? (
                savedReports.map((report) => {
                  const totals = reportTotals(report);
                  return (
                    <tr key={report.id}>
                      <td>{formatDate(reportCreatedAt(report).slice(0, 10))}</td>
                      <td>{report.evento_nome}</td>
                      <td className="money">{formatMoney(totals.totalFaturado)}</td>
                      <td className="money">{formatMoney(totals.valorFatura)}</td>
                      <td className="money">{formatMoney(totals.diferenca)}</td>
                      <td>{report.created_by}</td>
                      <td>
                        <button className="small-action-button" type="button" onClick={() => printReport(report)}>
                          Imprimir
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="empty-movement-row" colSpan={7}>
                    Ainda não existem faturas finalizadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="billing-print-stage" aria-hidden={!printableReport}>
        {printableReport ? <PrintableInvoiceReport report={printableReport} /> : null}
      </section>

      {descriptionPopup ? (
        <div className="modal-backdrop" role="presentation">
          <section aria-modal="true" className="modal description-modal" role="dialog">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Descrição</p>
                <h2>{descriptionPopup.title}</h2>
              </div>
              <button aria-label="Fechar" className="icon-button" onClick={() => setDescriptionPopup(null)} type="button">
                ×
              </button>
            </div>
            <p className="description-full-text">{descriptionPopup.text}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setDescriptionPopup(null)}>
                Fechar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
