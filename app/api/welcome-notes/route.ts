import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../audit-log";
import { readAppSetting, writeAppSetting } from "../../app-settings";
import { getSession } from "../../auth";
import { canWrite } from "../../auth-types";

export type WelcomeQuickNotes = {
  content: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

const SETTING_KEY = "welcome_quick_notes";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const notes = await readAppSetting<WelcomeQuickNotes>(SETTING_KEY);
  return NextResponse.json(notes ?? { content: "", updatedAt: null, updatedBy: null });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (!canWrite(session.role)) return NextResponse.json({ message: "Sem permissão para alterar apontamentos." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.slice(0, 6000) : "";
  const nextNotes: WelcomeQuickNotes = {
    content,
    updatedAt: new Date().toISOString(),
    updatedBy: session.username
  };

  try {
    await writeAppSetting(SETTING_KEY, nextNotes);
    await writeAuditLog({
      session,
      action: "Alterou apontamentos rápidos",
      resource: "app_settings",
      resourceId: SETTING_KEY,
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
