export type UserRole = "admin" | "operator" | "view";

export type AuthSession = {
  username: string;
  role: UserRole;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  operator: "Operator",
  view: "View"
};

export function canWrite(role: UserRole) {
  return role === "admin" || role === "operator";
}

export function canDelete(role: UserRole) {
  return role === "admin";
}

export function canAccessAdmin(role: UserRole) {
  return role === "admin";
}
