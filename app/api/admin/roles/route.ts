import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
import { listAuthUsers } from "../../../auth";
import { isBuiltInRole, normalizeRoleDefinition, type RoleDefinition } from "../../../auth-types";
import {
  getCustomRoleDefinitions,
  getRoleDefinitions,
  saveCustomRoleDefinitions
} from "../../../role-settings";
import { requireAdminUserAccess } from "../users/user-utils";

function normalizeRequestRoles(value: unknown) {
  if (!Array.isArray(value)) return null;

  const seen = new Set<string>();
  const roles: RoleDefinition[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && (item as { id?: unknown }).id === "admin") {
      return null;
    }
    const role = normalizeRoleDefinition(item);
    if (!role || seen.has(role.id)) continue;
    seen.add(role.id);
    roles.push(role);
  }
  return roles;
}

export async function GET() {
  const access = await requireAdminUserAccess();
  if (access.error) return access.error;

  const roles = await getRoleDefinitions();
  return NextResponse.json({ roles });
}

export async function PUT(request: NextRequest) {
  const access = await requireAdminUserAccess();
  if (access.error) return access.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nextRoles = normalizeRequestRoles(body.roles);
  if (!nextRoles) {
    return NextResponse.json({ message: "Lista de roles inválida." }, { status: 400 });
  }

  const currentCustomRoles = await getCustomRoleDefinitions();
  const nextRoleIds = new Set(nextRoles.map((role) => role.id));
  const removedRoleIds = currentCustomRoles
    .filter((role) => !isBuiltInRole(role.id))
    .map((role) => role.id)
    .filter((roleId) => !nextRoleIds.has(roleId));

  if (removedRoleIds.length) {
    const users = await listAuthUsers();
    const usedRole = removedRoleIds.find((roleId) => users.some((user) => user.role === roleId));
    if (usedRole) {
      return NextResponse.json(
        { message: `O role "${usedRole}" ainda está atribuído a utilizadores.` },
        { status: 400 }
      );
    }
  }

  try {
    const savedRoles = await saveCustomRoleDefinitions(nextRoles);
    await writeAuditLog({
      session: access.session,
      action: "Alterou roles",
      resource: "app_settings",
      resourceId: "app_roles",
      summary: `Atualizou roles e permissões (${savedRoles.length})`,
      details: { roles: savedRoles.map((role) => role.id) }
    });

    return NextResponse.json({ message: "Roles guardados.", roles: await getRoleDefinitions() });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível guardar os roles." },
      { status: 500 }
    );
  }
}
