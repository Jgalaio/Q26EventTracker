import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
import {
  backupRunSummary,
  createStoredBackup,
  getBackupRunSummaries,
  getBackupSettings,
  saveBackupSettings,
  type BackupFrequency
} from "../../../backup-manager";
import { getSession } from "../../../auth";

type BackupRequestBody = {
  action?: unknown;
  enabled?: unknown;
  frequency?: unknown;
};

function isBackupFrequency(value: unknown): value is BackupFrequency {
  return value === "daily" || value === "weekly";
}

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { session: null, error: NextResponse.json({ message: "Sessão expirada." }, { status: 401 }) };
  if (session.role !== "admin") {
    return { session: null, error: NextResponse.json({ message: "Só Admin pode gerir backups." }, { status: 403 }) };
  }
  return { session, error: null };
}

export async function GET() {
  const access = await requireAdmin();
  if (access.error) return access.error;

  const [settings, runs] = await Promise.all([getBackupSettings(), getBackupRunSummaries()]);
  return NextResponse.json({ settings, runs });
}

export async function POST(request: NextRequest) {
  const access = await requireAdmin();
  if (access.error) return access.error;

  const body = (await request.json().catch(() => ({}))) as BackupRequestBody;

  if (body.action === "settings") {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ message: "Indica se o backup automático fica ativo ou pausado." }, { status: 400 });
    }
    if (!isBackupFrequency(body.frequency)) {
      return NextResponse.json({ message: "Escolhe uma periodicidade válida." }, { status: 400 });
    }

    const settings = await saveBackupSettings({ enabled: body.enabled, frequency: body.frequency }, access.session);
    const runs = await getBackupRunSummaries();

    await writeAuditLog({
      session: access.session,
      action: "Alterou backups automáticos",
      resource: "database",
      summary: settings.enabled ? `Backup automático ativo (${settings.frequency})` : "Backup automático pausado",
      details: { enabled: settings.enabled, frequency: settings.frequency }
    });

    return NextResponse.json({ message: "Definições de backup guardadas.", settings, runs });
  }

  if (body.action === "create") {
    try {
      const result = await createStoredBackup(access.session, "manual");
      const runs = result.runs.map(backupRunSummary);

      await writeAuditLog({
        session: access.session,
        action: "Criou backup guardado",
        resource: "database",
        resourceId: result.run.id,
        summary: "Criou backup manual da base de dados",
        details: { counts: result.run.counts, sizeBytes: result.run.sizeBytes }
      });

      return NextResponse.json({
        message: "Backup guardado.",
        settings: result.settings,
        runs,
        run: runs[0]
      });
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Não foi possível criar o backup." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: "Ação inválida." }, { status: 400 });
}
