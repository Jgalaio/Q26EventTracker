import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
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

type ReportEvent = {
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

function parseEvents(value: unknown): ReportEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((event) => ({
      id: stringValue(event.id),
      slug: stringValue(event.slug),
      nome: stringValue(event.nome)
    }))
    .filter((event) => event.id && event.slug && event.nome);
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

export async function POST(request: NextRequest) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const body = await readJsonBody(request);
  const eventoId = stringValue(body.evento_id);
  const eventoSlug = stringValue(body.evento_slug);
  const eventoNome = stringValue(body.evento_nome);
  const selectedEvents = parseEvents(body.eventos);
  const valorFatura = numberValue(body.valor_fatura);
  const despesasEvento = parseItems(body.despesas_evento);
  const itensAcrescentados = parseItems(body.itens_acrescentados);
  const totalDespesas = despesasEvento.reduce((sum, item) => sum + item.montante, 0);
  const totalItensAcrescentados = itensAcrescentados.reduce((sum, item) => sum + item.montante, 0);
  const totalFaturado = totalDespesas + totalItensAcrescentados;
  const diferenca = totalFaturado - valorFatura;
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

  const movimentosIds = [...despesasEvento, ...itensAcrescentados].map((item) => item.id);
  const reportPayload = {
    finalizado_em: now,
    evento: {
      id: eventoId || null,
      slug: eventoSlug,
      nome: eventoNome
    },
    eventos: selectedEvents,
    despesas_evento: despesasEvento,
    itens_acrescentados: itensAcrescentados,
    totais: {
      despesas_evento: totalDespesas,
      itens_acrescentados: totalItensAcrescentados,
      total_faturado: totalFaturado,
      valor_fatura: valorFatura,
      diferenca
    }
  };

  try {
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

    await Promise.all(
      itensAcrescentados.map((item) =>
        supabaseRequest(`movimentos?id=eq.${encodeURIComponent(item.id)}`, "PATCH", {
          raw: {
            ...(item.raw ?? {}),
            faturar_mais_tarde: false,
            faturacao: {
              relatorio_id: report.id,
              finalizado_em: now,
              evento_slug: eventoSlug,
              evento_nome: eventoNome,
              valor_fatura: valorFatura
            }
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
        eventos: selectedEvents,
        valor_fatura: valorFatura,
        total_faturado: totalFaturado,
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
