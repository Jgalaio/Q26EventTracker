"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import type { ReportLogo } from "../app-settings";
import type { AuditLogEntry } from "../audit-log";
import { ROLE_LABELS, type AuthSession } from "../auth-types";

type AdminUser = {
  username: string;
  role: AuthSession["role"];
};

type AdminClientProps = {
  session: AuthSession;
  users: AdminUser[];
  reportLogo: ReportLogo | null;
  q25Balance: number;
  auditLogs: AuditLogEntry[];
  auditLogError: string | null;
  auditPage: number;
  auditHasNext: boolean;
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

function formatLogDate(value: string) {
  return logDateFormatter.format(new Date(value));
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

export function AdminClient({
  session,
  users,
  reportLogo,
  q25Balance,
  auditLogs,
  auditLogError,
  auditPage,
  auditHasNext
}: AdminClientProps) {
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [q25Message, setQ25Message] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState(reportLogo?.dataUrl ?? "");
  const [logoFileName, setLogoFileName] = useState(reportLogo?.fileName ?? "");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [q25Amount, setQ25Amount] = useState(String(q25Balance).replace(".", ","));
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [isSavingQ25, setIsSavingQ25] = useState(false);

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
                auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatLogDate(log.created_at)}</td>
                    <td>{log.username}</td>
                    <td>{ROLE_LABELS[log.role]}</td>
                    <td>{log.action}</td>
                    <td>{log.summary ?? "-"}</td>
                    <td className="admin-log-details">{formatDetails(log.details)}</td>
                  </tr>
                ))
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
