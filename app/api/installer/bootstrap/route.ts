import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken, getSession } from "../../../auth";
import { sessionFromRole } from "../../../auth-types";
import { bootstrapFirstAdmin, getInstallerStatus, installerSecretMatches } from "../../../installer";

type JsonBody = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as JsonBody;
  const status = await getInstallerStatus();
  const session = await getSession();
  const sessionIsAdmin = session?.role === "admin";

  if (status.installed && !sessionIsAdmin) {
    return NextResponse.json({ message: "O instalador já está fechado porque já existe Admin." }, { status: 409 });
  }

  if (!status.schemaReady) {
    return NextResponse.json({ message: "A base de dados ainda não tem o schema aplicado." }, { status: 428 });
  }

  if (!sessionIsAdmin && !installerSecretMatches(body.installerSecret)) {
    return NextResponse.json({ message: "Chave do instalador inválida." }, { status: 403 });
  }

  if (body.password !== body.confirmPassword) {
    return NextResponse.json({ message: "A confirmação da password não coincide." }, { status: 400 });
  }

  try {
    const result = await bootstrapFirstAdmin(body.username, body.password);
    const installerSession = sessionFromRole(result.username, "admin");
    const response = NextResponse.json({
      message: "Instalação concluída. Primeiro Admin criado.",
      status: await getInstallerStatus()
    });
    response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(installerSession), {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível concluir a instalação." },
      { status: 500 }
    );
  }
}
