import { redirect } from "next/navigation";
import { getAppLogo, getPhysicalCashSettings, getQ25Balance } from "./app-settings";
import { getSession } from "./auth";
import { canViewTreasury } from "./auth-types";
import { getNotas, getTesourariaData, type EventoResumo, type MovimentoDetalhe, type Nota } from "./supabase-data";
import { getUserQuickNotes } from "./user-quick-notes";
import { WelcomeClient } from "./welcome-client";

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

type WelcomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const moneyFormatter = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2
});

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0));
}

function normalizePayment(value: string | null | undefined) {
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

function isContaPayment(value: string | null) {
  const normalized = normalizePayment(value);
  return normalized === "transferencia" || normalized === "c q26";
}

function isBankEntryPayment(value: string | null | undefined) {
  const payment = normalizePayment(value);
  return payment === "multibanco" || payment === "transferencia";
}

function isAccountEntry(movimento: MovimentoDetalhe) {
  return movimento.tipo === "entrada" && (movimento.evento_slug === "contas" || isBankEntryPayment(movimento.tipo_pagamento));
}

function isPendingPayment(movimento: MovimentoDetalhe) {
  return movimento.tipo !== "entrada" && movimento.pago === false;
}

function isEventCounted(event: EventoResumo) {
  if (typeof event.contabilizar_totais === "boolean") return event.contabilizar_totais;
  return event.slug !== "decoracao";
}

function isMovementCounted(movimento: MovimentoDetalhe) {
  return movimento.contabilizar_totais !== false;
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

  if (movimento.tipo === "a_pagamento" || isPendingPayment(movimento)) summary.aPagamento += amount;
  if (movimento.tipo !== "a_pagamento") summary.saidas += amount;
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

function priorityRank(note: Nota) {
  if (note.prioridade === "urgente") return 0;
  if (note.prioridade === "alta") return 1;
  if (note.prioridade === "normal" || !note.prioridade) return 2;
  return 3;
}

function noteScheduleTime(note: Nota) {
  const date = note.prazo_para ?? note.agendado_para ?? note.updated_at;
  const time = new Date(date).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function urgentNotes(notes: Nota[]) {
  return notes
    .filter((note) => note.estado !== "concluido" && note.estado !== "cancelado")
    .sort((left, right) => {
      const priorityDiff = priorityRank(left) - priorityRank(right);
      if (priorityDiff !== 0) return priorityDiff;
      return noteScheduleTime(left) - noteScheduleTime(right);
    })
    .slice(0, 5);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function tesourariaTarget(params: Record<string, string | string[] | undefined>) {
  const movement = firstParam(params.movement);
  if (movement) return `/tesouraria?movement=${encodeURIComponent(movement)}`;

  const event = firstParam(params.event);
  if (event) return `/tesouraria?event=${encodeURIComponent(event)}`;

  return "/";
}

export default async function WelcomePage({ searchParams }: WelcomePageProps) {
  const params = searchParams ? await searchParams : {};
  const targetPath = tesourariaTarget(params);
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(targetPath)}`);
  if (targetPath !== "/") redirect(targetPath);

  const [{ eventos, movimentos, error }, q25Balance, physicalCashSettings, appLogo, notes, quickNotes] = await Promise.all([
    getTesourariaData(),
    getQ25Balance(),
    getPhysicalCashSettings(),
    getAppLogo(),
    getNotas(200),
    getUserQuickNotes(session.username)
  ]);

  const eventStatus = new Map(
    eventos
      .filter((event) => event.slug !== "contas")
      .map((event) => [event.slug, { counted: isEventCounted(event) }])
  );
  const totals = finalizeSummary(
    movimentos.reduce((acc, movimento) => {
      const status = eventStatus.get(movimento.evento_slug);
      if (!status?.counted || !isMovementCounted(movimento)) return acc;
      addMovimento(acc, movimento);
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
  const physicalCashDifference =
    physicalCashSettings.amount === null ? null : Number(physicalCashSettings.amount) - cashValue;
  const canOpenPending = canViewTreasury(session);

  const cards = [
    { label: "Entradas Totais", value: formatMoney(totals.entradas), detail: "Todas as entradas", tone: "blue" as const },
    { label: "Saídas Totais", value: formatMoney(totals.saidas), detail: "Despesas totais", tone: "red" as const },
    {
      label: "Pagamentos em falta",
      value: formatMoney(totals.aPagamento),
      detail: "Valores pendentes",
      tone: totals.aPagamento > 0 ? ("red" as const) : ("green" as const),
      href: canOpenPending ? "/a-pagar" : undefined
    },
    { label: "Saldo Total", value: formatMoney(totals.lucro), detail: "Lucro final", tone: "green" as const },
    { label: "Faturado", value: formatMoney(totals.faturado), detail: "Fatura C/NIF: Sim", tone: "blue" as const },
    { label: "Não Faturado", value: formatMoney(totals.naoFaturado), detail: "Fatura C/NIF: Não", tone: "purple" as const },
    { label: "Transferências", value: formatMoney(totals.transferencias), detail: "Pagas por transferência", tone: "purple" as const },
    { label: "Valor Dinheiro", value: formatMoney(cashValue), detail: "Lucro + Q25 - Saldo Conta", tone: "blue" as const },
    {
      label: "Dif. Dinheiro Físico",
      value: physicalCashDifference === null ? "-" : formatMoney(physicalCashDifference),
      detail: physicalCashSettings.amount === null ? "Sem contagem registada" : `Contado: ${formatMoney(physicalCashSettings.amount)}`,
      tone: physicalCashDifference !== null && physicalCashDifference < 0 ? ("red" as const) : ("green" as const)
    }
  ];

  return (
    <WelcomeClient
      appLogo={appLogo}
      cards={cards}
      dataError={error ?? notes.error}
      quickNotes={quickNotes}
      session={session}
      urgentNotes={urgentNotes(notes.data)}
    />
  );
}
