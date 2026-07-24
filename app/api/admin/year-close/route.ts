import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
import {
  backupRunSummary,
  createDatabaseBackupSnapshot,
  createStoredBackup,
  getBackupRunSummaries
} from "../../../backup-manager";
import { getSession, supabaseAdminHeaders } from "../../../auth";
import type { AuthSession } from "../../../auth-types";
import { isBankAccountPayment } from "../../../payment-labels";
import { getTesourariaData, type EventoResumo, type MovimentoDetalhe } from "../../../supabase-data";
import { missingAdminKeyResponse, supabaseAdminRequest } from "../users/user-utils";

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

type OverviewArchiveRow = Summary & {
  nome: string;
  slug: string;
  contabilizarTotais: boolean;
  movimentos: MovimentoDetalhe[];
};

const PAGE_SIZE = 1000;

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

function isPendingPayment(movimento: MovimentoDetalhe) {
  return movimento.tipo !== "entrada" && movimento.pago === false;
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
  if (isBankAccountPayment(movimento.tipo_pagamento)) summary.pagoQ26 += amount;
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

function summarizeEvent(event: EventoResumo, movimentos: MovimentoDetalhe[]): OverviewArchiveRow {
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
      error: NextResponse.json({ message: "Só Admin pode encerrar o ano." }, { status: 403 })
    };
  }
  return { session, error: null };
}

async function fetchAllAdminRows(table: string, order: string) {
  const rows: JsonRecord[] = [];
  let offset = 0;

  while (true) {
    const page = await supabaseAdminRequest<JsonRecord[]>(
      `${table}?select=*&order=${order}&limit=${PAGE_SIZE}&offset=${offset}`,
      "GET"
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function safeUserArchive(users: JsonRecord[]) {
  return users.map((user) => ({
    username: typeof user.username === "string" ? user.username : "",
    role: typeof user.role === "string" ? user.role : "",
    updated_at: typeof user.updated_at === "string" ? user.updated_at : null
  }));
}

function buildOverviewArchive(eventos: EventoResumo[], movimentos: MovimentoDetalhe[]) {
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

  return {
    countedRows: rows.filter((row) => row.contabilizarTotais).length,
    eventsCount: rows.length,
    rows,
    totals
  };
}

async function createYearCloseArchive(session: AuthSession) {
  const now = new Date().toISOString();
  const [database, tesourariaData, users, auditLogs] = await Promise.all([
    createDatabaseBackupSnapshot(),
    getTesourariaData(),
    fetchAllAdminRows("app_users", "username.asc"),
    fetchAllAdminRows("app_audit_logs", "created_at.asc")
  ]);

  return {
    type: "q26-year-close",
    version: 1,
    exported_at: now,
    generated_by: session.username,
    database,
    overview: buildOverviewArchive(tesourariaData.eventos, tesourariaData.movimentos),
    users: safeUserArchive(users),
    audit_logs: auditLogs
  };
}

async function clearOperationalYearData() {
  await supabaseAdminRequest("notas?id=not.is.null", "DELETE", undefined, "return=minimal");
  await supabaseAdminRequest("faturas_relatorios?id=not.is.null", "DELETE", undefined, "return=minimal");
  await supabaseAdminRequest("movimentos?id=not.is.null", "DELETE", undefined, "return=minimal");
  await supabaseAdminRequest("eventos?id=not.is.null", "DELETE", undefined, "return=minimal");
}

async function deleteNonAdminUsers() {
  const users = await supabaseAdminRequest<Array<{ username: string; role: string; updated_at: string | null }>>(
    "app_users?role=neq.admin&select=username,role,updated_at&order=username.asc",
    "GET"
  );
  await supabaseAdminRequest("app_users?role=neq.admin", "DELETE", undefined, "return=minimal");
  return users;
}

async function remainingUsers() {
  return supabaseAdminRequest<Array<{ username: string; role: string; updated_at: string | null }>>(
    "app_users?select=username,role,updated_at&order=username.asc",
    "GET"
  );
}

export async function POST(request: NextRequest) {
  const access = await requireAdmin();
  if (access.error) return access.error;
  if (!supabaseAdminHeaders()) return missingAdminKeyResponse();

  const body = (await request.json().catch(() => ({}))) as JsonRecord;

  if (body.action === "prepare") {
    try {
      const archive = await createYearCloseArchive(access.session);
      const backupResult = await createStoredBackup(access.session, "manual");
      const runs = await getBackupRunSummaries();

      await writeAuditLog({
        session: access.session,
        action: "Preparou encerramento anual",
        resource: "database",
        resourceId: backupResult.run.id,
        summary: "Exportou encerramento anual e criou backup manual",
        details: {
          eventos: archive.database.tables.eventos.length,
          movimentos: archive.database.tables.movimentos.length,
          notas: archive.database.tables.notas.length,
          faturas_relatorios: archive.database.tables.faturas_relatorios.length,
          users: archive.users.length
        }
      });

      return NextResponse.json({
        message: "Encerramento preparado. Foram gerados o ficheiro JSON, o Excel e um backup no bucket.",
        archive,
        backupRun: backupRunSummary(backupResult.run),
        settings: backupResult.settings,
        runs
      });
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Não foi possível preparar o encerramento anual." },
        { status: 500 }
      );
    }
  }

  if (body.action === "reset") {
    if (body.confirmation !== "encerrar q26") {
      return NextResponse.json({ message: "Escreve exatamente: encerrar q26" }, { status: 400 });
    }

    try {
      const backupResult = await createStoredBackup(access.session, "manual");
      await clearOperationalYearData();
      const deletedUsers = await deleteNonAdminUsers();
      const users = await remainingUsers();
      const runs = await getBackupRunSummaries();

      await writeAuditLog({
        session: access.session,
        action: "Iniciou novo ano",
        resource: "database",
        resourceId: backupResult.run.id,
        summary: "Limpou dados anuais e manteve utilizadores Admin",
        details: {
          backupRunId: backupResult.run.id,
          deletedUsers: deletedUsers.map((user) => ({ username: user.username, role: user.role }))
        }
      });

      return NextResponse.json({
        message: "Ano novo iniciado. Dados anuais limpos e Admins mantidos.",
        settings: backupResult.settings,
        runs,
        users
      });
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Não foi possível iniciar o novo ano." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: "Ação inválida." }, { status: 400 });
}
