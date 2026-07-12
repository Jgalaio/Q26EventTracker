import { readAppSetting, writeAppSetting } from "./app-settings";
import {
  BUILTIN_ROLE_DEFINITIONS,
  getRoleLabel,
  normalizeRoleDefinition,
  sessionFromRole,
  type AuthSession,
  type RoleDefinition,
  type UserRole
} from "./auth-types";

const APP_ROLES_KEY = "app_roles";

export async function getCustomRoleDefinitions() {
  const setting = await readAppSetting<unknown>(APP_ROLES_KEY);
  if (!Array.isArray(setting)) return [];

  const seen = new Set<string>();
  return setting
    .map(normalizeRoleDefinition)
    .filter((role): role is RoleDefinition => Boolean(role))
    .filter((role) => {
      if (seen.has(role.id)) return false;
      seen.add(role.id);
      return true;
    });
}

export async function getRoleDefinitions() {
  const customRoles = await getCustomRoleDefinitions();
  return [...BUILTIN_ROLE_DEFINITIONS, ...customRoles];
}

export async function saveCustomRoleDefinitions(roles: RoleDefinition[]) {
  const seen = new Set<string>();
  const normalized = roles
    .map(normalizeRoleDefinition)
    .filter((role): role is RoleDefinition => Boolean(role))
    .filter((role) => {
      if (seen.has(role.id)) return false;
      seen.add(role.id);
      return true;
    });

  await writeAppSetting(
    APP_ROLES_KEY,
    normalized.map(({ id, label, description, permissions }) => ({ id, label, description, permissions }))
  );
  return normalized;
}

export async function getRoleDefinition(role: UserRole) {
  const roles = await getRoleDefinitions();
  return roles.find((candidate) => candidate.id === role) ?? null;
}

export async function enrichSession(session: Pick<AuthSession, "username" | "role">): Promise<AuthSession> {
  const roles = await getRoleDefinitions();
  return sessionFromRole(session.username, session.role, roles);
}

export { getRoleLabel };
