import { NextResponse } from "next/server";
import { getBackupRun } from "../../../../backup-manager";
import { getSession } from "../../../../auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ message: "Sessão expirada." }, { status: 401 }) };
  if (session.role !== "admin") return { error: NextResponse.json({ message: "Só Admin pode descarregar backups." }, { status: 403 }) };
  return { error: null };
}

function backupFileName(createdAt: string) {
  const stamp = createdAt.slice(0, 19).replace(/[:T]/g, "-");
  return `q26-backup-guardado-${stamp}.json`;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const access = await requireAdmin();
  if (access.error) return access.error;

  const { id } = await params;
  const run = await getBackupRun(id);
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

