import { redirect } from "next/navigation";
import { getAppLogo, getQ25Balance } from "../app-settings";
import { getSession } from "../auth";
import { getTesourariaData, type EventoResumo, type MovimentoDetalhe } from "../supabase-data";
import { OverviewClient, type OverviewRow } from "./overview-client";

type Summary = Omit<OverviewRow, "nome" | "slug" | "movimentos" | "contabilizarTotais">;

function normalizePayment(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

function isContaPayment(value: string | null) {
  const normalized = normalizePayment(value);
  return normalized === "transferencia" || normalized === "c q26";
}

function isMultibancoPayment(value: string | null | undefined) {
  return normalizePayment(value) === "multibanco";
}

function isAccountEntry(movimento: MovimentoDetalhe) {
  return movimento.tipo === "entrada" && (movimento.evento_slug === "contas" || isMultibancoPayment(movimento.tipo_pagamento));
}

function isPendingPayment(movimento: MovimentoDetalhe) {
  return movimento.tipo !== "entrada" && movimento.pago === false;
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

  if (movimento.tipo === "a_pagamento" || isPendingPayment(movimento)) {
    summary.aPagamento += amount;
  }

  if (movimento.tipo !== "a_pagamento") {
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

function isEventCounted(event: EventoResumo) {
  if (typeof event.contabilizar_totais === "boolean") return event.contabilizar_totais;
  return event.slug !== "decoracao";
}

function isMovementCounted(movimento: MovimentoDetalhe) {
  return movimento.contabilizar_totais !== false;
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
    contabilizarTotais: isEventCounted(event),
    movimentos,
    ...summary
  };
}

export default async function OverviewPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/overview");

  const [{ eventos, movimentos, error }, q25Balance, appLogo] = await Promise.all([
    getTesourariaData(),
    getQ25Balance(),
    getAppLogo()
  ]);
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
    rows.filter((row) => row.contabilizarTotais).reduce((acc, row) => {
      row.movimentos.filter(isMovementCounted).forEach((movimento) => {
        addMovimento(acc, movimento);
      });
      return acc;
    }, emptySummary())
  );

  const accountEntradas = movimentos
    .filter(isAccountEntry)
    .reduce((sum, movimento) => sum + Number(movimento.montante ?? 0), 0);
  const accountSaidas = movimentos
    .filter(
      (movimento) =>
        movimento.evento_slug !== "contas" &&
        movimento.tipo === "saida" &&
        isMovementCounted(movimento) &&
        isContaPayment(movimento.tipo_pagamento)
    )
    .reduce((sum, movimento) => sum + Number(movimento.montante ?? 0), 0);
  const accountBalance = accountEntradas - accountSaidas;
  const cashValue = totals.lucro + q25Balance - accountBalance;

  return <OverviewClient appLogo={appLogo} cashValue={cashValue} error={error} rows={rows} session={session} totals={totals} />;
}
