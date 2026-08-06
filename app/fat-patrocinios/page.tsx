import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getSession } from "../auth";
import { canWrite } from "../auth-types";
import { getEntryMovements, type MovimentoDetalhe } from "../supabase-data";
import { FatPatrociniosClient } from "./fat-patrocinios-client";

function isRawFlagEnabled(value: unknown) {
  return value === true || value === "sim" || value === "true";
}

function normalizeEntryKind(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isSponsorEntry(movimento: MovimentoDetalhe) {
  return (
    movimento.tipo === "entrada" &&
    (normalizeEntryKind(movimento.raw?.tipo_entrada) === "patrocinio" || isRawFlagEnabled(movimento.raw?.patrocinio))
  );
}

function isFinanceInvoiceEntry(movimento: MovimentoDetalhe) {
  return (
    movimento.tipo === "entrada" &&
    normalizeEntryKind(movimento.raw?.tipo_entrada) === "faturacao" &&
    (isRawFlagEnabled(movimento.raw?.precisa_fatura) || isRawFlagEnabled(movimento.raw?.necessita_fatura))
  );
}

function isInvoiceEntry(movimento: MovimentoDetalhe) {
  return movimento.raw?.fatura_emitida !== "nao_precisa" && (isSponsorEntry(movimento) || isFinanceInvoiceEntry(movimento));
}

export default async function FatPatrociniosPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/fat-patrocinios");
  if (!canWrite(session)) redirect("/overview");

  const [{ data: movimentos, error }, appLogo] = await Promise.all([getEntryMovements(), getAppLogo()]);
  const invoiceMovements = movimentos
    .filter(isInvoiceEntry)
    .sort(
      (a, b) =>
        a.evento_nome.localeCompare(b.evento_nome) ||
        a.item.localeCompare(b.item) ||
        (a.created_at ?? "").localeCompare(b.created_at ?? "")
    );

  return (
    <FatPatrociniosClient appLogo={appLogo} error={error} initialMovimentos={invoiceMovements} session={session} />
  );
}
