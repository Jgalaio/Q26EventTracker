"use client";

import Link from "next/link";
import { useState } from "react";
import type { AppLogo } from "./app-settings";
import { canWrite, type AuthSession } from "./auth-types";
import type { Nota } from "./supabase-data";
import { TopbarActions } from "./topbar-actions";
import { TopbarBrand } from "./topbar-brand";

type WelcomeCard = {
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "green" | "red" | "purple";
  href?: string;
};

type WelcomeQuickNotes = {
  content: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

type WelcomeClientProps = {
  appLogo: AppLogo | null;
  cards: WelcomeCard[];
  dataError: string | null;
  quickNotes: WelcomeQuickNotes;
  session: AuthSession;
  urgentNotes: Nota[];
};

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function formatTaskDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  return dateFormatter.format(new Date(value));
}

function taskStatus(note: Nota) {
  return note.estado ?? "todo";
}

function priorityLabel(value: Nota["prioridade"]) {
  if (value === "urgente") return "Urgente";
  if (value === "alta") return "Alta";
  if (value === "baixa") return "Baixa";
  return "Normal";
}

function statusLabel(value: Nota["estado"]) {
  if (value === "em_curso") return "Em curso";
  if (value === "concluido") return "Concluído";
  if (value === "cancelado") return "Cancelado";
  return "A fazer";
}

function shortText(value: string) {
  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

export function WelcomeClient({ appLogo, cards, dataError, quickNotes, session, urgentNotes }: WelcomeClientProps) {
  const mayWrite = canWrite(session);
  const [notesContent, setNotesContent] = useState(quickNotes.content);
  const [notesMeta, setNotesMeta] = useState({ updatedAt: quickNotes.updatedAt, updatedBy: quickNotes.updatedBy });
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesMessage, setNotesMessage] = useState<string | null>(null);

  const saveQuickNotes = async () => {
    if (!mayWrite) return;
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
      if (!response.ok) throw new Error(body?.message ?? `${response.status} ${response.statusText}`);
      setNotesMeta({ updatedAt: body?.updatedAt ?? null, updatedBy: body?.updatedBy ?? null });
      setNotesMessage("Apontamentos guardados.");
    } catch (caught) {
      setNotesMessage(caught instanceof Error ? caught.message : "Não foi possível guardar os apontamentos.");
    } finally {
      setIsSavingNotes(false);
    }
  };

  return (
    <main className="shell welcome-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Início" />
        <TopbarActions active="inicio" session={session} />
      </section>

      {dataError ? <section className="notice">Não consegui carregar todos os dados. {dataError}</section> : null}

      <section className="welcome-summary-panel" aria-label="Resumo financeiro">
        <div className="welcome-panel-heading">
          <div>
            <p className="eyebrow">Resumo financeiro</p>
            <h2>Panorama geral</h2>
          </div>
          <Link className="search-open-link" href="/overview">
            Ver OverView
          </Link>
        </div>
        <div className="welcome-card-grid">
          {cards.map((card) => {
            const content = (
              <>
                <span>{card.label}</span>
                <strong className={card.tone ? `welcome-card-value ${card.tone}` : "welcome-card-value"}>{card.value}</strong>
                <small>{card.detail}</small>
              </>
            );

            return card.href ? (
              <Link className="welcome-card welcome-card-link" href={card.href} key={card.label}>
                {content}
              </Link>
            ) : (
              <article className="welcome-card" key={card.label}>
                {content}
              </article>
            );
          })}
        </div>
      </section>

      <section className="welcome-main-grid">
        <article className="welcome-panel">
          <div className="welcome-panel-heading">
            <div>
              <p className="eyebrow">TODO</p>
              <h2>5 tarefas pendentes</h2>
            </div>
            <Link className="search-open-link" href="/notas">
              Abrir TODO
            </Link>
          </div>

          {urgentNotes.length ? (
            <div className="welcome-task-list">
              {urgentNotes.map((note) => (
                <Link className="welcome-task-row" href={`/notas?nota=${note.id}`} key={note.id}>
                  <div>
                    <strong>{note.titulo}</strong>
                    <span>{shortText(note.conteudo || "Sem descrição")}</span>
                  </div>
                  <small>
                    {priorityLabel(note.prioridade)} · {statusLabel(taskStatus(note))} ·{" "}
                    {formatTaskDate(note.prazo_para ?? note.agendado_para ?? note.updated_at)}
                  </small>
                </Link>
              ))}
            </div>
          ) : (
            <p className="welcome-empty-state">Sem tarefas pendentes.</p>
          )}
        </article>

        <article className="welcome-panel quick-notes-panel">
          <div className="welcome-panel-heading">
            <div>
              <p className="eyebrow">Apontamentos</p>
              <h2>Bloco rápido</h2>
            </div>
            {notesMeta.updatedAt ? (
              <span className="quick-notes-meta">
                {notesMeta.updatedBy ?? "Q26"} · {formatTaskDate(notesMeta.updatedAt)}
              </span>
            ) : null}
          </div>

          <textarea
            disabled={!mayWrite}
            maxLength={6000}
            onChange={(event) => setNotesContent(event.target.value)}
            placeholder="Apontamentos rápidos..."
            value={notesContent}
          />
          {notesMessage ? <p className="form-message">{notesMessage}</p> : null}
          <div className="quick-notes-actions">
            <span>{notesContent.length}/6000</span>
            {mayWrite ? (
              <button disabled={isSavingNotes} onClick={saveQuickNotes} type="button">
                {isSavingNotes ? "A guardar..." : "Guardar"}
              </button>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}
