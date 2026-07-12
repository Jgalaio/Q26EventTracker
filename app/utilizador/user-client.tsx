"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { AuditLogEntry } from "../audit-log";
import type { AuthSession } from "../auth-types";
import type { EventoResumo } from "../supabase-data";
import type { UserQuickNotes } from "../user-quick-notes";

type UserClientProps = {
  auditError: string | null;
  auditLogs: AuditLogEntry[];
  canUnlockClosedEvents: boolean;
  closedEvents: EventoResumo[] | null;
  closedEventsError: string | null;
  quickNotes: UserQuickNotes;
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

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const eventDateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const moneyFormatter = new Intl.NumberFormat("pt-PT", {
  currency: "EUR",
  maximumFractionDigits: 2,
  style: "currency"
});

function formatLogDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatEventDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  return eventDateFormatter.format(new Date(`${value}T00:00:00`));
}

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0));
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

export function UserClient({
  auditError,
  auditLogs,
  canUnlockClosedEvents,
  closedEvents,
  closedEventsError,
  quickNotes,
  session
}: UserClientProps) {
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [closedEventsState, setClosedEventsState] = useState(closedEvents ?? []);
  const [closedEventsMessage, setClosedEventsMessage] = useState<string | null>(null);
  const [unlockingEventId, setUnlockingEventId] = useState<string | null>(null);
  const [notesContent, setNotesContent] = useState(quickNotes.content);
  const [notesMeta, setNotesMeta] = useState({ updatedAt: quickNotes.updatedAt, updatedBy: quickNotes.updatedBy });
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesMessage, setNotesMessage] = useState<string | null>(null);

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

  const saveQuickNotes = async () => {
    setIsSavingNotes(true);
    setNotesMessage(null);
    try {
      const response = await fetch("/api/welcome-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: notesContent })
      });
      const body = (await response.json().catch(() => null)) as
        | { content?: string; updatedAt?: string | null; updatedBy?: string | null; message?: string }
        | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível guardar os apontamentos.");
      setNotesMeta({ updatedAt: body?.updatedAt ?? null, updatedBy: body?.updatedBy ?? null });
      setNotesMessage("Apontamentos guardados.");
    } catch (error) {
      setNotesMessage(error instanceof Error ? error.message : "Não foi possível guardar os apontamentos.");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const unlockEvent = async (event: EventoResumo) => {
    const confirmed = window.confirm(`Abrir o evento "${event.nome}" para voltar a permitir alterações?`);
    if (!confirmed) return;

    const justification = session.permissions.requiresJustification
      ? window.prompt("Indica a justificação para abrir este evento.")?.trim()
      : "";
    if (session.permissions.requiresJustification && !justification) {
      setClosedEventsMessage("A abertura do evento precisa de justificação.");
      return;
    }

    setUnlockingEventId(event.id);
    setClosedEventsMessage(null);
    try {
      const response = await fetch(`/api/eventos/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechado: false, ...(justification ? { justification } : {}) })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível abrir o evento.");
      setClosedEventsState((current) => current.filter((item) => item.id !== event.id));
      setClosedEventsMessage(`Evento "${event.nome}" aberto.`);
    } catch (error) {
      setClosedEventsMessage(error instanceof Error ? error.message : "Não foi possível abrir o evento.");
    } finally {
      setUnlockingEventId(null);
    }
  };

  return (
    <>
      <section className="user-profile-grid" aria-label="Informação do utilizador">
        <article className="user-profile-card">
          <div>
            <p className="eyebrow">Conta</p>
            <h2>{session.username}</h2>
          </div>
          <div className="user-profile-meta">
            <strong>{session.roleLabel}</strong>
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

        <article className="welcome-panel quick-notes-panel user-quick-notes-card">
          <div className="welcome-panel-heading">
            <div>
              <p className="eyebrow">Apontamentos</p>
              <h2>Bloco pessoal</h2>
            </div>
            {notesMeta.updatedAt ? (
              <span className="quick-notes-meta">
                {notesMeta.updatedBy ?? session.username} · {formatLogDate(notesMeta.updatedAt)}
              </span>
            ) : null}
          </div>
          <textarea
            maxLength={6000}
            onChange={(event) => setNotesContent(event.target.value)}
            placeholder="Apontamentos pessoais..."
            value={notesContent}
          />
          {notesMessage ? <p className="form-message">{notesMessage}</p> : null}
          <div className="quick-notes-actions">
            <span>{notesContent.length}/6000</span>
            <button disabled={isSavingNotes} onClick={saveQuickNotes} type="button">
              {isSavingNotes ? "A guardar..." : "Guardar"}
            </button>
          </div>
        </article>
      </section>

      {closedEvents ? (
        <section className="admin-closed-events-panel user-closed-events-panel" aria-label="Eventos fechados">
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
                <article className="closed-event-card user-closed-event-card" key={event.id}>
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
                  {canUnlockClosedEvents ? (
                    <button disabled={unlockingEventId === event.id} type="button" onClick={() => unlockEvent(event)}>
                      {unlockingEventId === event.id ? "A abrir..." : "Abrir evento"}
                    </button>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="empty-closed-events">
                <strong>Sem eventos fechados</strong>
                <span>Quando existirem eventos fechados, aparecem aqui para consulta.</span>
              </div>
            )}
          </div>
        </section>
      ) : null}

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
