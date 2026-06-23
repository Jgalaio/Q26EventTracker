import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../../audit-log";
import { readJsonBody, requireDeleteAccess, requireWriteAccess } from "../../../q26-write";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";

type JsonRecord = Record<string, unknown>;

type FaturacaoReportRow = {
  id: string;
  created_at: string;
  created_by: string;
  evento_id: string | null;
  evento_slug: string;
  evento_nome: string;
  valor_fatura: number;
  total_despesas: number;
  total_itens_acrescentados: number;
  total_faturado: number;
  diferenca: number;
  movimentos_ids: string[];
  payload: JsonRecord | null;
};

type AccountMovementRow = {
  id: string;
  item: string;
  montante: number | null;
  raw: JsonRecord | null;
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function endpoint(resource: string) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function amountValue(value: unknown) {
  const number = numberValue(value);
  return Number.isFinite(number) ? number : 0;
}

function reportPayload(report: FaturacaoReportRow) {
  return isRecord(report.payload) ? report.payload : {};
}

function reportTotals(report: FaturacaoReportRow) {
  const payload = reportPayload(report);
  const totals = isRecord(payload.totais) ? payload.totais : {};
  const totalDespesas = amountValue(totals.despesas_evento ?? report.total_despesas);
  const totalItensAcrescentados = amountValue(totals.itens_acrescentados ?? report.total_itens_acrescentados);
  const totalFaturado = amountValue(totals.total_faturado ?? report.total_faturado);
  const transferenciasComNif = amountValue(totals.transferencias_com_nif ?? totalDespesas);
  const transferenciasSemNif = amountValue(totals.transferencias_sem_nif);

  return {
    totals,
    totalDespesas,
    totalItensAcrescentados,
    totalFaturado,
    transferenciasComNif,
    transferenciasSemNif
  };
}

function requireJustification(value: unknown) {
  const justification = stringValue(value);
  if (!justification) {
    return {
      justification: "",
      error: NextResponse.json({ message: "Indica a justificação da alteração." }, { status: 400 })
    };
  }

  return { justification, error: null };
}

async function supabaseRequest<T>(resource: string, method: string, body?: JsonRecord) {
  const response = await fetch(endpoint(resource), {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${responseText}`);
  }

  return (responseText ? JSON.parse(responseText) : null) as T;
}

async function getReport(id: string) {
  const rows = await supabaseRequest<FaturacaoReportRow[]>(
    `faturas_relatorios?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    "GET"
  );
  return rows[0] ?? null;
}

function accountMovementOrigin(reportId: string) {
  return `faturacao_${reportId}`;
}

function accountMovementItem(eventoNome: string) {
  return `Faturação - ${eventoNome}`;
}

async function getAccountMovement(reportId: string) {
  const rows = await supabaseRequest<AccountMovementRow[]>(
    `movimentos?origem_tabela=eq.${encodeURIComponent(accountMovementOrigin(reportId))}&select=id,item,montante,raw&limit=1`,
    "GET"
  );
  return rows[0] ?? null;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;
  const { id } = await params;

  const body = await readJsonBody(request);
  const { justification, error: justificationError } = requireJustification(body.justification);
  if (justificationError) return justificationError;

  const valorFatura = numberValue(body.valor_fatura);
  if (!Number.isFinite(valorFatura)) {
    return NextResponse.json({ message: "Indica um valor de fatura válido." }, { status: 400 });
  }

  try {
    const report = await getReport(id);
    if (!report) {
      return NextResponse.json({ message: "Fatura não encontrada." }, { status: 404 });
    }

    const payload = reportPayload(report);
    const { totals, totalDespesas, totalItensAcrescentados, totalFaturado, transferenciasComNif, transferenciasSemNif } =
      reportTotals(report);
    const diferenca = valorFatura - totalFaturado;
    const montanteDepositar = diferenca + transferenciasComNif + transferenciasSemNif;
    const nextPayload = {
      ...payload,
      totais: {
        ...totals,
        despesas_evento: totalDespesas,
        itens_acrescentados: totalItensAcrescentados,
        total_faturado: totalFaturado,
        valor_fatura: valorFatura,
        diferenca,
        transferencias_com_nif: transferenciasComNif,
        transferencias_sem_nif: transferenciasSemNif,
        montante_depositar: montanteDepositar
      },
      ultima_alteracao: {
        data: new Date().toISOString(),
        utilizador: access.session.username,
        role: access.session.role,
        justificacao: justification
      }
    };

    const updated = await supabaseRequest<FaturacaoReportRow[]>(
      `faturas_relatorios?id=eq.${encodeURIComponent(report.id)}`,
      "PATCH",
      {
        valor_fatura: valorFatura,
        total_despesas: totalDespesas,
        total_itens_acrescentados: totalItensAcrescentados,
        total_faturado: totalFaturado,
        diferenca,
        payload: nextPayload
      }
    );

    const nextReport = updated[0];
    if (!nextReport) throw new Error("A fatura foi alterada, mas a resposta veio vazia.");

    const accountMovement = await getAccountMovement(report.id);
    if (accountMovement) {
      await supabaseRequest<AccountMovementRow[]>(`movimentos?id=eq.${encodeURIComponent(accountMovement.id)}`, "PATCH", {
        item: accountMovementItem(report.evento_nome),
        montante: montanteDepositar,
        tipo_pagamento: "Conta Q26",
        raw: {
          ...(isRecord(accountMovement.raw) ? accountMovement.raw : {}),
          origem: "faturacao",
          relatorio_id: report.id,
          evento_slug: report.evento_slug,
          evento_nome: report.evento_nome,
          item: accountMovementItem(report.evento_nome),
          montante: montanteDepositar,
          montante_depositar: montanteDepositar,
          tipo_pagamento: "Conta Q26",
          tipo_entrada: "Depósito",
          ultima_alteracao: {
            data: new Date().toISOString(),
            utilizador: access.session.username,
            role: access.session.role,
            justificacao: justification
          }
        }
      });
    }

    await writeAuditLog({
      session: access.session,
      action: "Editou fatura",
      resource: "faturas_relatorios",
      resourceId: report.id,
      summary: `Fatura ${report.evento_nome}: ${valorFatura.toFixed(2)}`,
      details: {
        evento_slug: report.evento_slug,
        valor_anterior: report.valor_fatura,
        valor_fatura: valorFatura,
        diferenca,
        montante_depositar: montanteDepositar,
        movimento_conta_id: accountMovement?.id ?? null,
        justificacao: justification
      }
    });

    return NextResponse.json({ report: nextReport });
  } catch (error) {
    return NextResponse.json(
      { message: `Não consegui editar a fatura. ${error instanceof Error ? error.message : ""}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const deleteError = requireDeleteAccess(access.session);
  if (deleteError) return deleteError;

  const { id } = await params;

  const body = await readJsonBody(request);
  const { justification, error: justificationError } = requireJustification(body.justification);
  if (justificationError) return justificationError;

  try {
    const report = await getReport(id);
    if (!report) {
      return NextResponse.json({ message: "Fatura não encontrada." }, { status: 404 });
    }

    const accountMovement = await getAccountMovement(report.id);
    if (accountMovement) {
      await supabaseRequest<AccountMovementRow[]>(`movimentos?id=eq.${encodeURIComponent(accountMovement.id)}`, "DELETE");
    }

    await supabaseRequest<FaturacaoReportRow[]>(`faturas_relatorios?id=eq.${encodeURIComponent(report.id)}`, "DELETE");

    await writeAuditLog({
      session: access.session,
      action: "Apagou fatura",
      resource: "faturas_relatorios",
      resourceId: report.id,
      summary: `Fatura ${report.evento_nome}: ${report.total_faturado.toFixed(2)}`,
      details: {
        evento_slug: report.evento_slug,
        valor_fatura: report.valor_fatura,
        total_faturado: report.total_faturado,
        diferenca: report.diferenca,
        movimentos_ids: report.movimentos_ids,
        movimento_conta_id: accountMovement?.id ?? null,
        justificacao: justification
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: `Não consegui apagar a fatura. ${error instanceof Error ? error.message : ""}` },
      { status: 500 }
    );
  }
}
