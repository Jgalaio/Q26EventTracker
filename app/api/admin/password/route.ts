import { NextRequest, NextResponse } from "next/server";
import { getSession, verifyCredentials } from "../../../auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ message: "Só Admin pode alterar passwords." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (newPassword.length < 6) {
    return NextResponse.json({ message: "A nova password deve ter pelo menos 6 caracteres." }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ message: "A confirmação não coincide com a nova password." }, { status: 400 });
  }

  const verified = await verifyCredentials(session.username, currentPassword);
  if (!verified) {
    return NextResponse.json({ message: "A password atual não está correta." }, { status: 400 });
  }

  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/app_change_password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_username: session.username,
      p_current_password: currentPassword,
      p_new_password: newPassword
    })
  });

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json(
      { message: `Não consegui guardar no Supabase. Confirma se já correste o SQL de admin. ${error}` },
      { status: 500 }
    );
  }

  const result = (await response.json().catch(() => false)) as boolean;
  if (!result) {
    return NextResponse.json({ message: "A password atual não está correta." }, { status: 400 });
  }

  return NextResponse.json({ message: "Password alterada com sucesso." });
}
