"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppFavicon, AppLogo, ReportLogo } from "../app-settings";
import type { AuditLogEntry } from "../audit-log";
import type { BackupFrequency, BackupRunSummary, BackupSettings, DatabaseBackupSnapshot } from "../backup-manager";
import {
  EMPTY_ROLE_PERMISSIONS,
  getRoleLabel,
  roleIdIsSafe,
  roleSlugFromLabel,
  type AuthSession,
  type RoleDefinition,
  type RolePermissions,
  type UserRole
} from "../auth-types";
import type { EventoResumo } from "../supabase-data";
import { exportOverviewEventsToExcel } from "../overview/excel-export";
import type { OverviewRow } from "../overview/overview-client";

type AdminUser = {
  username: string;
  role: UserRole;
  updated_at?: string | null;
};

type AdminClientProps = {
  session: AuthSession;
  users: AdminUser[];
  roles: RoleDefinition[];
  reportLogo: ReportLogo | null;
  appLogo: AppLogo | null;
  appFavicon: AppFavicon | null;
  auditLogs: AuditLogEntry[];
  auditLogError: string | null;
  auditPage: number;
  auditHasNext: boolean;
  backupSettings: BackupSettings;
  backupRuns: BackupRunSummary[];
  closedEvents: EventoResumo[];
  closedEventsError: string | null;
};

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type UserFormMode = "create" | "edit";

type UserForm = {
  username: string;
  role: UserRole;
  password: string;
  confirmPassword: string;
};

type RoleFormMode = "create" | "edit";

type RoleForm = {
  id: string;
  label: string;
  description: string;
  permissions: RolePermissions;
};

type YearCloseArchive = {
  type: "q26-year-close";
  version: 1;
  exported_at: string;
  generated_by: string;
  database: DatabaseBackupSnapshot;
  overview: {
    countedRows: number;
    eventsCount: number;
    rows: OverviewRow[];
    totals: {
      entradas: number;
      saidas: number;
      aPagamento: number;
      lucro: number;
      faturado: number;
      naoFaturado: number;
      pagoQ26: number;
      transferencias: number;
      dinheiro: number;
    };
  };
  users: Array<{ username: string; role: string; updated_at: string | null }>;
  audit_logs: AuditLogEntry[];
};

type RolePermissionOption = {
  key: keyof RolePermissions;
  label: string;
  hint: string;
};

const emptyPasswordForm: PasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
};

const emptyUserForm: UserForm = {
  username: "",
  role: "operator",
  password: "",
  confirmPassword: ""
};

const emptyRoleForm: RoleForm = {
  id: "",
  label: "",
  description: "",
  permissions: {
    ...EMPTY_ROLE_PERMISSIONS,
    viewTreasury: true,
    viewOverview: true
  }
};

