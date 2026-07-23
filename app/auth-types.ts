export type UserRole = string;

export type RolePermissions = {
  viewTreasury: boolean;
  manageRecords: boolean;
  deleteRecords: boolean;
  exportOverviewExcel: boolean;
  viewClosedEvents: boolean;
  unlockClosedEvents: boolean;
  requiresJustification: boolean;
  createEvents: boolean;
  editEvents: boolean;
  deleteEvents: boolean;
  closeEvents: boolean;
  addEntries: boolean;
  editEntries: boolean;
  deleteEntries: boolean;
  addExpenses: boolean;
  editExpenses: boolean;
  deleteExpenses: boolean;
  updatePaidStatus: boolean;
  viewMovementHistory: boolean;
  viewAccountQ26: boolean;
  addManualAccountEntries: boolean;
  editAccountEntries: boolean;
  deleteAccountEntries: boolean;
  viewAccountBalance: boolean;
  viewFinanceBilling: boolean;
  finalizePrintInvoices: boolean;
  editFinalizedInvoices: boolean;
  deleteFinalizedInvoices: boolean;
  viewSponsorBilling: boolean;
  changeInvoiceIssuedStatus: boolean;
  uploadViewInvoiceFiles: boolean;
  viewReports: boolean;
  generateGeneralReport: boolean;
  generateEventReport: boolean;
  printReports: boolean;
  changeReportLogo: boolean;
  viewOverview: boolean;
  expandOverviewEvents: boolean;
  exportOverviewExcelIndividual: boolean;
  exportOverviewExcelMultiple: boolean;
  viewAdminPanel: boolean;
  manageUsers: boolean;
  manageRoles: boolean;
  changeUserPasswords: boolean;
  importDatabase: boolean;
  exportDatabase: boolean;
  resetDatabase: boolean;
  viewAuditLog: boolean;
  openAuditLogItem: boolean;
  editQ25Balance: boolean;
  toggleGlobalCards: boolean;
  changeOwnPassword: boolean;
  viewSupport: boolean;
  createSupportTickets: boolean;
  replySupportTickets: boolean;
  manageSupportTickets: boolean;
  viewDocuments: boolean;
  uploadDocuments: boolean;
  downloadDocuments: boolean;
  deleteDocuments: boolean;
  viewTodo: boolean;
  createTasks: boolean;
  editOwnTasks: boolean;
  editAllTasks: boolean;
  deleteTasks: boolean;
  completeTasks: boolean;
  viewPersonalNotes: boolean;
  editPersonalNotes: boolean;
  requireDeleteJustification: boolean;
  requireUnlockJustification: boolean;
  viewOnly: boolean;
  onlyOpenEventsActions: boolean;
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
  unlockClosedEvents: false,
  requiresJustification: false,
  createEvents: false,
  editEvents: false,
  deleteEvents: false,
  closeEvents: false,
  addEntries: false,
  editEntries: false,
  deleteEntries: false,
  addExpenses: false,
  editExpenses: false,
  deleteExpenses: false,
  updatePaidStatus: false,
  viewMovementHistory: false,
  viewAccountQ26: false,
  addManualAccountEntries: false,
  editAccountEntries: false,
  deleteAccountEntries: false,
  viewAccountBalance: false,
  viewFinanceBilling: false,
  finalizePrintInvoices: false,
  editFinalizedInvoices: false,
  deleteFinalizedInvoices: false,
  viewSponsorBilling: false,
  changeInvoiceIssuedStatus: false,
  uploadViewInvoiceFiles: false,
  viewReports: false,
  generateGeneralReport: false,
  generateEventReport: false,
  printReports: false,
  changeReportLogo: false,
  viewOverview: false,
  expandOverviewEvents: false,
  exportOverviewExcelIndividual: false,
  exportOverviewExcelMultiple: false,
  viewAdminPanel: false,
  manageUsers: false,
  manageRoles: false,
  changeUserPasswords: false,
  importDatabase: false,
  exportDatabase: false,
  resetDatabase: false,
  viewAuditLog: false,
  openAuditLogItem: false,
  editQ25Balance: false,
  toggleGlobalCards: false,
  changeOwnPassword: false,
  viewSupport: false,
  createSupportTickets: false,
  replySupportTickets: false,
  manageSupportTickets: false,
  viewDocuments: false,
  uploadDocuments: false,
  downloadDocuments: false,
  deleteDocuments: false,
  viewTodo: false,
  createTasks: false,
  editOwnTasks: false,
  editAllTasks: false,
  deleteTasks: false,
  completeTasks: false,
  viewPersonalNotes: false,
  editPersonalNotes: false,
  requireDeleteJustification: false,
  requireUnlockJustification: false,
  viewOnly: false,
  onlyOpenEventsActions: false
};

const ROLE_PERMISSION_KEYS = Object.keys(EMPTY_ROLE_PERMISSIONS) as Array<keyof RolePermissions>;

