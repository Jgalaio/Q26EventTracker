"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { AuditLogEntry } from "../audit-log";
import type { AuthSession, RolePermissions } from "../auth-types";

type UserClientProps = {
  auditError: string | null;
  auditLogs: AuditLogEntry[];
  session: AuthSession;
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

const permissionLabels: Array<{ key: keyof RolePermissions; label: string }> = [
  { key: "viewTreasury", label: "Consultar Tesouraria" },
  { key: "manageRecords", label: "Adicionar e alterar" },
  { key: "deleteRecords", label: "Apagar registos" },
  { key: "exportOverviewExcel", label: "Exportar Excel no OverView" },
  { key: "requiresJustification", label: "Pedir justificação ao alterar" }
];

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function formatLogDate(value: string) {
  return dateFormatter.format(new Date(value));
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
  if (log.resource === "eventos") return `/tesouraria?event=${encodeURIComponent(log.resource_id)}`;
  if (log.resource === "movimentos") return `/tesouraria?movement=${encodeURIComponent(log.resource_id)}`;
  return null;
}

export function UserClient({ auditError, auditLogs, session }: UserClientProps) {
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const updatePasswordField = (field: keyof PasswordForm, value: string) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingPassword(true);
    setPasswordMessage(null);

    try {
      const response = await fetch("/api/user/password", {
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

  const activePermissions = permissionLabels.filter((permission) => session.permissions[permission.key]);

  return (
    <>
      <section className="user-profile-grid" aria-label="Informação do utilizador">
        <article className="user-profile-card">
          <div>
            <p className="eyebrow">Conta</p>
            <h2>{session.username}</h2>
          </div>
          <div className="user-profile-meta">
            <span>Role</span>
            <strong>{session.roleLabel}</strong>
          </div>
          <div className="user-permission-list">
            {activePermissions.length ? (
              activePermissions.map((permission) => (
                <span className="permission-pill" key={permission.key}>
                  {permission.label}
                </span>
              ))
            ) : (
              <span className="permission-pill muted">Sem permissões operacionais</span>
            )}
          </div>
        </article>

        <form className="admin-settings-card user-password-card" onSubmit={handlePasswordSubmit}>
          <div>
            <p className="eyebrow">Segurança</p>
            <h2>Alterar password</h2>
          </div>
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

      <section className="admin-log-panel user-log-panel" aria-label="Últimas alterações do utilizador">
        <div className="admin-log-header">
          <div>
            <p className="eyebrow">Histórico</p>
            <h2>Últimas alterações</h2>
          </div>
          <span>{auditLogs.length} registos</span>
        </div>
        {auditError ? <p className="form-message">Não foi possível carregar as alterações. {auditError}</p> : null}
        <div className="admin-log-table-wrap">
          <table className="admin-log-table user-log-table">
            <thead>
              <tr>
                <th>Data</th>
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
                    <tr className={target ? "clickable-log-row" : undefined} key={log.id}>
                      <td>{formatLogDate(log.created_at)}</td>
                      <td>{log.action}</td>
                      <td>
                        {target ? (
                          <Link className="user-log-link" href={target}>
                            {log.summary ?? "Abrir alteração"}
                          </Link>
                        ) : (
                          log.summary ?? "-"
                        )}
                      </td>
                      <td className="admin-log-details">{formatDetails(log.details)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="empty-movement-row" colSpan={4}>
                    Ainda não existem alterações registadas para este utilizador.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
