"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { canDelete, canWrite, requiresJustification, type AuthSession } from "./auth-types";
import type { Nota } from "./supabase-data";

type NotesMenuProps = {
  active?: boolean;
  session: AuthSession;
};

async function requestJson<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function shortText(value: string) {
  return value.length > 82 ? `${value.slice(0, 82)}...` : value;
}

function taskStatus(note: Nota) {
  return note.estado ?? "todo";
}

function taskPriority(note: Nota) {
  return note.prioridade ?? "normal";
}

function taskSchedule(note: Nota) {
  return note.agendado_para ?? note.prazo_para ?? note.updated_at;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusLabel(value: string) {
  if (value === "em_curso") return "Em curso";
  if (value === "concluido") return "Concluído";
  if (value === "cancelado") return "Cancelado";
  return "A fazer";
}

export function NotesMenu({ active = false, session }: NotesMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState<Nota[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mayWrite = canWrite(session);
  const mayDelete = canDelete(session);
  const mustJustify = requiresJustification(session);

  const loadNotes = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const nextNotes = await requestJson<Nota[]>("/api/notas?limit=200");
      setNotes(
        nextNotes
          .slice()
          .sort((a, b) => {
            const aDone = taskStatus(a) === "concluido" || taskStatus(a) === "cancelado";
            const bDone = taskStatus(b) === "concluido" || taskStatus(b) === "cancelado";
            if (aDone !== bDone) return aDone ? 1 : -1;
            return new Date(taskSchedule(a)).getTime() - new Date(taskSchedule(b)).getTime();
          })
          .slice(0, 5)
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível carregar as tarefas.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMenu = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) await loadNotes();
  };

  const createNote = async () => {
    const titulo = window.prompt("Título da tarefa");
    if (titulo === null) return;
    const conteudo = window.prompt("Descrição / lembrete", "");
    if (conteudo === null) return;

    setMessage(null);
    try {
      await requestJson<Nota[]>("/api/notas", {
        method: "POST",
        body: JSON.stringify({ titulo, conteudo, tipo_tarefa: "task", estado: "todo", prioridade: "normal" })
      });
      await loadNotes();
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível adicionar a tarefa.");
    }
  };

  const editNote = async (note: Nota) => {
    const titulo = window.prompt("Título da tarefa", note.titulo);
    if (titulo === null) return;
    const conteudo = window.prompt("Descrição / lembrete", note.conteudo);
    if (conteudo === null) return;
    const justification = mustJustify ? window.prompt("Justificação da alteração") : "";
    if (mustJustify && !justification?.trim()) {
      setMessage("Indica a justificação da alteração.");
      return;
    }

    setMessage(null);
    try {
      await requestJson<Nota[]>(`/api/notas/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          titulo,
          conteudo,
          tipo_tarefa: note.tipo_tarefa ?? "task",
          estado: taskStatus(note),
          prioridade: taskPriority(note),
          agendado_para: note.agendado_para ?? null,
          prazo_para: note.prazo_para ?? null,
          responsavel: note.responsavel ?? "",
          categoria: note.categoria ?? "",
          concluido_em: note.concluido_em ?? null,
          justification
        })
      });
      await loadNotes();
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível editar a tarefa.");
    }
  };

  const deleteNote = async (note: Nota) => {
    if (!window.confirm(`Apagar a tarefa "${note.titulo}"?`)) return;

    setMessage(null);
    try {
      await requestJson<Nota[]>(`/api/notas/${note.id}`, { method: "DELETE" });
      await loadNotes();
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível apagar a tarefa.");
    }
  };

  return (
    <div className="notes-menu">
      <button
        aria-expanded={isOpen}
        className={active ? "notes-menu-button active" : "notes-menu-button"}
        onClick={toggleMenu}
        type="button"
      >
        TODO
      </button>
      {isOpen ? (
        <div className="notes-dropdown" role="dialog" aria-label="TODO rápido">
          <div className="notes-dropdown-header">
            <strong>TODO</strong>
            <div>
              {mayWrite ? (
                <button onClick={createNote} type="button">
                  Nova
                </button>
              ) : null}
              <Link href="/notas" onClick={() => setIsOpen(false)}>
                Abrir
              </Link>
            </div>
          </div>

          {isLoading ? <p className="notes-menu-info">A carregar tarefas...</p> : null}
          {message ? <p className="notes-menu-error">{message}</p> : null}

          {!isLoading && notes.length === 0 ? <p className="notes-menu-info">Ainda não existem tarefas.</p> : null}

          <div className="notes-preview-list">
            {notes.map((note) => (
              <div
                className={mayWrite || mayDelete ? "notes-preview-row" : "notes-preview-row notes-preview-row-single"}
                key={note.id}
              >
                <Link className="notes-preview-link" href={`/notas?nota=${note.id}`} onClick={() => setIsOpen(false)}>
                  <strong>{note.titulo}</strong>
                  <span>{shortText(note.conteudo || "Sem descrição")}</span>
                  <small>
                    <i className={`task-dot ${taskPriority(note)}`} />
                    {statusLabel(taskStatus(note))} · {formatDate(taskSchedule(note))}
                  </small>
                </Link>
                {mayWrite || mayDelete ? (
                  <div className="notes-preview-actions">
                    {mayWrite ? (
                      <button onClick={() => editNote(note)} type="button">
                        Editar
                      </button>
                    ) : null}
                    {mayDelete ? (
                      <button className="danger-text-button" onClick={() => deleteNote(note)} type="button">
                        Apagar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
