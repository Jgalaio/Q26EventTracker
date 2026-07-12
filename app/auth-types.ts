export type UserRole = string;

export type RolePermissions = {
  viewTreasury: boolean;
  manageRecords: boolean;
  deleteRecords: boolean;
  exportOverviewExcel: boolean;
  viewClosedEvents: boolean;
  requiresJustification: boolean;
};

export type RoleDefinition = {
  id: UserRole;
  label: string;
  description: string;
  permissions: RolePermissions;
  builtIn?: boolean;
};

export type AuthSession = {
  username: string;
  role: UserRole;
  roleLabel: string;
  permissions: RolePermissions;
};

export const EMPTY_ROLE_PERMISSIONS: RolePermissions = {
  viewTreasury: false,
  manageRecords: false,
  deleteRecords: false,
  exportOverviewExcel: false,
  viewClosedEvents: false,
  requiresJustification: false
};

export const BUILTIN_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: "admin",
    label: "Admin",
    description: "Acesso total, incluindo apagar registos e painel Admin.",
    permissions: {
      viewTreasury: true,
      manageRecords: true,
      deleteRecords: true,
      exportOverviewExcel: true,
      viewClosedEvents: true,
      requiresJustification: false
    },
    builtIn: true
  },
  {
    id: "operator",
    label: "Operator",
    description: "Pode consultar, adicionar e alterar. Alterações exigem justificação.",
    permissions: {
      viewTreasury: true,
      manageRecords: true,
      deleteRecords: false,
      exportOverviewExcel: false,
      viewClosedEvents: false,
      requiresJustification: true
    },
    builtIn: true
  },
  {
    id: "view",
    label: "View",
    description: "Pode apenas consultar o OverView.",
    permissions: {
      viewTreasury: false,
      manageRecords: false,
      deleteRecords: false,
      exportOverviewExcel: false,
      viewClosedEvents: false,
      requiresJustification: false
    },
    builtIn: true
  }
];

export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  BUILTIN_ROLE_DEFINITIONS.map((role) => [role.id, role.label])
);

export function roleIdIsSafe(value: unknown): value is UserRole {
  return typeof value === "string" && /^[a-z0-9_-]{2,32}$/.test(value);
}

export function roleSlugFromLabel(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return slug || "role";
}

export function builtInRole(role: UserRole) {
  return BUILTIN_ROLE_DEFINITIONS.find((definition) => definition.id === role) ?? null;
}

export function isBuiltInRole(role: UserRole) {
  return Boolean(builtInRole(role));
}

export function normalizePermissions(value: unknown, fallback: RolePermissions = EMPTY_ROLE_PERMISSIONS): RolePermissions {
  const source = value && typeof value === "object" ? (value as Partial<RolePermissions>) : {};
  return {
    viewTreasury: typeof source.viewTreasury === "boolean" ? source.viewTreasury : fallback.viewTreasury,
    manageRecords: typeof source.manageRecords === "boolean" ? source.manageRecords : fallback.manageRecords,
    deleteRecords: typeof source.deleteRecords === "boolean" ? source.deleteRecords : fallback.deleteRecords,
    exportOverviewExcel:
      typeof source.exportOverviewExcel === "boolean" ? source.exportOverviewExcel : fallback.exportOverviewExcel,
    viewClosedEvents: typeof source.viewClosedEvents === "boolean" ? source.viewClosedEvents : fallback.viewClosedEvents,
    requiresJustification:
      typeof source.requiresJustification === "boolean" ? source.requiresJustification : fallback.requiresJustification
  };
}

export function normalizeRoleDefinition(value: unknown): RoleDefinition | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<RoleDefinition>;
  if (!roleIdIsSafe(source.id) || source.id === "admin") return null;
  const baseRole = builtInRole(source.id);
  const label =
    typeof source.label === "string" && source.label.trim()
      ? source.label.trim().slice(0, 48)
      : baseRole?.label ?? source.id;
  const description =
    typeof source.description === "string" && source.description.trim()
      ? source.description.trim().slice(0, 160)
      : baseRole?.description ?? "Role personalizado.";

  return {
    id: source.id,
    label,
    description,
    permissions: normalizePermissions(source.permissions, baseRole?.permissions ?? EMPTY_ROLE_PERMISSIONS),
    builtIn: Boolean(baseRole)
  };
}

export function getRoleLabel(role: UserRole, roles?: RoleDefinition[]) {
  return roles?.find((definition) => definition.id === role)?.label ?? ROLE_LABELS[role] ?? role;
}

function permissionsFor(input: UserRole | AuthSession) {
  if (typeof input === "string") return builtInRole(input)?.permissions ?? EMPTY_ROLE_PERMISSIONS;
  return input.permissions ?? builtInRole(input.role)?.permissions ?? EMPTY_ROLE_PERMISSIONS;
}

function roleFor(input: UserRole | AuthSession) {
  return typeof input === "string" ? input : input.role;
}

export function sessionFromRole(username: string, role: UserRole, roles?: RoleDefinition[]): AuthSession {
  const definition = roles?.find((candidate) => candidate.id === role) ?? builtInRole(role);
  return {
    username,
    role,
    roleLabel: definition?.label ?? getRoleLabel(role, roles),
    permissions: definition?.permissions ?? EMPTY_ROLE_PERMISSIONS
  };
}

export function canViewTreasury(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).viewTreasury;
}

export function canWrite(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).manageRecords;
}

export function canDelete(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).deleteRecords;
}

export function canAccessAdmin(input: UserRole | AuthSession) {
  return roleFor(input) === "admin";
}

export function canExportOverviewExcel(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).exportOverviewExcel;
}

export function canViewClosedEvents(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).viewClosedEvents;
}

export function requiresJustification(input: UserRole | AuthSession) {
  return permissionsFor(input).requiresJustification;
}
