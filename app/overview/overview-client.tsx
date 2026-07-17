"use client";

import { Fragment, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { AppLogo } from "../app-settings";
import { canExportOverviewExcel, type AuthSession } from "../auth-types";
import type { MovimentoDetalhe } from "../supabase-data";
import { TopbarActions } from "../topbar-actions";
import { TopbarBrand } from "../topbar-brand";
import { exportOverviewEventToExcel, exportOverviewEventsToExcel } from "./excel-export";

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

const OVERVIEW_MONEY_COLUMNS = 9;

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

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

type ImportedArchiveView = {
  fileName: string;
  exportedAt: string | null;
  generatedBy: string | null;
  rows: OverviewRow[];
  totals: Summary;
  countedRows: number;
  eventsCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const amount = Number(value.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(amount) ? amount : 0;
  }
  return 0;
}

function asBooleanOrNull(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === null) return null;
  return null;
}

function normalizeArchivePayment(value: string | null | undefined) {
  return (
    value
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

function normalizeMovementType(value: unknown): MovimentoDetalhe["tipo"] {
  return value === "entrada" || value === "saida" || value === "a_pagamento" ? value : "saida";
}

function normalizeEventType(value: unknown): "evento" | "categoria" {
  return value === "categoria" ? "categoria" : "evento";
}

function emptyArchiveSummary(): Summary {
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

function addArchiveMovement(summary: Summary, movimento: MovimentoDetalhe) {
  const amount = Number(movimento.montante ?? 0);

  if (movimento.tipo === "entrada") {
    summary.entradas += amount;
    return;
  }

  if (movimento.tipo === "a_pagamento" || movimento.pago === false) {
    summary.aPagamento += amount;
  }

  if (movimento.tipo !== "a_pagamento") {
    summary.saidas += amount;
  }

  if (movimento.fatura_com_nif === true) summary.faturado += amount;
  if (movimento.fatura_com_nif === false) summary.naoFaturado += amount;

  const payment = normalizeArchivePayment(movimento.tipo_pagamento);
  if (payment === "c q26") summary.pagoQ26 += amount;
  if (payment === "transferencia") summary.transferencias += amount;
  if (payment === "dinheiro") summary.dinheiro += amount;
}

function finalizeArchiveSummary(summary: Summary) {
  summary.lucro = summary.entradas - summary.saidas;
  return summary;
}

function movementIsCounted(movimento: MovimentoDetalhe) {
  return movimento.contabilizar_totais !== false;
}

function archiveRowsTotals(rows: OverviewRow[]) {
  return finalizeArchiveSummary(
    rows.filter((row) => row.contabilizarTotais).reduce((acc, row) => {
      row.movimentos.filter(movementIsCounted).forEach((movimento) => addArchiveMovement(acc, movimento));
      return acc;
    }, emptyArchiveSummary())
  );
}

function normalizeDetailedMovement(
  row: Record<string, unknown>,
  eventSlug: string,
  eventName: string,
  eventType: "evento" | "categoria",
  eventDate: string | null
): MovimentoDetalhe {
  return {
    id: asString(row.id, crypto.randomUUID()),
    evento_slug: asString(row.evento_slug, eventSlug),
    evento_nome: asString(row.evento_nome, eventName),
    evento_tipo: normalizeEventType(row.evento_tipo ?? eventType),
    evento_data_inicio: asNullableString(row.evento_data_inicio) ?? eventDate,
    tipo: normalizeMovementType(row.tipo),
    item: asString(row.item, "-"),
    descricao: asNullableString(row.descricao),
    data_pagamento: asNullableString(row.data_pagamento),
    montante: asNumber(row.montante),
    numero_fatura: asNullableString(row.numero_fatura),
    fatura_com_nif: asBooleanOrNull(row.fatura_com_nif),
    tipo_pagamento: asNullableString(row.tipo_pagamento),
    pago: asBooleanOrNull(row.pago),
    contabilizar_totais: asBooleanOrNull(row.contabilizar_totais),
    origem_tabela: asString(row.origem_tabela, ""),
    origem_linha: asNumber(row.origem_linha),
    formula_montante: asNullableString(row.formula_montante),
    raw: isRecord(row.raw) ? row.raw : {},
    created_at: asString(row.created_at, "")
  };
}

function normalizeOverviewRows(value: unknown) {
  return asArray(value)
    .filter(isRecord)
    .map((row) => {
      const slug = asString(row.slug, "evento");
      const nome = asString(row.nome, slug);
      const eventType = normalizeEventType(row.evento_tipo);
      const eventDate = asNullableString(row.evento_data_inicio);
      const movimentos = asArray(row.movimentos)
        .filter(isRecord)
        .map((movimento) => normalizeDetailedMovement(movimento, slug, nome, eventType, eventDate));
      const computed = finalizeArchiveSummary(
        movimentos.reduce((acc, movimento) => {
          addArchiveMovement(acc, movimento);
          return acc;
        }, emptyArchiveSummary())
      );

      return {
        slug,
        nome,
        contabilizarTotais: row.contabilizarTotais !== false,
        movimentos,
        entradas: "entradas" in row ? asNumber(row.entradas) : computed.entradas,
        saidas: "saidas" in row ? asNumber(row.saidas) : computed.saidas,
        aPagamento: "aPagamento" in row ? asNumber(row.aPagamento) : computed.aPagamento,
        lucro: "lucro" in row ? asNumber(row.lucro) : computed.lucro,
        faturado: "faturado" in row ? asNumber(row.faturado) : computed.faturado,
        naoFaturado: "naoFaturado" in row ? asNumber(row.naoFaturado) : computed.naoFaturado,
        pagoQ26: "pagoQ26" in row ? asNumber(row.pagoQ26) : computed.pagoQ26,
        transferencias: "transferencias" in row ? asNumber(row.transferencias) : computed.transferencias,
        dinheiro: "dinheiro" in row ? asNumber(row.dinheiro) : computed.dinheiro
      } satisfies OverviewRow;
    });
}

function rowsFromBackupTables(tables: Record<string, unknown>) {
  const events = asArray(tables.eventos).filter(isRecord);
  const movements = asArray(tables.movimentos).filter(isRecord);

  return events
    .filter((event) => asString(event.slug) !== "contas")
    .sort((first, second) => asNumber(first.ordem_folha) - asNumber(second.ordem_folha))
    .map((event) => {
      const id = asString(event.id);
      const slug = asString(event.slug, id || "evento");
      const nome = asString(event.nome, slug);
      const eventType = normalizeEventType(event.tipo);
      const eventDate = asNullableString(event.data_inicio);
      const eventMovements = movements
        .filter((movimento) => asString(movimento.evento_id) === id)
        .map((movimento) => normalizeDetailedMovement(movimento, slug, nome, eventType, eventDate));
      const summary = finalizeArchiveSummary(
        eventMovements.reduce((acc, movimento) => {
          addArchiveMovement(acc, movimento);
          return acc;
        }, emptyArchiveSummary())
      );

      return {
        slug,
        nome,
        contabilizarTotais:
          typeof event.contabilizar_totais === "boolean" ? event.contabilizar_totais : slug !== "decoracao",
        movimentos: eventMovements,
        ...summary
      } satisfies OverviewRow;
    });
}

function importedArchiveFromJson(value: unknown, fileName: string): ImportedArchiveView | null {
  const root = isRecord(value) ? value : null;
  if (!root) return null;
  const overview = isRecord(root.overview) ? root.overview : null;
  const database = isRecord(root.database) ? root.database : root;
  const tables = isRecord(database.tables) ? database.tables : null;
  const rows = overview ? normalizeOverviewRows(overview.rows) : tables ? rowsFromBackupTables(tables) : [];
  if (!rows.length) return null;
  const overviewTotals = overview && isRecord(overview.totals) ? overview.totals : null;
  const totals = overviewTotals
    ? {
        entradas: asNumber(overviewTotals.entradas),
        saidas: asNumber(overviewTotals.saidas),
        aPagamento: asNumber(overviewTotals.aPagamento),
        lucro: asNumber(overviewTotals.lucro),
        faturado: asNumber(overviewTotals.faturado),
        naoFaturado: asNumber(overviewTotals.naoFaturado),
        pagoQ26: asNumber(overviewTotals.pagoQ26),
        transferencias: asNumber(overviewTotals.transferencias),
        dinheiro: asNumber(overviewTotals.dinheiro)
      }
    : archiveRowsTotals(rows);

  return {
    fileName,
    exportedAt: asNullableString(root.exported_at) ?? asNullableString(database.exported_at),
    generatedBy: asNullableString(root.generated_by),
    rows,
    totals,
    countedRows: rows.filter((row) => row.contabilizarTotais).length,
    eventsCount: rows.length
  };
}

export function OverviewClient({ rows, totals, cashValue, physicalCashCount, error, session, appLogo }: OverviewClientProps) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(() => new Set());
  const [uploadedArchive, setUploadedArchive] = useState<ImportedArchiveView | null>(null);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const canExportExcel = canExportOverviewExcel(session);
  const countedRows = rows.filter((row) => row.contabilizarTotais).length;
  const selectedRows = canExportExcel ? rows.filter((row) => selectedSlugs.has(row.slug)) : [];
  const allRowsSelected = rows.length > 0 && selectedRows.length === rows.length;
  const physicalCashDifference = physicalCashCount === null ? null : physicalCashCount - cashValue;
  const chartItems = [
    { label: "Entradas Totais", value: totals.entradas, className: "bar-blue" },
    { label: "Saídas Totais", value: totals.saidas, className: "bar-orange" },
    { label: "Pagamentos em falta", value: totals.aPagamento, className: "bar-muted" }
  ];
  const chartMax = Math.max(...chartItems.map((item) => item.value), 1);
  const pieProfitValue = Math.max(totals.lucro, 0);
  const pieExpenseValue = Math.max(totals.saidas, 0);
  const pieTotal = pieProfitValue + pieExpenseValue;
  const pieProfitPercent = pieTotal > 0 ? (pieProfitValue / pieTotal) * 100 : 0;
  const pieExpensePercent = pieTotal > 0 ? 100 - pieProfitPercent : 0;
  const pieProfitDegrees = (pieProfitPercent / 100) * 360;

  const toggleExportSelection = (slug: string) => {
    if (!canExportExcel) return;
    setSelectedSlugs((current) => {
      const next = new Set(current);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const toggleAllExportSelection = () => {
    if (!canExportExcel) return;
    setSelectedSlugs((current) => {
      if (rows.length > 0 && rows.every((row) => current.has(row.slug))) {
        return new Set();
      }
      return new Set(rows.map((row) => row.slug));
    });
  };

  const handleArchiveUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(typeof reader.result === "string" ? reader.result : "");
        const archive = importedArchiveFromJson(parsed, file.name);
        if (!archive) throw new Error("O ficheiro não tem dados de encerramento ou backup válidos.");
        setUploadedArchive(archive);
        setArchiveMessage(`Ficheiro carregado: ${file.name}`);
      } catch (uploadError) {
        setUploadedArchive(null);
        setArchiveMessage(uploadError instanceof Error ? uploadError.message : "Não foi possível ler o ficheiro.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  return (
    <main className="shell overview-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="OverView" />
        <TopbarActions active="overview" session={session} />
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
          <section className="overview-pie-panel" aria-label="Gráfico circular de lucro e despesas">
            <div className="overview-pie-chart-wrap">
              <div
                aria-hidden="true"
                className="overview-pie-chart"
                style={{
                  background:
                    pieTotal > 0
                      ? `conic-gradient(#25815c 0deg ${pieProfitDegrees}deg, #5d91f2 ${pieProfitDegrees}deg 360deg)`
                      : "#eaf2ff"
                }}
              >
                <span>{formatPercent(pieProfitPercent)}</span>
              </div>
            </div>
            <div className="overview-pie-details">
              <div>
                <span>
                  <i className="pie-profit-dot" />
                  Lucro
                </span>
                <strong>{formatMoney(totals.lucro)}</strong>
                <small>{formatPercent(pieProfitPercent)}</small>
              </div>
              <div>
                <span>
                  <i className="pie-expense-dot" />
                  Despesas
                </span>
                <strong>{formatMoney(totals.saidas)}</strong>
                <small>{formatPercent(pieExpensePercent)}</small>
              </div>
            </div>
          </section>
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

      <section className="overview-archive-panel" aria-label="Consulta de encerramento anual">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Arquivo</p>
            <h2>Consultar ano fechado</h2>
          </div>
          <div className="table-heading-actions overview-archive-actions">
            <label className="overview-upload-button">
              Escolher ficheiro
              <input accept="application/json,.json" type="file" onChange={handleArchiveUpload} />
            </label>
            {uploadedArchive ? (
              <button
                className="overview-clear-archive-button"
                type="button"
                onClick={() => {
                  setUploadedArchive(null);
                  setArchiveMessage(null);
                }}
              >
                Limpar consulta
              </button>
            ) : null}
          </div>
        </div>
        {archiveMessage ? <p className="overview-archive-message">{archiveMessage}</p> : null}
        {uploadedArchive ? (
          <div className="overview-archive-content">
            <div className="overview-archive-meta">
              <strong>{uploadedArchive.fileName}</strong>
              <span>
                {uploadedArchive.exportedAt ? formatDate(uploadedArchive.exportedAt.slice(0, 10)) : "Sem data"} ·{" "}
                {uploadedArchive.generatedBy ?? "Origem desconhecida"}
              </span>
            </div>
            <div className="overview-archive-summary-grid">
              <article>
                <span>Entradas</span>
                <strong className="value-blue">{formatMoney(uploadedArchive.totals.entradas)}</strong>
              </article>
              <article>
                <span>Saídas</span>
                <strong className="value-red">{formatMoney(uploadedArchive.totals.saidas)}</strong>
              </article>
              <article>
                <span>Lucro</span>
                <strong className={uploadedArchive.totals.lucro >= 0 ? "value-green" : "value-red"}>
                  {formatMoney(uploadedArchive.totals.lucro)}
                </strong>
              </article>
              <article>
                <span>Eventos</span>
                <strong className="value-blue">
                  {uploadedArchive.countedRows}/{uploadedArchive.eventsCount}
                </strong>
              </article>
            </div>
            <div className="table-wrap overview-table-wrap">
              <table className="overview-table overview-archive-table">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th>Entradas</th>
                    <th>Saídas</th>
                    <th>A Pagamento</th>
                    <th>Lucro</th>
                    <th>Faturado</th>
                    <th>Não Faturado</th>
                    <th>Transferencias</th>
                    <th>Dinheiro</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadedArchive.rows.map((row) => (
                    <tr className={row.contabilizarTotais ? "overview-summary-row" : "overview-summary-row not-counted"} key={row.slug}>
                      <td className="item-cell">
                        <strong>{row.nome}</strong>
                        {!row.contabilizarTotais ? <span className="event-status-badge inline">Só registo</span> : null}
                      </td>
                      <td className="money">{formatMoney(row.entradas)}</td>
                      <td className="money">{formatMoney(row.saidas)}</td>
                      <td className="money">{formatMoney(row.aPagamento)}</td>
                      <td className={row.lucro >= 0 ? "money positive" : "money negative"}>{formatMoney(row.lucro)}</td>
                      <td className="money">{formatMoney(row.faturado)}</td>
                      <td className="money">{formatMoney(row.naoFaturado)}</td>
                      <td className="money">{formatMoney(row.transferencias)}</td>
                      <td className="money">{formatMoney(row.dinheiro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="overview-archive-empty">
            JSON do encerramento anual para consulta temporária.
          </p>
        )}
      </section>

      <section className="overview-table-panel" aria-label="Resumo por evento">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Eventos</p>
            <h2>Panorama por evento</h2>
          </div>
          <div className="table-heading-actions overview-export-actions">
            <span>{countedRows} contabilizados / {rows.length} eventos</span>
            {canExportExcel ? (
              <button
                className="overview-export-selected-button"
                disabled={!selectedRows.length}
                onClick={() => exportOverviewEventsToExcel(selectedRows)}
                type="button"
              >
                Exportar selecionados ({selectedRows.length})
              </button>
            ) : null}
          </div>
        </div>
        <div className="table-wrap overview-table-wrap">
          <table className="overview-table">
            <colgroup>
              {canExportExcel ? <col className="overview-col-select" /> : null}
              <col className="overview-col-event" />
              {Array.from({ length: OVERVIEW_MONEY_COLUMNS }, (_, index) => (
                <col className="overview-col-money" key={`overview-money-column-${index}`} />
              ))}
              {canExportExcel ? <col className="overview-col-excel" /> : null}
            </colgroup>
            <thead>
              <tr>
                {canExportExcel ? (
                  <th className="overview-select-cell">
                    <input
                      aria-label="Selecionar todos os eventos para exportar"
                      checked={allRowsSelected}
                      onChange={toggleAllExportSelection}
                      type="checkbox"
                    />
                  </th>
                ) : null}
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
                {canExportExcel ? <th>Excel</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedSlug === row.slug;
                const isSelected = selectedSlugs.has(row.slug);
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
                      {canExportExcel ? (
                        <td className="overview-select-cell">
                          <input
                            aria-label={`Selecionar ${row.nome} para exportar`}
                            checked={isSelected}
                            onChange={() => toggleExportSelection(row.slug)}
                            type="checkbox"
                          />
                        </td>
                      ) : null}
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
                      {canExportExcel ? (
                        <td>
                          <button
                            aria-label={`Exportar ${row.nome} para Excel`}
                            className="overview-export-button"
                            onClick={() => exportOverviewEventToExcel(row)}
                            type="button"
                          >
                            Excel
                          </button>
                        </td>
                      ) : null}
                    </tr>
                    {isExpanded ? (
                      <tr className="overview-expanded-row">
                        <td colSpan={canExportExcel ? 12 : 10}>
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
                {canExportExcel ? <th /> : null}
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
                {canExportExcel ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </main>
  );
}
