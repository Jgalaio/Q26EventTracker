import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
import { BANK_ACCOUNT_DEPOSIT_PAYMENT } from "../../../payment-labels";
import { readJsonBody, requireWriteAccess } from "../../q26-write";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";

type JsonRecord = Record<string, unknown>;

type ReportItem = {
  id: string;
  evento_slug: string;
  evento_nome: string;
  item: string;
  descricao: string | null;
  data_pagamento: string | null;
  tipo_pagamento: string | null;
  numero_fatura: string | null;
  montante: number;
  raw?: JsonRecord;
};

type EventRow = {
  id: string;
  slug: string;
  nome: string;
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

function calculateDepositAmount(valorFatura: number, totalFaturado: number) {
  return valorFatura + totalFaturado;
}

function parseItems(value: unknown): ReportItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      id: stringValue(item.id),
      evento_slug: stringValue(item.evento_slug),
      evento_nome: stringValue(item.evento_nome),
      item: stringValue(item.item) || "(sem item)",
      descricao: typeof item.descricao === "string" ? item.descricao : null,
      data_pagamento: typeof item.data_pagamento === "string" ? item.data_pagamento : null,
      tipo_pagamento: typeof item.tipo_pagamento === "string" ? item.tipo_pagamento : null,
      numero_fatura: typeof item.numero_fatura === "string" ? item.numero_fatura : null,
      montante: amountValue(item.montante),
      raw: isRecord(item.raw) ? item.raw : {}
    }))
    .filter((item) => item.id);
}