const rolePermissionModules: Array<{
  id: string;
  title: string;
  description: string;
  permissions: RolePermissionOption[];
}> = [
  {
    id: "tesouraria",
    title: "Tesouraria",
    description: "Consulta e gestão dos eventos, entradas e saídas.",
    permissions: [
      {
        key: "viewTreasury",
        label: "Ver Tesouraria",
        hint: "Permite abrir a página Tesouraria."
      },
      {
        key: "createEvents",
        label: "Criar eventos",
        hint: "Permite criar novos eventos."
      },
      {
        key: "editEvents",
        label: "Editar eventos",
        hint: "Permite alterar dados do evento selecionado."
      },
      {
        key: "deleteEvents",
        label: "Apagar eventos",
        hint: "Permite apagar eventos."
      },
      {
        key: "closeEvents",
        label: "Fechar eventos",
        hint: "Permite bloquear eventos concluídos."
      },
      {
        key: "viewClosedEvents",
        label: "Ver eventos fechados",
        hint: "Mostra a lista de eventos fechados no perfil do utilizador."
      },
      {
        key: "unlockClosedEvents",
        label: "Abrir eventos fechados",
        hint: "Permite desbloquear eventos fechados a partir do perfil."
      },
      {
        key: "addEntries",
        label: "Adicionar entradas",
        hint: "Permite inserir novas entradas nos eventos."
      },
      {
        key: "editEntries",
        label: "Editar entradas",
        hint: "Permite alterar entradas existentes."
      },
      {
        key: "deleteEntries",
        label: "Apagar entradas",
        hint: "Permite apagar entradas."
      },
      {
        key: "addExpenses",
        label: "Adicionar saídas",
        hint: "Permite inserir novas despesas nos eventos."
      },
      {
        key: "editExpenses",
        label: "Editar saídas",
        hint: "Permite alterar despesas existentes."
      },
      {
        key: "deleteExpenses",
        label: "Apagar saídas",
        hint: "Permite apagar despesas."
      },
      {
        key: "updatePaidStatus",
        label: "Alterar estado Pago",
        hint: "Permite marcar despesas como pagas ou em falta."
      },
      {
        key: "viewMovementHistory",
        label: "Ver histórico de versões dos movimentos",
        hint: "Permite consultar alterações anteriores dos movimentos."
      }
    ]
  },
  {
    id: "conta-q26",
    title: "Conta Q26",
    description: "Consulta e gestão dos movimentos da conta.",
    permissions: [
      {
        key: "viewAccountQ26",
        label: "Ver Conta Q26",
        hint: "Permite abrir a aba da Conta Q26."
      },
      {
        key: "addManualAccountEntries",
        label: "Adicionar entradas manuais na conta",
        hint: "Permite registar depósitos manuais."
      },
      {
        key: "editAccountEntries",
        label: "Editar entradas da conta",
        hint: "Permite alterar entradas registadas na Conta Q26."
      },
      {
        key: "deleteAccountEntries",
        label: "Apagar entradas da conta",
        hint: "Permite apagar entradas da Conta Q26."
      },
      {
        key: "viewAccountBalance",
        label: "Ver saldo em conta",
        hint: "Permite consultar o saldo da Conta Q26."
      }
    ]
  },
  {
    id: "faturacao",
    title: "Faturação",
    description: "Fat.Finanças, Fat. Patrocínios e ficheiros associados.",
    permissions: [
      {
        key: "viewFinanceBilling",
        label: "Ver Fat.Finanças",
        hint: "Permite abrir a página Fat.Finanças."
      },
      {
        key: "finalizePrintInvoices",
        label: "Finalizar/Imprimir faturas",
        hint: "Permite finalizar e imprimir faturas."
      },
      {
        key: "editFinalizedInvoices",
        label: "Editar faturas finalizadas",
        hint: "Permite alterar faturas já finalizadas."
      },
      {
        key: "deleteFinalizedInvoices",
        label: "Apagar faturas finalizadas",
        hint: "Permite apagar faturas finalizadas."
      },
      {
        key: "viewSponsorBilling",
        label: "Ver Fat. Patrocínios",
        hint: "Permite abrir a página Fat. Patrocínios."
      },
      {
        key: "changeInvoiceIssuedStatus",
        label: "Alterar estado de fatura emitida",
        hint: "Permite mudar o estado de emissão de faturas."
      },
      {
        key: "uploadViewInvoiceFiles",
        label: "Fazer upload/consultar ficheiros de faturas",
        hint: "Permite carregar e consultar ficheiros anexos às faturas."
      }
    ]
  },
  {
    id: "relatorios",
    title: "Relatórios",
    description: "Criação, impressão e configuração dos relatórios.",
    permissions: [
      {
        key: "viewReports",
        label: "Ver relatórios",
        hint: "Permite abrir a página Relatórios."
      },
      {
        key: "generateGeneralReport",
        label: "Gerar relatório geral",
        hint: "Permite gerar o relatório geral."
      },
      {
        key: "generateEventReport",
        label: "Gerar relatório por evento",
        hint: "Permite gerar relatórios de eventos selecionados."
      },
      {
        key: "printReports",
        label: "Imprimir relatórios",
        hint: "Permite imprimir relatórios."
      },
      {
        key: "changeReportLogo",
        label: "Alterar logo do relatório",
        hint: "Permite alterar a imagem usada nos relatórios."
      }
    ]
  },
  {
    id: "overview-exportacoes",
    title: "OverView e Exportações",
    description: "Consulta geral e exportação para Excel.",
    permissions: [
      {
        key: "viewOverview",
        label: "Ver OverView",
        hint: "Permite abrir a página OverView."
      },
      {
        key: "expandOverviewEvents",
        label: "Expandir detalhes dos eventos",
        hint: "Permite abrir os detalhes em cascata no OverView."
      },
      {
        key: "exportOverviewExcelIndividual",
        label: "Exportar Excel individual",
        hint: "Permite exportar um evento individual para Excel."
      },
      {
        key: "exportOverviewExcelMultiple",
        label: "Exportar Excel múltiplos eventos",
        hint: "Permite exportar vários eventos para um Excel com várias abas."
      }
    ]
  },
  {
    id: "administracao",
    title: "Administração",
    description: "Admin, utilizadores, base de dados e definições globais.",
    permissions: [
      {
        key: "viewAdminPanel",
        label: "Ver painel Admin",
        hint: "Permite abrir o painel de administração."
      },
      {
        key: "manageUsers",
        label: "Gerir utilizadores",
        hint: "Permite criar, editar e apagar utilizadores."
      },
      {
        key: "manageRoles",
        label: "Gerir roles/permissões",
        hint: "Permite criar, editar e apagar roles."
      },
      {
        key: "changeUserPasswords",
        label: "Alterar passwords de utilizadores",
        hint: "Permite alterar passwords de outros utilizadores."
      },
      {
        key: "importDatabase",
        label: "Importar base de dados",
        hint: "Permite importar dados para a base de dados."
      },
      {
        key: "exportDatabase",
        label: "Exportar base de dados",
        hint: "Permite exportar uma cópia da base de dados."
      },
      {
        key: "resetDatabase",
        label: "Recomeçar base de dados",
        hint: "Permite limpar dados operacionais da base de dados."
      },
      {
        key: "viewAuditLog",
        label: "Ver log de alterações",
        hint: "Permite consultar o registo de alterações."
      },
      {
        key: "openAuditLogItem",
        label: "Abrir item a partir do log",
        hint: "Permite navegar do log para o item alterado."
      },
      {
        key: "editQ25Balance",
        label: "Alterar Montante Q25",
        hint: "Permite alterar o montante deixado pelos Q25."
      },
      {
        key: "toggleGlobalCards",
        label: "Ligar/desligar cartões globais",
        hint: "Permite controlar cartões globais do sistema."
      }
    ]
  },
  {
    id: "todo-apontamentos",
    title: "TODO / Apontamentos",
    description: "Tarefas, agendamentos e apontamentos pessoais.",
    permissions: [
      {
        key: "viewTodo",
        label: "Ver TODO",
        hint: "Permite abrir a página TODO."
      },
      {
        key: "createTasks",
        label: "Criar tarefas",
        hint: "Permite criar novas tarefas."
      },
      {
        key: "editOwnTasks",
        label: "Editar tarefas próprias",
        hint: "Permite alterar tarefas criadas pelo próprio utilizador."
      },
      {
        key: "editAllTasks",
        label: "Editar tarefas de todos",
        hint: "Permite alterar tarefas de qualquer utilizador."
      },
      {
        key: "deleteTasks",
        label: "Apagar tarefas",
        hint: "Permite apagar tarefas."
      },
      {
        key: "completeTasks",
        label: "Marcar tarefas como concluídas",
        hint: "Permite concluir tarefas."
      },
      {
        key: "viewPersonalNotes",
        label: "Ver apontamentos pessoais",
        hint: "Permite consultar o bloco pessoal de apontamentos."
      },
      {
        key: "editPersonalNotes",
        label: "Editar apontamentos pessoais",
        hint: "Permite alterar o bloco pessoal de apontamentos."
      }
    ]
  },
  {
    id: "suporte",
    title: "Suporte",
    description: "Tickets, mensagens e acompanhamento de pedidos dos utilizadores.",
    permissions: [
      {
        key: "viewSupport",
        label: "Ver suporte",
        hint: "Permite abrir a página de suporte."
      },
      {
        key: "createSupportTickets",
        label: "Criar tickets",
        hint: "Permite criar tickets com texto, urgência e imagens."
      },
      {
        key: "replySupportTickets",
        label: "Responder tickets",
        hint: "Permite responder tickets como suporte."
      },
      {
        key: "manageSupportTickets",
        label: "Gerir tickets",
        hint: "Permite ver todos os tickets e alterar o estado."
      }
    ]
  },
  {
    id: "seguranca",
    title: "Segurança",
    description: "Regras de controlo e rastreabilidade das alterações.",
    permissions: [
      {
        key: "requiresJustification",
        label: "Exigir justificação ao alterar",
        hint: "Ao editar, obriga a preencher a justificação."
      },
      {
        key: "changeOwnPassword",
        label: "Alterar a própria password",
        hint: "Permite ao utilizador alterar a password na sua página de perfil."
      },
      {
        key: "requireDeleteJustification",
        label: "Exigir justificação ao apagar",
        hint: "Ao apagar, obriga a preencher a justificação."
      },
      {
        key: "requireUnlockJustification",
        label: "Exigir justificação ao abrir evento fechado",
        hint: "Ao abrir um evento fechado, obriga a preencher a justificação."
      },
      {
        key: "viewOnly",
        label: "Permitir só consulta",
        hint: "Marca o role como consulta apenas."
      },
      {
        key: "onlyOpenEventsActions",
        label: "Permitir ações apenas em eventos abertos",
        hint: "Restringe ações operacionais a eventos não fechados."
      }
    ]
  }
];

const rolePermissionLabels = rolePermissionModules.flatMap((module) => module.permissions);

const logDateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const adminDateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const adminMoneyFormatter = new Intl.NumberFormat("pt-PT", {
  currency: "EUR",
  maximumFractionDigits: 2,
  style: "currency"
});

const byteFormatter = new Intl.NumberFormat("pt-PT", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
});

const backupFrequencyLabels: Record<BackupFrequency, string> = {
  daily: "Diário",
  weekly: "Semanal"
};

function formatLogDate(value: string) {
  return logDateFormatter.format(new Date(value));
}

function formatEventDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  return adminDateFormatter.format(new Date(`${value}T00:00:00`));
}

