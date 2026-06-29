import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
import { getSession } from "../../../auth";
import type { AuthSession } from "../../../auth-types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";

type JsonRecord = Record<string, unknown>;

type AdminAccess =
  | {
      session: AuthSession;
      error: null;
    }
  | {
      session: null;
      error: NextResponse;
    };

const PAGE_SIZE = 1000;
const IMPORT_CHUNK_SIZE = 250;

const EVENT_COLUMNS = [
  "id",
  "slug",
  "nome",
  "folha_excel",
  "ordem_folha",
  "data_texto",
  "data_inicio",
  "data_fim",
  "isento",
  "isento_texto",
  "contabilizar_totais",
  "cor",
  "fechado",
  "tipo",
  "created_at"
];

const MOVEMENT_COLUMNS = [
  "id",
  "evento_id",
  "tipo",
  "item",
  "descricao",
  "data_pagamento",
  "montante",
  "numero_fatura",
  "fatura_com_nif",
  "tipo_pagamento",
  "pago",
  "contabilizar_totais",
  "origem_tabela",
  "origem_linha",
  "formula_montante",
  "raw",
  "created_at"
];

const SETTINGS_COLUMNS = ["key", "value", "updated_at"];

const NOTES_COLUMNS = [
  "id",
  "titulo",
  "conteudo",
  "tipo_tarefa",
  "estado",
  "prioridade",
  "agendado_para",
  "prazo_para",
  "responsavel",
  "categoria",
  "concluido_em",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at"
];

const INVOICE_REPORT_COLUMNS = [
  "id",
  "created_at",
  "created_by",
  "evento_id",
  "evento_slug",
  "evento_nome",
  "valor_fatura",
  "total_despesas",
  "total_itens_acrescentados",
  "total_faturado",
  "diferenca",
  "movimentos_ids",
  "payload"
];

function endpoint(resource: string) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requireAdmin(): Promise<AdminAccess> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
    };
  }
  if (session.role !== "admin") {
    return {
      session: null,
      error: NextResponse.json({ message: "Só Admin pode gerir a base de dados." }, { status: 403 })
    };
  }
  return { session, error: null };
}

async function supabaseRequest<T>(resource: string, method: string, body?: unknown) {
  const response = await fetch(endpoint(resource), {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${responseText}`);
  }

  return (responseText ? JSON.parse(responseText) : null) as T;
}

async function fetchAllRows(table: string, order: string) {
  const rows: JsonRecord[] = [];
  let offset = 0;

  while (true) {
    const page = await supabaseRequest<JsonRecord[]>(
      `${table}?select=*&order=${order}&limit=${PAGE_SIZE}&offset=${offset}`,
      "GET"
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function pickColumns(rows: unknown, columns: string[]) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(isRecord).map((row) =>
    columns.reduce<JsonRecord>((cleanRow, column) => {
      if (column in row) cleanRow[column] = row[column];
      return cleanRow;
    }, {})
  );
}

function backupTables(value: JsonRecord) {
  const source = isRecord(value.tables) ? value.tables : value;
  return {
    eventos: pickColumns(source.eventos, EVENT_COLUMNS),
    movimentos: pickColumns(source.movimentos, MOVEMENT_COLUMNS),
    app_settings: pickColumns(source.app_settings, SETTINGS_COLUMNS),
    notas: pickColumns(source.notas, NOTES_COLUMNS),
    faturas_relatorios: pickColumns(source.faturas_relatorios, INVOICE_REPORT_COLUMNS)
  };
}

async function deleteAllRows() {
  await supabaseRequest("notas?id=not.is.null", "DELETE");
  await supabaseRequest("faturas_relatorios?id=not.is.null", "DELETE");
  await supabaseRequest("movimentos?id=not.is.null", "DELETE");
  await supabaseRequest("eventos?id=not.is.null", "DELETE");
  await supabaseRequest("app_settings?key=not.is.null", "DELETE");
}

async function insertRows(table: string, rows: JsonRecord[]) {
  for (let index = 0; index < rows.length; index += IMPORT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + IMPORT_CHUNK_SIZE);
    if (chunk.length) await supabaseRequest(table, "POST", chunk);
  }
}

export async function GET() {
  const access = await requireAdmin();
  if (access.error) return access.error;

  try {
    const [eventos, movimentos, appSettings, notas, faturasRelatorios] = await Promise.all([
      fetchAllRows("eventos", "ordem_folha.asc"),
      fetchAllRows("movimentos", "created_at.asc"),
      fetchAllRows("app_settings", "key.asc"),
      fetchAllRows("notas", "updated_at.asc"),
      fetchAllRows("faturas_relatorios", "created_at.asc")
    ]);

    await writeAuditLog({
      session: access.session,
      action: "Exportou base de dados",
      resource: "database",
      summary: "Exportou backup JSON",
      details: {
        eventos: eventos.length,
        movimentos: movimentos.length,
        app_settings: appSettings.length,
        notas: notas.length,
        faturas_relatorios: faturasRelatorios.length
      }
    });

    return NextResponse.json({
      exported_at: new Date().toISOString(),
      version: 1,
      tables: {
        eventos,
        movimentos,
        app_settings: appSettings,
        notas,
        faturas_relatorios: faturasRelatorios
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível exportar a base de dados." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdmin();
  if (access.error) return access.error;

  const body = (await request.json().catch(() => ({}))) as JsonRecord;
  const backup = isRecord(body.backup) ? body.backup : body;
  const tables = backupTables(backup);

  if (
    !tables.eventos.length &&
    !tables.movimentos.length &&
    !tables.app_settings.length &&
    !tables.notas.length &&
    !tables.faturas_relatorios.length
  ) {
    return NextResponse.json({ message: "O ficheiro não tem dados válidos para importar." }, { status: 400 });
  }

  try {
    await deleteAllRows();
    await insertRows("eventos", tables.eventos);
    await insertRows("movimentos", tables.movimentos);
    await insertRows("app_settings", tables.app_settings);
    await insertRows("notas", tables.notas);
    await insertRows("faturas_relatorios", tables.faturas_relatorios);

    await writeAuditLog({
      session: access.session,
      action: "Importou base de dados",
      resource: "database",
      summary: "Importou backup JSON",
      details: {
        eventos: tables.eventos.length,
        movimentos: tables.movimentos.length,
        app_settings: tables.app_settings.length,
        notas: tables.notas.length,
        faturas_relatorios: tables.faturas_relatorios.length
      }
    });

    return NextResponse.json({
      message: "Base de dados importada.",
      counts: Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, rows.length]))
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível importar a base de dados." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const access = await requireAdmin();
  if (access.error) return access.error;

  const body = (await request.json().catch(() => ({}))) as JsonRecord;
  if (body.confirmation !== "sim confirmo") {
    return NextResponse.json({ message: "Escreve exatamente: sim confirmo" }, { status: 400 });
  }

  try {
    await deleteAllRows();
    await writeAuditLog({
      session: access.session,
      action: "Recomeçou base de dados",
      resource: "database",
      summary: "Limpou eventos, movimentos, relatórios, notas e definições",
      details: { confirmation: body.confirmation }
    });

    return NextResponse.json({ message: "Base de dados limpa. Utilizadores e log foram mantidos." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível limpar a base de dados." },
      { status: 500 }
    );
  }
}
