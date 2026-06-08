import { NextRequest, NextResponse } from "next/server";
import { deleteAppSetting, writeAppSetting } from "../../../app-settings";
import { getSession } from "../../../auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ message: "Só Admin pode alterar o logo." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : null;

  if (!dataUrl.startsWith("data:image/")) {
    return NextResponse.json({ message: "Escolhe uma imagem válida." }, { status: 400 });
  }

  if (dataUrl.length > 1_800_000) {
    return NextResponse.json({ message: "A imagem é demasiado pesada. Usa um logo mais pequeno." }, { status: 400 });
  }

  try {
    await writeAppSetting("report_logo", { dataUrl, fileName });
    return NextResponse.json({ message: "Logo do relatório atualizado." });
  } catch (error) {
    return NextResponse.json(
      {
        message: `Não consegui guardar no Supabase. Confirma se já correste o SQL de admin. ${
          error instanceof Error ? error.message : ""
        }`
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ message: "Só Admin pode alterar o logo." }, { status: 403 });

  try {
    await deleteAppSetting("report_logo");
    return NextResponse.json({ message: "Logo personalizado removido." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Não foi possível remover." }, { status: 500 });
  }
}