function formatMoney(value: number | null | undefined) {
  return adminMoneyFormatter.format(Number(value ?? 0));
}

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${byteFormatter.format(value / 1024)} KB`;
  return `${byteFormatter.format(value / (1024 * 1024))} MB`;
}

function fileDateStamp(value = new Date().toISOString()) {
  return value.slice(0, 19).replace(/[:T]/g, "-");
}

function downloadJsonFile(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatDetails(details: Record<string, unknown>) {
  const justification =
    typeof details.payload === "object" && details.payload && "justification" in details.payload
      ? (details.payload as { justification?: unknown }).justification
      : null;
  if (typeof justification === "string" && justification.trim()) return justification;
  if (typeof details.method === "string") return details.method;
  return "-";
}

function sortAdminUsers(users: AdminUser[]) {
  return [...users].sort((left, right) => left.username.localeCompare(right.username, "pt-PT"));
}

function sortRoles(roles: RoleDefinition[]) {
  return [...roles].sort((left, right) => {
    if (left.builtIn && !right.builtIn) return -1;
    if (!left.builtIn && right.builtIn) return 1;
    return left.label.localeCompare(right.label, "pt-PT");
  });
}

function rolePillClass(role: UserRole) {
  return role === "admin" || role === "operator" || role === "view" ? role : "custom";
}

function auditLogTarget(log: AuditLogEntry) {
  if (!log.resource_id) return null;
  if (log.resource === "eventos") return `/tesouraria?event=${encodeURIComponent(log.resource_id)}`;
  if (log.resource === "movimentos") return `/tesouraria?movement=${encodeURIComponent(log.resource_id)}`;
  return null;
}

export function AdminClient({
  session,
  users,
  roles,
  reportLogo,
  appLogo,
  appFavicon,
  auditLogs,
  auditLogError,
  auditPage,
  auditHasNext,
  backupSettings,
  backupRuns,
  closedEvents,
  closedEventsError
}: AdminClientProps) {
  const router = useRouter();
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [usersState, setUsersState] = useState(() => sortAdminUsers(users));
  const [rolesState, setRolesState] = useState(() => sortRoles(roles));
  const [userFormMode, setUserFormMode] = useState<UserFormMode>("create");
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [roleFormMode, setRoleFormMode] = useState<RoleFormMode>("create");
  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRoleForm);
  const [roleMessage, setRoleMessage] = useState<string | null>(null);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [appLogoMessage, setAppLogoMessage] = useState<string | null>(null);
  const [faviconMessage, setFaviconMessage] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState(reportLogo?.dataUrl ?? "");
  const [logoFileName, setLogoFileName] = useState(reportLogo?.fileName ?? "");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [appLogoPreview, setAppLogoPreview] = useState(appLogo?.dataUrl ?? "");
  const [appLogoFileName, setAppLogoFileName] = useState(appLogo?.fileName ?? "");
  const [appLogoDataUrl, setAppLogoDataUrl] = useState("");
  const [faviconPreview, setFaviconPreview] = useState(appFavicon?.dataUrl ?? "");
  const [faviconFileName, setFaviconFileName] = useState(appFavicon?.fileName ?? "");
  const [faviconDataUrl, setFaviconDataUrl] = useState("");
  const [databaseImportText, setDatabaseImportText] = useState("");
  const [databaseImportName, setDatabaseImportName] = useState("");
  const [databaseMessage, setDatabaseMessage] = useState<string | null>(null);
  const [backupSettingsState, setBackupSettingsState] = useState(backupSettings);
  const [backupRunsState, setBackupRunsState] = useState(backupRuns);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [closedEventsState, setClosedEventsState] = useState(closedEvents);
  const [closedEventsMessage, setClosedEventsMessage] = useState<string | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [yearCloseConfirmation, setYearCloseConfirmation] = useState("");
  const [yearCloseMessage, setYearCloseMessage] = useState<string | null>(null);
  const [yearClosePreparedAt, setYearClosePreparedAt] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isSavingRoles, setIsSavingRoles] = useState(false);
  const [deletingUsername, setDeletingUsername] = useState<string | null>(null);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [isSavingAppLogo, setIsSavingAppLogo] = useState(false);
  const [isSavingFavicon, setIsSavingFavicon] = useState(false);
  const [isExportingDatabase, setIsExportingDatabase] = useState(false);
  const [isImportingDatabase, setIsImportingDatabase] = useState(false);
  const [isResettingDatabase, setIsResettingDatabase] = useState(false);
  const [isPreparingYearClose, setIsPreparingYearClose] = useState(false);
  const [isStartingNewYear, setIsStartingNewYear] = useState(false);
  const [isSavingBackupSettings, setIsSavingBackupSettings] = useState(false);
  const [isCreatingStoredBackup, setIsCreatingStoredBackup] = useState(false);
  const [downloadingBackupId, setDownloadingBackupId] = useState<string | null>(null);
  const [deletingBackupId, setDeletingBackupId] = useState<string | null>(null);
  const [unlockingEventId, setUnlockingEventId] = useState<string | null>(null);

  const updatePasswordField = (field: keyof PasswordForm, value: string) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const updateUserField = (field: keyof UserForm, value: string) => {
    setUserForm((current) => ({ ...current, [field]: value }));
  };

  const updateRoleField = (field: "id" | "label" | "description", value: string) => {
    setRoleForm((current) => ({ ...current, [field]: value }));
  };

  const updateRolePermission = (field: keyof RolePermissions, value: boolean) => {
    setRoleForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [field]: value
      }
    }));
  };

  const roleName = (role: UserRole) => getRoleLabel(role, rolesState);

  const roleDescription = (role: UserRole) =>
    rolesState.find((definition) => definition.id === role)?.description ?? "Role personalizado.";

  const resetUserForm = () => {
    setUserFormMode("create");
    setUserForm(emptyUserForm);
    setUserMessage(null);
  };

  const resetRoleForm = () => {
    setRoleFormMode("create");
    setRoleForm(emptyRoleForm);
    setRoleMessage(null);
  };

  const editRole = (role: RoleDefinition) => {
    if (role.id === "admin") return;
    setRoleFormMode("edit");
    setRoleForm({
      id: role.id,
      label: role.label,
      description: role.description,
      permissions: role.permissions
    });
    setRoleMessage(null);
  };

  const saveRoles = async (nextRoles: RoleDefinition[], successMessage: string) => {
    setIsSavingRoles(true);
    setRoleMessage(null);
    try {
      const response = await fetch("/api/admin/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: nextRoles.filter((role) => role.id !== "admin") })
      });
      const body = (await response.json().catch(() => null)) as { message?: string; roles?: RoleDefinition[] } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível guardar os roles.");
      setRolesState(sortRoles(body?.roles ?? nextRoles));
      setRoleMessage(body?.message ?? successMessage);
      router.refresh();
      return true;
    } catch (error) {
      setRoleMessage(error instanceof Error ? error.message : "Não foi possível guardar os roles.");
      return false;
    } finally {
      setIsSavingRoles(false);
    }
  };

  const handleRoleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = roleFormMode === "edit" ? roleForm.id.trim() : roleSlugFromLabel(roleForm.id || roleForm.label);
    const label = roleForm.label.trim();
    const description = roleForm.description.trim() || "Role personalizado.";

    if (!label) {
      setRoleMessage("Indica o nome do role.");
      return;
    }
    if (!roleIdIsSafe(id)) {
      setRoleMessage("O ID do role só pode ter letras minúsculas, números, _ ou -.");
      return;
    }
    if (roleFormMode === "create" && rolesState.some((role) => role.id === id)) {
      setRoleMessage("Já existe um role com esse ID.");
      return;
    }

    const existingRole = rolesState.find((role) => role.id === id);
    if (existingRole?.id === "admin") {
      setRoleMessage("O role Admin não pode ser alterado.");
      return;
    }

    const nextRole: RoleDefinition = {
      id,
      label,
      description,
      permissions: roleForm.permissions,
      builtIn: existingRole?.builtIn ?? false
    };
    const nextRoles =
      roleFormMode === "edit"
        ? rolesState.map((role) => (role.id === id ? nextRole : role))
        : [...rolesState, nextRole];
    const saved = await saveRoles(nextRoles, roleFormMode === "edit" ? "Role atualizado." : "Role criado.");
    if (saved) {
      setRoleFormMode("create");
      setRoleForm(emptyRoleForm);
    }
  };

  const deleteRole = async (role: RoleDefinition) => {
    if (role.builtIn) {
      setRoleMessage("Os roles base não podem ser apagados.");
      return;
    }
    if (!window.confirm(`Apagar o role "${role.label}"?`)) return;
    const saved = await saveRoles(
      rolesState.filter((item) => item.id !== role.id),
      `Role "${role.label}" apagado.`
    );
    if (saved && roleForm.id === role.id) resetRoleForm();
  };

  const editUser = (user: AdminUser) => {
    setUserFormMode("edit");
    setUserForm({
      username: user.username,
      role: user.role,
      password: "",
      confirmPassword: ""
    });
    setUserMessage(null);
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingPassword(true);
    setPasswordMessage(null);

    try {
      const response = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordForm)
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível alterar a password.");
      setPasswordForm(emptyPasswordForm);
      setPasswordMessage(body?.message ?? "Password alterada com sucesso.");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Não foi possível alterar a password.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleUserSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const username = userForm.username.trim();
    const password = userForm.password;
    const isCreate = userFormMode === "create";

    if (!username) {
      setUserMessage("Indica o nome do utilizador.");
      return;
    }
    if (isCreate && password.length < 6) {
      setUserMessage("A password deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password && password.length < 6) {
      setUserMessage("A password deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== userForm.confirmPassword) {
      setUserMessage("A confirmação da password não coincide.");
      return;
    }

    setIsSavingUser(true);
    setUserMessage(null);
    try {
      const response = await fetch(isCreate ? "/api/admin/users" : `/api/admin/users/${encodeURIComponent(username)}`, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          role: userForm.role,
          password: password || undefined
        })
      });
      const body = (await response.json().catch(() => null)) as { message?: string; user?: AdminUser } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível guardar o utilizador.");

      const savedUser = body?.user;
      if (savedUser) {
        setUsersState((current) =>
          sortAdminUsers(
            isCreate
              ? [...current.filter((user) => user.username !== savedUser.username), savedUser]
              : current.map((user) => (user.username === savedUser.username ? savedUser : user))
          )
        );
      }
      setUserMessage(body?.message ?? "Utilizador guardado.");
      setUserFormMode("create");
      setUserForm(emptyUserForm);
      router.refresh();
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : "Não foi possível guardar o utilizador.");
    } finally {
      setIsSavingUser(false);
    }
  };

  const deleteUser = async (user: AdminUser) => {
    if (user.username === session.username) {
      setUserMessage("Não podes apagar o teu próprio utilizador.");
      return;
    }
    if (!window.confirm(`Apagar o utilizador "${user.username}"?`)) return;

    setDeletingUsername(user.username);
    setUserMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.username)}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível apagar o utilizador.");
      setUsersState((current) => current.filter((item) => item.username !== user.username));
      if (userForm.username === user.username) setUserForm(emptyUserForm);
      setUserFormMode("create");
      setUserMessage(body?.message ?? "Utilizador apagado.");
      router.refresh();
    } catch (error) {
      setUserMessage(error instanceof Error ? error.message : "Não foi possível apagar o utilizador.");
    } finally {
      setDeletingUsername(null);
    }
  };

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLogoMessage("Escolhe um ficheiro de imagem.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setLogoPreview(value);
      setLogoDataUrl(value);
      setLogoFileName(file.name);
      setLogoMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFaviconChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFaviconMessage("Escolhe um ficheiro de imagem.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setFaviconPreview(value);
      setFaviconDataUrl(value);
      setFaviconFileName(file.name);
      setFaviconMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleAppLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAppLogoMessage("Escolhe um ficheiro de imagem.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setAppLogoPreview(value);
      setAppLogoDataUrl(value);
      setAppLogoFileName(file.name);
      setAppLogoMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!logoDataUrl) {
      setLogoMessage("Escolhe primeiro uma imagem.");
      return;
    }

    setIsSavingLogo(true);
    setLogoMessage(null);
    try {
      const response = await fetch("/api/admin/report-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: logoDataUrl, fileName: logoFileName })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível guardar o logo.");
      setLogoDataUrl("");
      setLogoMessage(body?.message ?? "Logo atualizado.");
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "Não foi possível guardar o logo.");
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleAppLogoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!appLogoDataUrl) {
      setAppLogoMessage("Escolhe primeiro uma imagem.");
      return;
    }

    setIsSavingAppLogo(true);
    setAppLogoMessage(null);
    try {
      const response = await fetch("/api/admin/app-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: appLogoDataUrl, fileName: appLogoFileName })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível guardar o logo da aplicação.");
      setAppLogoDataUrl("");
      setAppLogoMessage(body?.message ?? "Logo da aplicação atualizado.");
    } catch (error) {
      setAppLogoMessage(error instanceof Error ? error.message : "Não foi possível guardar o logo da aplicação.");
    } finally {
      setIsSavingAppLogo(false);
    }
  };

  const removeAppLogo = async () => {
    setIsSavingAppLogo(true);
    setAppLogoMessage(null);
    try {
      const response = await fetch("/api/admin/app-logo", { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível remover o logo da aplicação.");
      setAppLogoPreview("");
      setAppLogoDataUrl("");
      setAppLogoFileName("");
      setAppLogoMessage(body?.message ?? "Logo da aplicação removido.");
    } catch (error) {
      setAppLogoMessage(error instanceof Error ? error.message : "Não foi possível remover o logo da aplicação.");
    } finally {
      setIsSavingAppLogo(false);
    }
  };

  const removeLogo = async () => {
    setIsSavingLogo(true);
    setLogoMessage(null);
    try {
      const response = await fetch("/api/admin/report-logo", { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível remover o logo.");
      setLogoPreview("");
      setLogoDataUrl("");
      setLogoFileName("");
      setLogoMessage(body?.message ?? "Logo removido.");
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "Não foi possível remover o logo.");
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleFaviconSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!faviconDataUrl) {
      setFaviconMessage("Escolhe primeiro uma imagem.");
      return;
    }

    setIsSavingFavicon(true);
    setFaviconMessage(null);
    try {
      const response = await fetch("/api/admin/favicon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: faviconDataUrl, fileName: faviconFileName })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível guardar o favicon.");
      setFaviconDataUrl("");
      setFaviconMessage(body?.message ?? "Favicon atualizado.");
    } catch (error) {
      setFaviconMessage(error instanceof Error ? error.message : "Não foi possível guardar o favicon.");
    } finally {
      setIsSavingFavicon(false);
    }
  };

  const removeFavicon = async () => {
    setIsSavingFavicon(true);
    setFaviconMessage(null);
    try {
      const response = await fetch("/api/admin/favicon", { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível remover o favicon.");
      setFaviconPreview("");
      setFaviconDataUrl("");
      setFaviconFileName("");
      setFaviconMessage(body?.message ?? "Favicon removido.");
    } catch (error) {
      setFaviconMessage(error instanceof Error ? error.message : "Não foi possível remover o favicon.");
    } finally {
      setIsSavingFavicon(false);
    }
  };

  const handleDatabaseImportChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setDatabaseImportText(value);
      setDatabaseImportName(file.name);
      setDatabaseMessage(null);
    };
    reader.readAsText(file);
  };

  const exportDatabase = async () => {
    setIsExportingDatabase(true);
    setDatabaseMessage(null);

    try {
      const response = await fetch("/api/admin/database");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Não foi possível exportar a base de dados.");
      }

      const backup = await response.json();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      anchor.href = url;
      anchor.download = `q26-backup-${stamp}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setDatabaseMessage("Backup exportado.");
    } catch (error) {
      setDatabaseMessage(error instanceof Error ? error.message : "Não foi possível exportar a base de dados.");
    } finally {
      setIsExportingDatabase(false);
    }
  };

  const importDatabase = async () => {
    if (!databaseImportText) {
      setDatabaseMessage("Escolhe primeiro um ficheiro JSON.");
      return;
    }

    const confirmed = window.confirm("Importar este backup vai substituir a base de dados atual. Queres continuar?");
    if (!confirmed) return;

    setIsImportingDatabase(true);
    setDatabaseMessage(null);
    try {
      const backup = JSON.parse(databaseImportText);
      const response = await fetch("/api/admin/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível importar a base de dados.");
      setDatabaseMessage(body?.message ?? "Base de dados importada.");
    } catch (error) {
      setDatabaseMessage(error instanceof Error ? error.message : "Não foi possível importar a base de dados.");
    } finally {
      setIsImportingDatabase(false);
    }
  };

  const resetDatabase = async () => {
    if (resetConfirmation !== "sim confirmo") {
      setDatabaseMessage("Para recomeçar, escreve exatamente: sim confirmo");
      return;
    }

    const confirmed = window.confirm("Esta ação apaga eventos, movimentos, relatórios e definições. Tens a certeza?");
    if (!confirmed) return;

    setIsResettingDatabase(true);
    setDatabaseMessage(null);
    try {
      const response = await fetch("/api/admin/database", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: resetConfirmation })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível limpar a base de dados.");
      setResetConfirmation("");
      setDatabaseImportText("");
      setDatabaseImportName("");
      setDatabaseMessage(body?.message ?? "Base de dados limpa.");
    } catch (error) {
      setDatabaseMessage(error instanceof Error ? error.message : "Não foi possível limpar a base de dados.");
    } finally {
      setIsResettingDatabase(false);
    }
  };

  const prepareYearClose = async () => {
    setIsPreparingYearClose(true);
    setYearCloseMessage(null);

    try {
      const response = await fetch("/api/admin/year-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare" })
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        archive?: YearCloseArchive;
        settings?: BackupSettings;
        runs?: BackupRunSummary[];
      } | null;

      if (!response.ok || !body?.archive) {
        throw new Error(body?.message ?? "Não foi possível preparar o encerramento anual.");
      }

      const stamp = fileDateStamp(body.archive.exported_at);
      downloadJsonFile(body.archive, `q26-encerramento-${stamp}.json`);
      exportOverviewEventsToExcel(body.archive.overview.rows, `q26-encerramento-${stamp}.xlsx`);

      if (body.settings) setBackupSettingsState(body.settings);
      if (body.runs) setBackupRunsState(body.runs);
      setYearClosePreparedAt(body.archive.exported_at);
      setYearCloseMessage(body.message ?? "Encerramento preparado.");
      router.refresh();
    } catch (error) {
      setYearCloseMessage(error instanceof Error ? error.message : "Não foi possível preparar o encerramento anual.");
    } finally {
      setIsPreparingYearClose(false);
    }
  };

  const startNewYear = async () => {
    if (yearCloseConfirmation !== "encerrar q26") {
      setYearCloseMessage("Para iniciar o novo ano, escreve exatamente: encerrar q26");
      return;
    }

    const confirmed = window.confirm(
      "Isto limpa eventos, movimentos, faturas e TODOs do ano atual, e apaga utilizadores que não sejam Admin. Queres continuar?"
    );
    if (!confirmed) return;

    setIsStartingNewYear(true);
    setYearCloseMessage(null);

    try {
      const response = await fetch("/api/admin/year-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", confirmation: yearCloseConfirmation })
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        settings?: BackupSettings;
        runs?: BackupRunSummary[];
        users?: AdminUser[];
      } | null;

      if (!response.ok) throw new Error(body?.message ?? "Não foi possível iniciar o novo ano.");

      if (body?.settings) setBackupSettingsState(body.settings);
      if (body?.runs) setBackupRunsState(body.runs);
      if (body?.users) setUsersState(sortAdminUsers(body.users));
      setYearCloseConfirmation("");
      setYearClosePreparedAt(null);
      setClosedEventsState([]);
      setYearCloseMessage(body?.message ?? "Ano novo iniciado.");
      router.refresh();
    } catch (error) {
      setYearCloseMessage(error instanceof Error ? error.message : "Não foi possível iniciar o novo ano.");
    } finally {
      setIsStartingNewYear(false);
    }
  };

  const saveBackupSettings = async () => {
    setIsSavingBackupSettings(true);
    setBackupMessage(null);
    try {
      const response = await fetch("/api/admin/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settings",
          enabled: backupSettingsState.enabled,
          frequency: backupSettingsState.frequency
        })
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        settings?: BackupSettings;
        runs?: BackupRunSummary[];
      } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível guardar as definições de backup.");
      if (body?.settings) setBackupSettingsState(body.settings);
      if (body?.runs) setBackupRunsState(body.runs);
      setBackupMessage(body?.message ?? "Definições de backup guardadas.");
      router.refresh();
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Não foi possível guardar as definições de backup.");
    } finally {
      setIsSavingBackupSettings(false);
    }
  };

  const createStoredBackup = async () => {
    setIsCreatingStoredBackup(true);
    setBackupMessage(null);
    try {
      const response = await fetch("/api/admin/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" })
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        settings?: BackupSettings;
        runs?: BackupRunSummary[];
      } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível criar o backup.");
      if (body?.settings) setBackupSettingsState(body.settings);
      if (body?.runs) setBackupRunsState(body.runs);
      setBackupMessage(body?.message ?? "Backup guardado.");
      router.refresh();
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Não foi possível criar o backup.");
    } finally {
      setIsCreatingStoredBackup(false);
    }
  };

  const downloadStoredBackup = async (run: BackupRunSummary) => {
    setDownloadingBackupId(run.id);
    setBackupMessage(null);
    try {
      const response = await fetch(`/api/admin/backups/${encodeURIComponent(run.id)}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Não foi possível descarregar o backup.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = run.createdAt.slice(0, 19).replace(/[:T]/g, "-");
      anchor.href = url;
      anchor.download = `q26-backup-guardado-${stamp}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setBackupMessage("Backup descarregado.");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Não foi possível descarregar o backup.");
    } finally {
      setDownloadingBackupId(null);
    }
  };

  const deleteStoredBackupRun = async (run: BackupRunSummary) => {
    const confirmed = window.confirm(
      `Apagar o backup ${run.trigger === "automatic" ? "automático" : "manual"} de ${formatLogDate(run.createdAt)}?`
    );
    if (!confirmed) return;

    setDeletingBackupId(run.id);
    setBackupMessage(null);
    try {
      const response = await fetch(`/api/admin/backups/${encodeURIComponent(run.id)}`, { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        runs?: BackupRunSummary[];
      } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível apagar o backup.");
      if (body?.runs) setBackupRunsState(body.runs);
      setBackupMessage(body?.message ?? "Backup apagado.");
      router.refresh();
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Não foi possível apagar o backup.");
    } finally {
      setDeletingBackupId(null);
    }
  };

  const unlockEvent = async (event: EventoResumo) => {
    const confirmed = window.confirm(`Desbloquear o evento "${event.nome}" para voltar a permitir alterações?`);
    if (!confirmed) return;

    setUnlockingEventId(event.id);
    setClosedEventsMessage(null);
    try {
      const response = await fetch(`/api/eventos/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechado: false })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível desbloquear o evento.");
      setClosedEventsState((current) => current.filter((item) => item.id !== event.id));
      setClosedEventsMessage(`Evento "${event.nome}" desbloqueado.`);
    } catch (error) {
      setClosedEventsMessage(error instanceof Error ? error.message : "Não foi possível desbloquear o evento.");
    } finally {
      setUnlockingEventId(null);
    }
  };

  const manualBackupRuns = backupRunsState.filter((run) => run.trigger === "manual");
  const automaticBackupRuns = backupRunsState.filter((run) => run.trigger === "automatic");

  const renderStoredBackupRow = (run: BackupRunSummary) => (
    <article className={run.status === "success" ? "stored-backup-row" : "stored-backup-row error"} key={run.id}>
      <div>
        <strong>{formatLogDate(run.createdAt)}</strong>
        <span>
          {run.createdBy} · {formatFileSize(run.sizeBytes)}
        </span>
        <small>
          Eventos {run.counts.eventos ?? 0} · Movimentos {run.counts.movimentos ?? 0} · Notas {run.counts.notas ?? 0}
        </small>
        {run.storageBucket ? <small>Bucket {run.storageBucket}</small> : null}
      </div>
      <div className="stored-backup-actions">
        <button
          className="secondary-button"
          disabled={!run.hasSnapshot || downloadingBackupId === run.id || deletingBackupId === run.id}
          type="button"
          onClick={() => downloadStoredBackup(run)}
        >
          {downloadingBackupId === run.id ? "A descarregar..." : "Download"}
        </button>
        <button
          className="danger-inline-button"
          disabled={deletingBackupId === run.id || downloadingBackupId === run.id}
          type="button"
          onClick={() => deleteStoredBackupRun(run)}
        >
          {deletingBackupId === run.id ? "A apagar..." : "Apagar"}
        </button>
      </div>
    </article>
  );

  return (
    <>
      <details className="admin-collapse-panel" aria-label="Segurança do admin">
        <summary className="admin-collapse-summary">
          <span>
            <span className="eyebrow">Admin</span>
            <strong>Segurança</strong>
          </span>
          <em>1 zona</em>
        </summary>

        <section className="admin-settings-grid" aria-label="Segurança do admin">
          <form className="admin-settings-card" onSubmit={handlePasswordSubmit}>
            <div>
              <p className="eyebrow">Segurança</p>
              <h2>Alterar a minha password</h2>
            </div>
            <label>
              Utilizador
              <input readOnly value={session.username} />
            </label>
            <label>
              Password atual
              <input
                required
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => updatePasswordField("currentPassword", event.target.value)}
              />
            </label>
            <label>
              Nova password
              <input
                minLength={6}
                required
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => updatePasswordField("newPassword", event.target.value)}
              />
            </label>
            <label>
              Confirmar nova password
              <input
                minLength={6}
                required
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => updatePasswordField("confirmPassword", event.target.value)}
              />
            </label>
            {passwordMessage ? <p className="form-message">{passwordMessage}</p> : null}
            <button disabled={isSavingPassword} type="submit">
              {isSavingPassword ? "A guardar..." : "Guardar password"}
            </button>
          </form>
        </section>
      </details>

      <details className="admin-collapse-panel" aria-label="Logos e imagem">
        <summary className="admin-collapse-summary">
          <span>
            <span className="eyebrow">Imagem</span>
            <strong>Logos e imagem</strong>
          </span>
          <em>3 zonas</em>
        </summary>

        <section className="admin-settings-grid" aria-label="Logos e imagem">
          <form className="admin-settings-card" onSubmit={handleAppLogoSubmit}>
            <div>
              <p className="eyebrow">Aplicação</p>
              <h2>Alterar logo do topo</h2>
            </div>
            <div className="logo-preview-box app-logo-preview-box">
              {appLogoPreview ? <img alt="Logo atual da aplicação" src={appLogoPreview} /> : <span>Q26</span>}
            </div>
            <label>
              Imagem
              <input accept="image/*" type="file" onChange={handleAppLogoChange} />
            </label>
            {appLogoFileName ? <p className="admin-file-name">{appLogoFileName}</p> : null}
            {appLogoMessage ? <p className="form-message">{appLogoMessage}</p> : null}
            <div className="admin-inline-actions">
              <button disabled={isSavingAppLogo || !appLogoDataUrl} type="submit">
                {isSavingAppLogo ? "A guardar..." : "Guardar logo"}
              </button>
              <button className="secondary-button" disabled={isSavingAppLogo || !appLogoPreview} type="button" onClick={removeAppLogo}>
                Remover
              </button>
            </div>
          </form>

          <form className="admin-settings-card" onSubmit={handleLogoSubmit}>
            <div>
              <p className="eyebrow">Relatório</p>
              <h2>Alterar logo do relatório</h2>
            </div>
            <div className="logo-preview-box">
              {logoPreview ? <img alt="Logo atual do relatório" src={logoPreview} /> : <span>Q26</span>}
            </div>
            <label>
              Imagem
              <input accept="image/*" type="file" onChange={handleLogoChange} />
            </label>
            {logoFileName ? <p className="admin-file-name">{logoFileName}</p> : null}
            {logoMessage ? <p className="form-message">{logoMessage}</p> : null}
            <div className="admin-inline-actions">
              <button disabled={isSavingLogo || !logoDataUrl} type="submit">
                {isSavingLogo ? "A guardar..." : "Guardar logo"}
              </button>
              <button className="secondary-button" disabled={isSavingLogo || !logoPreview} type="button" onClick={removeLogo}>
                Remover
              </button>
            </div>
          </form>

          <form className="admin-settings-card" onSubmit={handleFaviconSubmit}>
            <div>
              <p className="eyebrow">Aplicação</p>
              <h2>Alterar favicon</h2>
            </div>
            <div className="favicon-preview-box">
              {faviconPreview ? <img alt="Favicon atual" src={faviconPreview} /> : <span>Q26</span>}
            </div>
            <label>
              Imagem
              <input accept="image/*" type="file" onChange={handleFaviconChange} />
            </label>
            {faviconFileName ? <p className="admin-file-name">{faviconFileName}</p> : null}
            {faviconMessage ? <p className="form-message">{faviconMessage}</p> : null}
            <div className="admin-inline-actions">
              <button disabled={isSavingFavicon || !faviconDataUrl} type="submit">
                {isSavingFavicon ? "A guardar..." : "Guardar favicon"}
              </button>
              <button className="secondary-button" disabled={isSavingFavicon || !faviconPreview} type="button" onClick={removeFavicon}>
                Remover
              </button>
            </div>
          </form>
        </section>
      </details>

      <details className="admin-collapse-panel" aria-label="Base de dados">
        <summary className="admin-collapse-summary">
          <span>
            <span className="eyebrow">Base de dados</span>
            <strong>Backups, importação e encerramento</strong>
          </span>
          <em>3 zonas</em>
        </summary>

        <section className="admin-settings-card database-maintenance-card">
          <div>
            <p className="eyebrow">Base de dados</p>
            <h2>Importar / exportar / recomeçar</h2>
          </div>
          <div className="database-actions">
            <button disabled={isExportingDatabase} type="button" onClick={exportDatabase}>
              {isExportingDatabase ? "A exportar..." : "Exportar base de dados"}
            </button>
          </div>
          <label>
            Importar backup JSON
            <input accept="application/json,.json" type="file" onChange={handleDatabaseImportChange} />
          </label>
          {databaseImportName ? <p className="admin-file-name">{databaseImportName}</p> : null}
          <button disabled={isImportingDatabase || !databaseImportText} type="button" onClick={importDatabase}>
            {isImportingDatabase ? "A importar..." : "Importar e substituir"}
          </button>
          <div className="backup-automation-box">
            <div className="backup-automation-top">
              <div className="backup-automation-header">
                <div>
                  <strong>Backups automáticos</strong>
                  <span>
                    {backupSettingsState.enabled
                      ? `Ativo · ${backupFrequencyLabels[backupSettingsState.frequency]}`
                      : "Pausado"}
                  </span>
                </div>
                <span className={backupSettingsState.enabled ? "backup-status-pill active" : "backup-status-pill paused"}>
                  {backupSettingsState.enabled ? "Ativo" : "Pausado"}
                </span>
              </div>
              <div className="backup-settings-grid">
                <label className="table-checkbox backup-toggle">
                  <input
                    checked={backupSettingsState.enabled}
                    type="checkbox"
                    onChange={(event) =>
                      setBackupSettingsState((current) => ({ ...current, enabled: event.target.checked }))
                    }
                  />
                  <span>Backup automático ativo</span>
                </label>
                <label>
                  Periodicidade
                  <select
                    value={backupSettingsState.frequency}
                    onChange={(event) =>
                      setBackupSettingsState((current) => ({
                        ...current,
                        frequency: event.target.value as BackupFrequency
                      }))
                    }
                  >
                    {Object.entries(backupFrequencyLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="admin-inline-actions backup-main-actions">
                <button disabled={isSavingBackupSettings} type="button" onClick={saveBackupSettings}>
                  {isSavingBackupSettings ? "A guardar..." : "Guardar definições"}
                </button>
                <button className="secondary-button" disabled={isCreatingStoredBackup} type="button" onClick={createStoredBackup}>
                  {isCreatingStoredBackup ? "A criar..." : "Criar backup agora"}
                </button>
              </div>
              <div className="backup-last-status">
                <span>Último backup</span>
                <strong>
                  {backupSettingsState.lastRunAt ? formatLogDate(backupSettingsState.lastRunAt) : "Ainda sem backups"}
                </strong>
                {backupSettingsState.lastMessage ? <small>{backupSettingsState.lastMessage}</small> : null}
              </div>
            </div>
            {backupMessage ? <p className="form-message">{backupMessage}</p> : null}
            <div className="stored-backups-list" aria-label="Últimos backups guardados">
              <div className="stored-backups-heading">
                <div>
                  <strong>Backups guardados</strong>
                  <span>Automáticos: últimos 30 dias · Manuais: permanentes</span>
                </div>
                <span>{backupRunsState.length} guardados</span>
              </div>
              <div className="stored-backup-columns">
                <section className="stored-backup-column" aria-label="Backups manuais">
                  <div className="stored-backup-column-heading">
                    <strong>Manuais</strong>
                    <span>{manualBackupRuns.length} guardados</span>
                  </div>
                  {manualBackupRuns.length ? (
                    manualBackupRuns.map(renderStoredBackupRow)
                  ) : (
                    <p className="backup-empty-state">Sem backups manuais.</p>
                  )}
                </section>
                <section className="stored-backup-column" aria-label="Backups automáticos">
                  <div className="stored-backup-column-heading">
                    <strong>Automáticos</strong>
                    <span>{automaticBackupRuns.length} nos últimos 30 dias</span>
                  </div>
                  {automaticBackupRuns.length ? (
                    automaticBackupRuns.map(renderStoredBackupRow)
                  ) : (
                    <p className="backup-empty-state">Sem backups automáticos.</p>
                  )}
                </section>
              </div>
            </div>
          </div>
          <section className="year-close-box" aria-label="Encerramento anual">
            <div className="year-close-heading">
              <div>
                <p className="eyebrow">Encerramento anual</p>
                <h3>Fechar Q26 e preparar novo ano</h3>
              </div>
              <span>{yearClosePreparedAt ? `Preparado em ${formatLogDate(yearClosePreparedAt)}` : "Por preparar"}</span>
            </div>
            <div className="year-close-steps">
              <article>
                <strong>1. Exportar e guardar</strong>
                <span>Gera o JSON completo, o Excel por evento e cria backup manual no bucket.</span>
                <button disabled={isPreparingYearClose || isStartingNewYear} type="button" onClick={prepareYearClose}>
                  {isPreparingYearClose ? "A preparar..." : "Preparar encerramento"}
                </button>
              </article>
              <article>
                <strong>2. Iniciar ano novo</strong>
                <span>Limpa dados anuais e remove utilizadores que não sejam Admin.</span>
                <label>
                  Confirmação
                  <input
                    placeholder="encerrar q26"
                    value={yearCloseConfirmation}
                    onChange={(event) => setYearCloseConfirmation(event.target.value)}
                  />
                </label>
                <button
                  className="danger-admin-button"
                  disabled={
                    isStartingNewYear ||
                    isPreparingYearClose ||
                    !yearClosePreparedAt ||
                    yearCloseConfirmation !== "encerrar q26"
                  }
                  type="button"
                  onClick={startNewYear}
                >
                  {isStartingNewYear ? "A iniciar..." : "Iniciar ano novo"}
                </button>
              </article>
            </div>
            {yearCloseMessage ? <p className="form-message">{yearCloseMessage}</p> : null}
          </section>
          <div className="database-reset-box">
            <strong>Recomeçar de novo</strong>
            <span>Limpa eventos, movimentos, relatórios e definições. Mantém utilizadores e log.</span>
            <label>
              Confirmação
              <input
                placeholder="sim confirmo"
                value={resetConfirmation}
                onChange={(event) => setResetConfirmation(event.target.value)}
              />
            </label>
            <button
              className="danger-admin-button"
              disabled={isResettingDatabase || resetConfirmation !== "sim confirmo"}
              type="button"
              onClick={resetDatabase}
            >
              {isResettingDatabase ? "A limpar..." : "Recomeçar base de dados"}
            </button>
          </div>
          {databaseMessage ? <p className="form-message">{databaseMessage}</p> : null}
        </section>
      </details>

      <details className="admin-collapse-panel admin-closed-events-panel" aria-label="Eventos fechados">
        <summary className="admin-collapse-summary">
          <span>
            <span className="eyebrow">Eventos</span>
            <strong>Eventos fechados</strong>
          </span>
          <em>{closedEventsState.length} fechados</em>
        </summary>
        {closedEventsError ? (
          <p className="form-message">Não foi possível carregar os eventos fechados. {closedEventsError}</p>
        ) : null}
        {closedEventsMessage ? <p className="form-message">{closedEventsMessage}</p> : null}
        <div className="closed-events-list">
          {closedEventsState.length ? (
            closedEventsState.map((event) => (
              <article className="closed-event-card" key={event.id}>
                <div>
                  <span className="event-lock-badge">
                    <span className="event-lock-glyph" aria-hidden="true" />
                    Fechado
                  </span>
                  <strong>{event.nome}</strong>
                  <small>
                    {formatEventDate(event.data_inicio)} · {formatMoney(event.saldo)}
                  </small>
                </div>
                <button disabled={unlockingEventId === event.id} type="button" onClick={() => unlockEvent(event)}>
                  {unlockingEventId === event.id ? "A desbloquear..." : "Desbloquear"}
                </button>
              </article>
            ))
          ) : (
            <div className="empty-closed-events">
              <strong>Sem eventos fechados</strong>
              <span>Quando fechares um evento na Tesouraria, ele aparece aqui para desbloquear.</span>
            </div>
          )}
        </div>
      </details>

      <details className="admin-collapse-panel admin-users-panel admin-roles-panel" aria-label="Gestão de roles">
        <summary className="admin-collapse-summary">
          <span>
            <span className="eyebrow">Permissões</span>
            <strong>Roles e acessos</strong>
          </span>
          <em>{rolesState.length} roles</em>
        </summary>
        <div className="admin-users-layout">
          <form className="admin-settings-card admin-user-form admin-role-form" onSubmit={handleRoleSubmit}>
            <div>
              <p className="eyebrow">{roleFormMode === "create" ? "Novo role" : "Editar role"}</p>
              <h3>{roleFormMode === "create" ? "Criar role" : roleForm.label}</h3>
            </div>
            <label>
              Nome do role
              <input
                value={roleForm.label}
                onChange={(event) => {
                  updateRoleField("label", event.target.value);
                  if (roleFormMode === "create") updateRoleField("id", roleSlugFromLabel(event.target.value));
                }}
              />
            </label>
            <label>
              ID técnico
              <input
                disabled={roleFormMode === "edit"}
                placeholder="ex: financeiro"
                value={roleForm.id}
                onChange={(event) => updateRoleField("id", roleSlugFromLabel(event.target.value))}
              />
            </label>
            <label>
              Descrição
              <textarea
                rows={3}
                value={roleForm.description}
                onChange={(event) => updateRoleField("description", event.target.value)}
              />
            </label>
            <div className="admin-permission-modules" aria-label="Permissões do role por módulo">
              {rolePermissionModules.map((module, moduleIndex) => {
                const enabledCount = module.permissions.filter((permission) => roleForm.permissions[permission.key]).length;
                return (
                  <details className="admin-permission-module" key={module.id} open={moduleIndex === 0}>
                    <summary>
                      <span>
                        <strong>{module.title}</strong>
                        <small>{module.description}</small>
                      </span>
                      <em>
                        {enabledCount}/{module.permissions.length}
                      </em>
                    </summary>
                    <div className="admin-permission-list">
                      {module.permissions.map((permission) => (
                        <label className="admin-permission-option" key={permission.key}>
                          <input
                            checked={roleForm.permissions[permission.key]}
                            type="checkbox"
                            onChange={(event) => updateRolePermission(permission.key, event.target.checked)}
                          />
                          <span>
                            <strong>{permission.label}</strong>
                            <small>{permission.hint}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
            {roleMessage ? <p className="form-message">{roleMessage}</p> : null}
            <div className="admin-inline-actions">
              <button disabled={isSavingRoles} type="submit">
                {isSavingRoles ? "A guardar..." : roleFormMode === "create" ? "Criar role" : "Guardar role"}
              </button>
              {roleFormMode === "edit" ? (
                <button className="secondary-button" disabled={isSavingRoles} type="button" onClick={resetRoleForm}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>

          <div className="admin-roles-accordion" aria-label="Roles existentes">
            {rolesState.map((role, index) => {
              const enabledPermissions = rolePermissionLabels.filter((permission) => role.permissions[permission.key]);
              return (
                <details className="admin-role-card" key={role.id} open={index === 0 || role.id === roleForm.id}>
                  <summary>
                    <span className="admin-role-card-title">
                      <span className={`admin-role-pill ${rolePillClass(role.id)}`}>{role.label}</span>
                      <strong>{role.label}</strong>
                      <small>{role.id}</small>
                    </span>
                    <span className="admin-role-card-meta">
                      <em>
                        {enabledPermissions.length} {enabledPermissions.length === 1 ? "permissão" : "permissões"}
                      </em>
                      <small>{role.builtIn ? "Base" : "Personalizado"}</small>
                    </span>
                  </summary>
                  <div className="admin-role-card-body">
                    <div className="admin-role-card-info">
                      <span>Descrição</span>
                      <p>{role.description}</p>
                    </div>
                    <div className="admin-role-module-list" aria-label={`Permissões do role ${role.label}`}>
                      {rolePermissionModules.map((module) => {
                        const modulePermissions = module.permissions.filter((permission) => role.permissions[permission.key]);
                        if (!modulePermissions.length) return null;
                        return (
                          <section className="admin-role-module-group" key={module.id}>
                            <div>
                              <strong>{module.title}</strong>
                              <small>
                                {modulePermissions.length}/{module.permissions.length}
                              </small>
                            </div>
                            <div className="admin-role-permissions">
                              {modulePermissions.map((permission) => (
                                <span className="permission-pill" key={permission.key}>
                                  {permission.label}
                                </span>
                              ))}
                            </div>
                          </section>
                        );
                      })}
                      {!enabledPermissions.length ? <span className="permission-pill muted">Sem permissões</span> : null}
                    </div>
                    <div className="admin-table-actions admin-role-card-actions">
                      <button disabled={role.id === "admin" || isSavingRoles} type="button" onClick={() => editRole(role)}>
                        Editar
                      </button>
                      <button
                        className="danger-table-button"
                        disabled={role.builtIn || isSavingRoles}
                        type="button"
                        onClick={() => deleteRole(role)}
                      >
                        Apagar
                      </button>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </details>

      <details className="admin-collapse-panel admin-users-panel" aria-label="Gestão de utilizadores">
        <summary className="admin-collapse-summary">
          <span>
            <span className="eyebrow">Segurança</span>
            <strong>Utilizadores</strong>
          </span>
          <em>{usersState.length} acessos</em>
        </summary>
        <div className="admin-users-layout">
          <form className="admin-settings-card admin-user-form" onSubmit={handleUserSubmit}>
            <div>
              <p className="eyebrow">{userFormMode === "create" ? "Novo acesso" : "Editar acesso"}</p>
              <h3>{userFormMode === "create" ? "Adicionar utilizador" : userForm.username}</h3>
            </div>
            <label>
              Utilizador
              <input
                disabled={userFormMode === "edit"}
                value={userForm.username}
                onChange={(event) => updateUserField("username", event.target.value)}
              />
            </label>
            <label>
              Role
              <select
                value={userForm.role}
                onChange={(event) => updateUserField("role", event.target.value as UserRole)}
              >
                {rolesState.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {userFormMode === "create" ? "Password" : "Nova password"}
              <input
                minLength={6}
                placeholder={userFormMode === "create" ? "" : "Deixa em branco para manter"}
                type="password"
                value={userForm.password}
                onChange={(event) => updateUserField("password", event.target.value)}
              />
            </label>
            <label>
              Confirmar password
              <input
                minLength={6}
                type="password"
                value={userForm.confirmPassword}
                onChange={(event) => updateUserField("confirmPassword", event.target.value)}
              />
            </label>
            {userMessage ? <p className="form-message">{userMessage}</p> : null}
            <div className="admin-inline-actions">
              <button disabled={isSavingUser} type="submit">
                {isSavingUser ? "A guardar..." : userFormMode === "create" ? "Criar utilizador" : "Guardar alterações"}
              </button>
              {userFormMode === "edit" ? (
                <button className="secondary-button" disabled={isSavingUser} type="button" onClick={resetUserForm}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>

          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Utilizador</th>
                  <th>Role</th>
                  <th>Permissões</th>
                  <th>Última alteração</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {usersState.length ? (
                  usersState.map((user) => (
                    <tr key={user.username}>
                      <td>
                        <strong>{user.username}</strong>
                        {user.username === session.username ? <span className="current-user-badge">Atual</span> : null}
                      </td>
                      <td>
                        <span className={`admin-role-pill ${rolePillClass(user.role)}`}>{roleName(user.role)}</span>
                      </td>
                      <td>{roleDescription(user.role)}</td>
                      <td>{user.updated_at ? formatLogDate(user.updated_at) : "Base"}</td>
                      <td>
                        <div className="admin-table-actions">
                          <button type="button" onClick={() => editUser(user)}>
                            Editar
                          </button>
                          <button
                            className="danger-table-button"
                            disabled={deletingUsername === user.username || user.username === session.username}
                            type="button"
                            onClick={() => deleteUser(user)}
                          >
                            {deletingUsername === user.username ? "A apagar..." : "Apagar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-movement-row" colSpan={5}>
                      Ainda não existem utilizadores configurados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <details className="admin-collapse-panel admin-log-panel" aria-label="Log de alterações">
        <summary className="admin-collapse-summary">
          <span>
            <span className="eyebrow">Auditoria</span>
            <strong>Log de alterações</strong>
          </span>
          <em>{auditLogs.length} nesta página</em>
        </summary>
        {auditLogError ? <p className="form-message">Não foi possível carregar o log. {auditLogError}</p> : null}
        <div className="admin-log-table-wrap">
          <table className="admin-log-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Utilizador</th>
                <th>Role</th>
                <th>Ação</th>
                <th>Resumo</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length ? (
                auditLogs.map((log) => {
                  const target = auditLogTarget(log);
                  return (
                    <tr
                      aria-label={target ? `Abrir ${log.summary ?? log.action}` : undefined}
                      className={target ? "clickable-log-row" : undefined}
                      key={log.id}
                      role={target ? "link" : undefined}
                      tabIndex={target ? 0 : undefined}
                      title={target ? "Abrir item alterado" : undefined}
                      onClick={target ? () => router.push(target) : undefined}
                      onKeyDown={
                        target
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                router.push(target);
                              }
                            }
                          : undefined
                      }
                    >
                      <td>{formatLogDate(log.created_at)}</td>
                      <td>{log.username}</td>
                      <td>{roleName(log.role)}</td>
                      <td>{log.action}</td>
                      <td>{log.summary ?? "-"}</td>
                      <td className="admin-log-details">{formatDetails(log.details)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="empty-movement-row" colSpan={6}>
                    Ainda não há alterações registadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="admin-log-pagination">
          <Link
            aria-disabled={auditPage === 0}
            className={auditPage === 0 ? "nav-button disabled" : "nav-button secondary-nav-button"}
            href={`/admin?logPage=${Math.max(0, auditPage - 1)}`}
          >
            Anterior
          </Link>
          <span>Página {auditPage + 1}</span>
          <Link
            aria-disabled={!auditHasNext}
            className={auditHasNext ? "nav-button secondary-nav-button" : "nav-button disabled"}
            href={`/admin?logPage=${auditPage + 1}`}
          >
            Seguinte
          </Link>
        </div>
      </details>
    </>
  );
}
