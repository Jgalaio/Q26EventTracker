import { NextResponse } from "next/server";
import { getMovementAuditLogs } from "../../../../audit-log";
import { getSession } from "../../../../auth";
import { canViewTreasury } from "../../../../auth-types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada. Entra novamente." }, { status: 401 });
  if (!canViewTreasury(session)) return NextResponse.json({ message: "Sem permissão para consultar este histórico." }, { status: 403 });

  const { id } = await context.params;
  const history = await getMovementAuditLogs(id, 80);
  if (history.error) {
    return NextResponse.json({ message: history.error, logs: [] }, { status: 400 });
  }

  return NextResponse.json({ logs: history.logs });
}
