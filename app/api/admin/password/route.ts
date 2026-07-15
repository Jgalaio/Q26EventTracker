import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
import { getSession, verifyCredentials } from "../../../auth";
import { saveUserPassword } from "../../../password-storage";

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

  const savedPassword = await saveUserPassword(session.username, session.role, newPassword);
  if (!savedPassword.ok) return NextResponse.json({ message: savedPassword.message }, { status: savedPassword.status });

  await writeAuditLog({
    session,
    action: "Alterou password",
    resource: "app_users",
    resourceId: session.username,
    summary: `${session.username} alterou a password`,
    details: { username: session.username }
  });

  return NextResponse.json({ message: "Password alterada com sucesso." });
}