async function supabaseRequest<T>(resource: string, method: string, body?: JsonRecord) {
  const response = await fetch(endpoint(resource), {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${responseText}`);
  }

  return (responseText ? JSON.parse(responseText) : null) as T;
}

async function updateMovementRaw(movementId: string, rawPatch: JsonRecord) {
  const currentRows = await supabaseRequest<Array<{ raw: JsonRecord | null }>>(
    `movimentos?id=eq.${encodeURIComponent(movementId)}&select=raw&limit=1`,
    "GET"
  );
  const currentRaw = isRecord(currentRows[0]?.raw) ? currentRows[0].raw : {};
  return supabaseRequest(`movimentos?id=eq.${encodeURIComponent(movementId)}`, "PATCH", {
    raw: {
      ...currentRaw,
      ...rawPatch
    }
  });
}

function accountMovementOrigin(reportId: string) {
  return `faturacao_${reportId}`;
}

function accountMovementItem(eventoNome: string) {
  return `Faturação - ${eventoNome}`;
}

async function getAccountEvent() {
  const rows = await supabaseRequest<EventRow[]>("eventos?slug=eq.contas&select=id,slug,nome&limit=1", "GET");
  return rows[0] ?? null;
}

export async function POST(request: NextRequest) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const body = await readJsonBody(request);
  const eventoId = stringValue(body.evento_id);
  const eventoSlug = stringValue(body.evento_slug);
  const eventoNome = stringValue(body.evento_nome);
  const valorFatura = numberValue(body.valor_fatura);
  const despesasEvento = parseItems(body.despesas_evento);
  const itensAcrescentados = parseItems(body.itens_acrescentados);
  const transferenciasSemNif = parseItems(body.transferencias_sem_nif);
  const totalDespesas = despesasEvento.reduce((sum, item) => sum + item.montante, 0);
  const totalItensAcrescentados = itensAcrescentados.reduce((sum, item) => sum + item.montante, 0);
  const totalTransferenciasSemNif = transferenciasSemNif.reduce((sum, item) => sum + item.montante, 0);
  const totalFaturado = totalDespesas + totalItensAcrescentados;
  const diferenca = valorFatura - totalFaturado;
  const montanteDepositar = calculateDepositAmount(valorFatura, totalFaturado);
  const now = new Date().toISOString();

  if (!eventoSlug || !eventoNome) {
    return NextResponse.json({ message: "Escolhe um evento válido." }, { status: 400 });
  }

  if (!Number.isFinite(valorFatura)) {
    return NextResponse.json({ message: "Indica um valor de fatura válido." }, { status: 400 });
  }

  if (totalFaturado <= 0) {
    return NextResponse.json({ message: "Não existem itens para faturar." }, { status: 400 });
  }

  const movimentosIds = [...despesasEvento, ...itensAcrescentados, ...transferenciasSemNif].map((item) => item.id);
  const reportPayload = {
    finalizado_em: now,
    evento: {
      id: eventoId || null,
      slug: eventoSlug,
      nome: eventoNome
    },
    despesas_evento: despesasEvento,
    itens_acrescentados: itensAcrescentados,
    transferencias_sem_nif: transferenciasSemNif,
    totais: {
      despesas_evento: totalDespesas,
      itens_acrescentados: totalItensAcrescentados,
      total_faturado: totalFaturado,
      valor_fatura: valorFatura,
      diferenca,
      transferencias_com_nif: totalDespesas,
      transferencias_sem_nif: totalTransferenciasSemNif,
      montante_depositar: montanteDepositar,
      formula_montante_depositar: "valor_fatura_mais_total_faturado"
    }
  };

  try {
    const accountEvent = await getAccountEvent();
    if (!accountEvent) {
      return NextResponse.json({ message: "Não encontrei a conta Q26 para registar o depósito." }, { status: 400 });
    }

    const inserted = await supabaseRequest<JsonRecord[]>("faturas_relatorios", "POST", {
      created_by: access.session.username,
      evento_id: eventoId || null,
      evento_slug: eventoSlug,
      evento_nome: eventoNome,
      valor_fatura: valorFatura,
      total_despesas: totalDespesas,
      total_itens_acrescentados: totalItensAcrescentados,
      total_faturado: totalFaturado,
      diferenca,
      movimentos_ids: movimentosIds,
      payload: reportPayload
    });
    const report = inserted[0];

    if (!report?.id || typeof report.id !== "string") {
      throw new Error("O relatório foi guardado, mas a resposta veio incompleta.");
    }

    const accountMovementRows = await supabaseRequest<JsonRecord[]>("movimentos", "POST", {
      evento_id: accountEvent.id,
      tipo: "entrada",
      item: accountMovementItem(eventoNome),
      descricao: null,
      data_pagamento: null,
      montante: montanteDepositar,
      numero_fatura: null,
      fatura_com_nif: null,
      tipo_pagamento: BANK_ACCOUNT_DEPOSIT_PAYMENT,
      pago: null,
      contabilizar_totais: true,
      origem_tabela: accountMovementOrigin(report.id),
      origem_linha: 1,
      formula_montante: null,
      raw: {
        origem: "faturacao",
        relatorio_id: report.id,
        evento_slug: eventoSlug,
        evento_nome: eventoNome,
        item: accountMovementItem(eventoNome),
        montante: montanteDepositar,
        montante_depositar: montanteDepositar,
        tipo_pagamento: BANK_ACCOUNT_DEPOSIT_PAYMENT,
        tipo_entrada: "Depósito",
        finalizado_em: now,
        created_by: access.session.username
      }
    });
    const accountMovement = accountMovementRows[0];
    if (accountMovement?.id && typeof accountMovement.id === "string") {
      await writeAuditLog({
        session: access.session,
        action: "Criou movimento",
        resource: "movimentos",
        resourceId: accountMovement.id,
        summary: `Criou movimento: ${accountMovementItem(eventoNome)}`,
        details: {
          method: "POST",
          resource: "movimentos",
          payload: accountMovement,
          before: null,
          after: accountMovement,
          origem_faturacao: report.id
        }
      });
    }

    await Promise.all(
      itensAcrescentados.map((item) =>
        updateMovementRaw(item.id, {
          ...(item.raw ?? {}),
          faturar_mais_tarde: false,
          faturacao: {
            relatorio_id: report.id,
            finalizado_em: now,
            evento_slug: eventoSlug,
            evento_nome: eventoNome,
            valor_fatura: valorFatura
          }
        })
      )
    );

    await writeAuditLog({
      session: access.session,
      action: "Finalizou fatura",
      resource: "faturas_relatorios",
      resourceId: report.id,
      summary: `Fatura ${eventoNome}: ${totalFaturado.toFixed(2)}`,
      details: {
        evento_slug: eventoSlug,
        valor_fatura: valorFatura,
        total_faturado: totalFaturado,
        montante_depositar: montanteDepositar,
        movimento_conta_id: typeof accountMovement?.id === "string" ? accountMovement.id : null,
        movimentos_ids: movimentosIds
      }
    });

    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json(
      {
        message: `Não consegui finalizar a fatura. Confirma se já correste o SQL das faturas no Supabase. ${
          error instanceof Error ? error.message : ""
        }`
      },
      { status: 500 }
    );
  }
}
