import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../../audit-log";
import { backupRunSummary, deleteStoredBackup, getBackupRun } from "../../../../backup-manager";
import { getSession } from "../../../../auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { session: null, error: NextResponse.json({ message: "Sessão expirada." }, { status: 401 }) };
  if (session.role !== "admin") {
    return { session: null, error: NextResponse.json({ message: "Só Admin pode gerir backups." }, { status: 403 }) };
  }
  return { session, error: null };
}

function backupFileName(createdAt: string) {
  const stamp = createdAt.slice(0, 19).replace(/[:T]/g, "-");
  return `q26-backup-guardado-${stamp}.json`;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const access = await requireAdmin();
  if (access.error) return access.error;

  const { id } = await params;
  let run: Awaited<ReturnType<typeof getBackupRun>>;
  try {
    run = await getBackupRun(id);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível abrir o backup guardado." },
      { status: 500 }
    );
  }

  if (!run?.snapshot) {
    return NextResponse.json({ message: "Backup não encontrado ou sem ficheiro guardado." }, { status: 404 });
  }

  return new NextResponse(JSON.stringify(run.snapshot, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename="${backupFileName(run.createdAt)}"`,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const access = await requireAdmin();
  if (access.error) return access.error;
  if (!access.session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const { id } = await params;
  try {
    const result = await deleteStoredBackup(id);
    if (!result) {
      return NextResponse.json({ message: "Backup não encontrado." }, { status: 404 });
    }

    await writeAuditLog({
      session: access.session,
      action: "Apagou backup guardado",
      resource: "database",
      resourceId: result.run.id,
      summary: `Apagou backup ${result.run.trigger === "automatic" ? "automático" : "manual"} da base de dados`,
      details: {
        createdAt: result.run.createdAt,
        trigger: result.run.trigger,
        storageBucket: result.run.storageBucket ?? null,
        storagePath: result.run.storagePath ?? null
      }
    });

    return NextResponse.json({
      message: "Backup apagado.",
      runs: result.runs.map(backupRunSummary)
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível apagar o backup." },
      { status: 500 }
    );
  }
}