export const BUILTIN_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: "admin",
    label: "Admin",
    description: "Acesso total, incluindo apagar registos e painel Admin.",
    permissions: {
      ...EMPTY_ROLE_PERMISSIONS,
      viewTreasury: true,
      manageRecords: true,
      deleteRecords: true,
      exportOverviewExcel: true,
      viewClosedEvents: true,
      unlockClosedEvents: true,
      createEvents: true,
      editEvents: true,
      deleteEvents: true,
      closeEvents: true,
      addEntries: true,
      editEntries: true,
      deleteEntries: true,
      addExpenses: true,
      editExpenses: true,
      deleteExpenses: true,
      updatePaidStatus: true,
      viewMovementHistory: true,
      viewAccountQ26: true,
      addManualAccountEntries: true,
      editAccountEntries: true,
      deleteAccountEntries: true,
      viewAccountBalance: true,
      viewFinanceBilling: true,
      finalizePrintInvoices: true,
      editFinalizedInvoices: true,
      deleteFinalizedInvoices: true,
      viewSponsorBilling: true,
      changeInvoiceIssuedStatus: true,
      uploadViewInvoiceFiles: true,
      viewReports: true,
      generateGeneralReport: true,
      generateEventReport: true,
      printReports: true,
      changeReportLogo: true,
      viewOverview: true,
      expandOverviewEvents: true,
      exportOverviewExcelIndividual: true,
      exportOverviewExcelMultiple: true,
      viewAdminPanel: true,
      manageUsers: true,
      manageRoles: true,
      changeUserPasswords: true,
      importDatabase: true,
      exportDatabase: true,
      resetDatabase: true,
      viewAuditLog: true,
      openAuditLogItem: true,
      editQ25Balance: true,
      toggleGlobalCards: true,
      changeOwnPassword: true,
      viewSupport: true,
      createSupportTickets: true,
      replySupportTickets: true,
      manageSupportTickets: true,
      viewDocuments: true,
      uploadDocuments: true,
      downloadDocuments: true,
      deleteDocuments: true,
      viewTodo: true,
      createTasks: true,
      editOwnTasks: true,
      editAllTasks: true,
      deleteTasks: true,
      completeTasks: true,
      viewPersonalNotes: true,
      editPersonalNotes: true
    },
    builtIn: true
  },
  {
    id: "operator",
    label: "Operator",
    description: "Pode consultar, adicionar e alterar. Alterações exigem justificação.",
    permissions: {
      ...EMPTY_ROLE_PERMISSIONS,
      viewTreasury: true,
      manageRecords: true,
      requiresJustification: true,
      createEvents: true,
      editEvents: true,
      closeEvents: true,
      addEntries: true,
      editEntries: true,
      addExpenses: true,
      editExpenses: true,
      updatePaidStatus: true,
      viewMovementHistory: true,
      viewAccountQ26: true,
      addManualAccountEntries: true,
      editAccountEntries: true,
      viewAccountBalance: true,
      viewFinanceBilling: true,
      finalizePrintInvoices: true,
      viewSponsorBilling: true,
      changeInvoiceIssuedStatus: true,
      uploadViewInvoiceFiles: true,
      viewReports: true,
      generateGeneralReport: true,
      generateEventReport: true,
      printReports: true,
      viewOverview: true,
      expandOverviewEvents: true,
      viewTodo: true,
      createTasks: true,
      editOwnTasks: true,
      editAllTasks: true,
      completeTasks: true,
      viewPersonalNotes: true,
      editPersonalNotes: true,
      changeOwnPassword: true,
      viewSupport: true,
      createSupportTickets: true,
      viewDocuments: true,
      uploadDocuments: true,
      downloadDocuments: true,
      requireUnlockJustification: true,
      onlyOpenEventsActions: true
    },
    builtIn: true
  },
  {
    id: "view",
    label: "View",
    description: "Pode apenas consultar o OverView.",
    permissions: {
      ...EMPTY_ROLE_PERMISSIONS,
      viewOverview: true,
      expandOverviewEvents: true,
      viewOnly: true,
      onlyOpenEventsActions: true
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
  const normalized = { ...fallback };
  ROLE_PERMISSION_KEYS.forEach((key) => {
    if (typeof source[key] === "boolean") normalized[key] = source[key];
  });
  return normalized;
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

export function isViewOnly(input: UserRole | AuthSession) {
  return roleFor(input) !== "admin" && permissionsFor(input).viewOnly;
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

export function canUnlockClosedEvents(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).unlockClosedEvents;
}

export function canChangeOwnPassword(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).changeOwnPassword;
}

export function canViewSupport(input: UserRole | AuthSession) {
  const permissions = permissionsFor(input);
  return (
    roleFor(input) === "admin" ||
    permissions.viewSupport ||
    permissions.createSupportTickets ||
    permissions.replySupportTickets ||
    permissions.manageSupportTickets
  );
}

export function canCreateSupportTickets(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).createSupportTickets;
}

export function canReplySupportTickets(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).replySupportTickets;
}

export function canManageSupportTickets(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).manageSupportTickets;
}

export function canViewDocuments(input: UserRole | AuthSession) {
  const permissions = permissionsFor(input);
  return (
    roleFor(input) === "admin" ||
    permissions.viewDocuments ||
    permissions.uploadDocuments ||
    permissions.downloadDocuments ||
    permissions.deleteDocuments
  );
}

export function canUploadDocuments(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).uploadDocuments;
}

export function canDownloadDocuments(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).downloadDocuments;
}

export function canDeleteDocuments(input: UserRole | AuthSession) {
  return roleFor(input) === "admin" || permissionsFor(input).deleteDocuments;
}

export function requiresJustification(input: UserRole | AuthSession) {
  return permissionsFor(input).requiresJustification;
}
