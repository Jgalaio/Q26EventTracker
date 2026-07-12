import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../audit-log";
import { writeAppSetting } from "../../app-settings";
import { getSession } from "../../auth";
import { getUserQuickNotes, type UserQuickNotes, userQuickNotesKey } from "../../user-quick-notes";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  return NextResponse.json(await getUserQuickNotes(session.username));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.slice(0, 6000) : "";
  const settingKey = userQuickNotesKey(session.username);
  const nextNotes: UserQuickNotes = {
    content,
    updatedAt: new Date().toISOString(),
    updatedBy: session.username
  };

  try {
    await writeAppSetting(settingKey, nextNotes);
    await writeAuditLog({
      session,
      action: "Alterou apontamentos rápidos",
      resource: "app_settings",
      resourceId: settingKey,
      summary: "Apontamentos rápidos atualizados",
      details: { length: content.length }
    });
    return NextResponse.json(nextNotes);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível guardar os apontamentos." },
      { status: 500 }
    );
  }
}
