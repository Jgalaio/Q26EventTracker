"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppFavicon, AppLogo, ReportLogo } from "../app-settings";
import type { AuditLogEntry } from "../audit-log";
import { ROLE_LABELS, type AuthSession } from "../auth-types";
import type { EventoResumo } from "../supabase-data";

type AdminUser = {
  username: string;
  role: AuthSession["role"];
};

type AdminClientProps = {
  session: AuthSession;
  users: AdminUser[];
  reportLogo: ReportLogo | null;
  appLogo: AppLogo | null;
  appFavicon: AppFavicon | null;
  q25Balance: number;
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

const emptyPasswordForm: PasswordForm = {
  currentPassword: "",
  newPassword: "",
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

function auditLogTarget(log: AuditLogEntry) {
  if (!log.resource_id) return null;
  if (log.resource === "eventos") return `/?event=${encodeURIComponent(log.resource_id)}`;
  if (log.resource === "movimentos") return `/?movement=${encodeURIComponent(log.resource_id)}`;
  return null;
}

export function AdminClient({
  session,
  users,
  reportLogo,
  appLogo,
  appFavicon,
  q25Balance,
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
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [appLogoMessage, setAppLogoMessage] = useState<string | null>(null);
  const [faviconMessage, setFaviconMessage] = useState<string | null>(null);
  const [q25Message, setQ25Message] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState(reportLogo?.dataUrl ?? "");
  const [logoFileName, setLogoFileName] = useState(reportLogo?.fileName ?? "");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [appLogoPreview, setAppLogoPreview] = useState(appLogo?.dataUrl ?? "");
  const [appLogoFileName, setAppLogoFileName] = useState(appLogo?.fileName ?? "");
  const [appLogoDataUrl, setAppLogoDataUrl] = useState("");
  const [faviconPreview, setFaviconPreview] = useState(appFavicon?.dataUrl ?? "");
  const [faviconFileName, setFaviconFileName] = useState(appFavicon?.fileName ?? "");
  const [faviconDataUrl, setFaviconDataUrl] = useState("");
  const [q25Amount, setQ25Amount] = useState(String(q25Balance).replace(".", ","));
  const [databaseImportText, setDatabaseImportText] = useState("");
  const [databaseImportName, setDatabaseImportName] = useState("");
  const [databaseMessage, setDatabaseMessage] = useState<string | null>(null);
  const [closedEventsState, setClosedEventsState] = useState(closedEvents);
  const [closedEventsMessage, setClosedEventsMessage] = useState<string | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [isSavingAppLogo, setIsSavingAppLogo] = useState(false);
  const [isSavingFavicon, setIsSavingFavicon] = useState(false);
  const [isSavingQ25, setIsSavingQ25] = useState(false);
  const [isExportingDatabase, setIsExportingDatabase] = useState(false);
  const [isImportingDatabase, setIsImportingDatabase] = useState(false);
  const [isResettingDatabase, setIsResettingDatabase] = useState(false);
  const [unlockingEventId, setUnlockingEventId] = useState<string | null>(null);

  const updatePasswordField = (field: keyof PasswordForm, value: string) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
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

  const handleQ25Submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingQ25(true);
    setQ25Message(null);

    try {
      const response = await fetch("/api/admin/q25-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: q25Amount })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível guardar o montante.");
      setQ25Message(body?.message ?? "Montante Q25 atualizado.");
    } catch (error) {
      setQ25Message(error instanceof Error ? error.message : "Não foi possível guardar o montante.");
    } finally {
      setIsSavingQ25(false);
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

        <form className="admin-settings-card" onSubmit={handleQ25Submit}>
          <div>
            <p className="eyebrow">Totais</p>
            <h2>Montante deixado pelos Q25</h2>
          </div>
          <label>
            Montante
            <input
              inputMode="decimal"
              placeholder="0,00"
              value={q25Amount}
              onChange={(event) => setQ25Amount(event.target.value)}
            />
          </label>
          {q25Message ? <p className="form-message">{q25Message}</p> : null}
          <button disabled={isSavingQ25} type="submit">
            {isSavingQ25 ? "A guardar..." : "Guardar montante"}
          </button>
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

      <section className="admin-grid" aria-label="Utilizadores">
        {users.map((user) => (
          <article className="admin-card" key={user.username}>
            <span>{ROLE_LABELS[user.role]}</span>
            <strong>{user.username}</strong>
            <p>
              {user.role === "admin"
                ? "Acesso total, incluindo apagar registos e painel Admin."
                : user.role === "operator"
                  ? "Pode adicionar e alterar. Alterações exigem justificação."
                  : "Pode apenas consultar o OverView."}
            </p>
          </article>
        ))}
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
