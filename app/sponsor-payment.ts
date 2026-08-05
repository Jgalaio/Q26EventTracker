import type { MovimentoDetalhe } from "./supabase-data";

function normalizeEntryKind(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isEnabledFlag(value: unknown) {
  return value === true || value === "sim" || value === "true";
}

export function isSponsorEntry(movimento: MovimentoDetalhe) {
  return (
    movimento.tipo === "entrada" &&
    (normalizeEntryKind(movimento.raw?.tipo_entrada) === "patrocinio" || isEnabledFlag(movimento.raw?.patrocinio))
  );
}

export function isSponsorAwaitingPayment(movimento: MovimentoDetalhe) {
  return isSponsorEntry(movimento) && movimento.pago === false;
}

export function isMovementIncludedInTotals(movimento: MovimentoDetalhe) {
  return movimento.contabilizar_totais !== false && !isSponsorAwaitingPayment(movimento);
}
