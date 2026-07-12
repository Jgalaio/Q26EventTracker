import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
import { hashCredential, listAuthUsers, supabaseAdminHeaders } from "../../../auth";
import { getRoleLabel } from "../../../role-settings";
import {
  getManagedUser,
  missingAdminKeyResponse,
  normalizeRole,
  normalizeUsername,
  requireAdminUserAccess,
  roleExists,
  safeUser,
  supabaseAdminRequest,
  type ManagedUser
} from "./user-utils";

export async function GET() {
  const access = await requireAdminUserAccess();
  if (access.error) return access.error;

  const users = await listAuthUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const access = await requireAdminUserAccess();
  if (access.error) return access.error;
  if (!supabaseAdminHeaders()) return missingAdminKeyResponse();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const username = normalizeUsername(body.username);
  const role = normalizeRole(body.role);
  const password = typeof body.password === "string" ? body.password : "";

  if (!username) {
    return NextResponse.json({ message: "Indica o nome do utilizador." }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ message: "Escolhe um role válido." }, { status: 400 });
  }
  if (!(await roleExists(role))) {
    return NextResponse.json({ message: "Esse role não existe." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ message: "A password deve ter pelo menos 6 caracteres." }, { status: 400 });
  }

  try {
    const existingUser = await getManagedUser(username);
    if (existingUser) {
      return NextResponse.json({ message: "Já existe um utilizador com esse nome." }, { status: 409 });
    }

    const updatedAt = new Date().toISOString();
    await supabaseAdminRequest(
      "app_users",
      "POST",
      {
        username,
        role,
        password_hash: hashCredential(username, password),
        updated_at: updatedAt
      },
      "return=minimal"
    );

    const user: ManagedUser = { username, role, updated_at: updatedAt };
    await writeAuditLog({
      session: access.session,
      action: "Criou utilizador",
      resource: "app_users",
      resourceId: username,
      summary: `Criou utilizador ${username} (${await getRoleLabel(role)})`,
      details: { username, role }
    });

    return NextResponse.json({ message: "Utilizador criado.", user: safeUser(user) });
  } catch (error) {
    if (error instanceof Error && error.message === "missing_admin_key") return missingAdminKeyResponse();
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível criar o utilizador." },
      { status: 500 }
    );
  }
}
