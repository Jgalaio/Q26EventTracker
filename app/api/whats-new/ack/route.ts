import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../auth";
import { latestWhatsNew, markLatestWhatsNewAsSeen } from "../../../whats-new";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (!latestWhatsNew) return NextResponse.json({ message: "Sem novidades ativas." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.releaseId !== latestWhatsNew.id) {
    return NextResponse.json({ message: "Esta versão de novidades já não é a atual." }, { status: 409 });
  }

  try {
    const seen = await markLatestWhatsNewAsSeen(session.username);
    return NextResponse.json({ message: "Novidades marcadas como vistas.", seen });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível guardar a confirmação." },
      { status: 500 }
    );
  }
}
