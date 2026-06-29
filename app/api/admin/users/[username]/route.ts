import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../../audit-log";
import { hashCredential, supabaseAdminHeaders } from "../../../../auth";
import { ROLE_LABELS } from "../../../../auth-types";
import {
  countAdminUsers,
  getManagedUser,
  missingAdminKeyResponse,
  normalizeRole,
  normalizeUsername,
  requireAdminUserAccess,
  safeUser,
  supabaseAdminRequest
} from "../user-utils";

type RouteContext = {
  params: Promise<{ username: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await requireAdminUserAccess();
  if (access.error) return access.error;
  if (!supabaseAdminHeaders()) return missingAdminKeyResponse();

  const { username: rawUsername } = await context.params;
  const username = normalizeUsername(rawUsername);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nextRole = Object.prototype.hasOwnProperty.call(body, "role") ? normalizeRole(body.role) : null;
  const password = typeof body.password === "string" ? body.password : "";

  if (!username) {
    return NextResponse.json({ message: "Utilizador inválido." }, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, "role") && !nextRole) {
    return NextResponse.json({ message: "Escolhe um role válido." }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ message: "A password deve ter pelo menos 6 caracteres." }, { status: 400 });
  }

  try {
    const currentUser = await getManagedUser(username);
    if (!currentUser) {
      return NextResponse.json({ message: "Utilizador não encontrado." }, { status: 404 });
    }

    const role = nextRole ?? currentUser.role;
    if (currentUser.username === access.session.username && role !== "admin") {
      return NextResponse.json({ message: "Não podes retirar o teu próprio acesso Admin." }, { status: 400 });
    }
    if (currentUser.role === "admin" && role !== "admin" && (await countAdminUsers()) <= 1) {
      return NextResponse.json({ message: "Tem de existir pelo menos um Admin." }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    const payload: Record<string, unknown> = { role, updated_at: updatedAt };
    if (password) payload.password_hash = hashCredential(currentUser.username, password);

    await supabaseAdminRequest(
      `app_users?username=eq.${encodeURIComponent(currentUser.username)}`,
      "PATCH",
      payload,
      "return=minimal"
    );

    const updatedUser = { username: currentUser.username, role, updated_at: updatedAt };
    await writeAuditLog({
      session: access.session,
      action: "Alterou utilizador",
      resource: "app_users",
      resourceId: currentUser.username,
      summary: `Alterou utilizador ${currentUser.username}`,
      details: { username: currentUser.username, role, password_changed: Boolean(password) }
    });

    return NextResponse.json({ message: "Utilizador atualizado.", user: safeUser(updatedUser) });
  } catch (error) {
    if (error instanceof Error && error.message === "missing_admin_key") return missingAdminKeyResponse();
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível atualizar o utilizador." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const access = await requireAdminUserAccess();
  if (access.error) return access.error;
  if (!supabaseAdminHeaders()) return missingAdminKeyResponse();

  const { username: rawUsername } = await context.params;
  const username = normalizeUsername(rawUsername);
  if (!username) {
    return NextResponse.json({ message: "Utilizador inválido." }, { status: 400 });
  }
  if (username === access.session.username) {
    return NextResponse.json({ message: "Não podes apagar o teu próprio utilizador." }, { status: 400 });
  }

  try {
    const currentUser = await getManagedUser(username);
    if (!currentUser) {
      return NextResponse.json({ message: "Utilizador não encontrado." }, { status: 404 });
    }
    if (currentUser.role === "admin" && (await countAdminUsers()) <= 1) {
      return NextResponse.json({ message: "Tem de existir pelo menos um Admin." }, { status: 400 });
    }

    await supabaseAdminRequest(
      `app_users?username=eq.${encodeURIComponent(currentUser.username)}`,
      "DELETE",
      undefined,
      "return=minimal"
    );

    await writeAuditLog({
      session: access.session,
      action: "Apagou utilizador",
      resource: "app_users",
      resourceId: currentUser.username,
      summary: `Apagou utilizador ${currentUser.username} (${ROLE_LABELS[currentUser.role]})`,
      details: { username: currentUser.username, role: currentUser.role }
    });

    return NextResponse.json({ message: "Utilizador apagado." });
  } catch (error) {
    if (error instanceof Error && error.message === "missing_admin_key") return missingAdminKeyResponse();
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível apagar o utilizador." },
      { status: 500 }
    );
  }
}
