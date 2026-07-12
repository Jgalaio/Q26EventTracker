import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../../audit-log";
import { createStoredBackup, getBackupSettings, getNextBackupAt, shouldRunAutomaticBackup } from "../../../../backup-manager";
import { EMPTY_ROLE_PERMISSIONS, type AuthSession } from "../../../../auth-types";

const systemSession: AuthSession = {
  username: "Sistema",
  role: "admin",
  roleLabel: "Admin",
  permissions: EMPTY_ROLE_PERMISSIONS
};

function cronIsAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, message: "Falta configurar CRON_SECRET no Vercel." };
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${secret}`
    ? { ok: true, message: null }
    : { ok: false, message: "Chamada de cron não autorizada." };
}

export async function GET(request: NextRequest) {
  const auth = cronIsAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json({ message: auth.message }, { status: auth.message?.includes("CRON_SECRET") ? 503 : 401 });
  }

  const settings = await getBackupSettings();
  if (!settings.enabled) {
    return NextResponse.json({ message: "Backup automático pausado.", skipped: true, settings });
  }

  if (!shouldRunAutomaticBackup(settings)) {
    return NextResponse.json({
      message: "Ainda não está na hora do próximo backup.",
      nextBackupAt: getNextBackupAt(settings),
      skipped: true,
      settings
    });
  }

  try {
    const result = await createStoredBackup(systemSession, "automatic");
    await writeAuditLog({
      session: systemSession,
      action: "Criou backup automático",
      resource: "database",
      resourceId: result.run.id,
      summary: "Cron criou backup automático da base de dados",
      details: { counts: result.run.counts, sizeBytes: result.run.sizeBytes }
    });

    return NextResponse.json({
      message: "Backup automático criado.",
      run: {
        id: result.run.id,
        createdAt: result.run.createdAt,
        status: result.run.status,
        sizeBytes: result.run.sizeBytes,
        counts: result.run.counts
      },
      settings: result.settings
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível criar backup automático." },
      { status: 500 }
    );
  }
}

