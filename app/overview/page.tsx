import { redirect } from "next/navigation";
import { getSession } from "../auth";
import { getTesourariaData, type EventoResumo, type MovimentoDetalhe } from "../supabase-data";
import { OverviewClient, type OverviewRow } from "./overview-client";

type Summary = Omit<OverviewRow, "nome" | "slug" | "movimentos">;

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
    movimentos,
    ...summary
  };
}

export default async function OverviewPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/overview");

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

  return <OverviewClient error={error} rows={rows} session={session} totals={totals} />;
}
