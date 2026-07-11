"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppFavicon, AppLogo, ReportLogo } from "../app-settings";
import type { AuditLogEntry } from "../audit-log";
import { ROLE_LABELS, type AuthSession, type UserRole } from "../auth-types";
import type { EventoResumo } from "../supabase-data";

type AdminUser = {
  username: string;
  role: UserRole;
  updated_at?: string | null;
};

type AdminClientProps = {
  session: AuthSession;
  users: AdminUser[];
  reportLogo: ReportLogo | null;
  appLogo: AppLogo | null;
  appFavicon: AppFavicon | null;
  auditLogs: AuditLogEntry[];
  auditLogError: string | null;
  auditPage: number;
  auditHasNext: boolean;
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

function roleDescription(role: UserRole) {
  if (role === "admin") return "Acesso total, incluindo apagar registos e painel Admin.";
  if (role === "operator") return "Pode adicionar e alterar. Alterações exigem justificação.";
  return "Pode apenas consultar o OverView.";
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
  reportLogo,
  appLogo,
  appFavicon,
  auditLogs,
  auditLogError,
  auditPage,
  auditHasNext,
  closedEvents,
  closedEventsError
}: AdminClientProps) {
  const router = useRouter();
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [usersState, setUsersState] = useState(() => sortAdminUsers(users));
  const [userFormMode, setUserFormMode] = useState<UserFormMode>("create");
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [userMessage, setUserMessage] = useState<string | null>(null);
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
  const [closedEventsState, setClosedEventsState] = useState(closedEvents);
  const [closedEventsMessage, setClosedEventsMessage] = useState<string | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [deletingUsername, setDeletingUsername] = useState<string | null>(null);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [isSavingAppLogo, setIsSavingAppLogo] = useState(false);
  const [isSavingFavicon, setIsSavingFavicon] = useState(false);
  const [isExportingDatabase, setIsExportingDatabase] = useState(false);
  const [isImportingDatabase, setIsImportingDatabase] = useState(false);
  const [isResettingDatabase, setIsResettingDatabase] = useState(false);
  const [unlockingEventId, setUnlockingEventId] = useState<string | null>(null);

  const updatePasswordField = (field: keyof PasswordForm, value: string) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const updateUserField = (field: keyof UserForm, value: string) => {
    setUserForm((current) => ({ ...current, [field]: value }));
  };

  const resetUserForm = () => {
    setUserFormMode("create");
    setUserForm(emptyUserForm);
    setUserMessage(null);
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

  return (
    <>
      <section className="admin-settings-grid" aria-label="Definições do admin">
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
      </section>

      <section className="admin-closed-events-panel" aria-label="Eventos fechados">
        <div className="admin-log-header">
          <div>
            <p className="eyebrow">Eventos</p>
            <h2>Eventos fechados</h2>
          </div>
          <span>{closedEventsState.length} fechados</span>
        </div>
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
      </section>

      <section className="admin-users-panel" aria-label="Gestão de utilizadores">
        <div className="admin-log-header">
          <div>
            <p className="eyebrow">Segurança</p>
            <h2>Utilizadores</h2>
          </div>
          <span>Só Admin</span>
        </div>
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
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
                <option value="view">View</option>
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
                        <span className={`admin-role-pill ${user.role}`}>{ROLE_LABELS[user.role]}</span>
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
      </section>

      <section className="admin-log-panel" aria-label="Log de alterações">
        <div className="admin-log-header">
          <div>
            <p className="eyebrow">Auditoria</p>
            <h2>Log de alterações</h2>
          </div>
          <span>50 linhas por página</span>
        </div>
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
                      <td>{ROLE_LABELS[log.role]}</td>
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
      </section>
    </>
  );
}
