"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { canDelete, canWrite, type AuthSession } from "./auth-types";
import type { Nota } from "./supabase-data";

type NotesMenuProps = {
  role: AuthSession["role"];
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(new Date(value));
}

export function NotesMenu({ role }: NotesMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState<Nota[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mayWrite = canWrite(role);
  const mayDelete = canDelete(role);

  const loadNotes = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const nextNotes = await requestJson<Nota[]>("/api/notas?limit=5");
      setNotes(nextNotes);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível carregar as notas.");
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
    const titulo = window.prompt("Título da nota");
    if (titulo === null) return;
    const conteudo = window.prompt("Anotação", "");
    if (conteudo === null) return;

    setMessage(null);
    try {
      await requestJson<Nota[]>("/api/notas", {
        method: "POST",
        body: JSON.stringify({ titulo, conteudo })
      });
      await loadNotes();
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível adicionar a nota.");
    }
  };

  const editNote = async (note: Nota) => {
    const titulo = window.prompt("Título da nota", note.titulo);
    if (titulo === null) return;
    const conteudo = window.prompt("Anotação", note.conteudo);
    if (conteudo === null) return;
    const justification = role === "operator" ? window.prompt("Justificação da alteração") : "";
    if (role === "operator" && !justification?.trim()) {
      setMessage("Indica a justificação da alteração.");
      return;
    }

    setMessage(null);
    try {
      await requestJson<Nota[]>(`/api/notas/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify({ titulo, conteudo, justification })
      });
      await loadNotes();
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível editar a nota.");
    }
  };

  const deleteNote = async (note: Nota) => {
    if (!window.confirm(`Apagar a nota "${note.titulo}"?`)) return;

    setMessage(null);
    try {
      await requestJson<Nota[]>(`/api/notas/${note.id}`, { method: "DELETE" });
      await loadNotes();
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível apagar a nota.");
    }
  };

  return (
    <div className="notes-menu">
      <button aria-expanded={isOpen} className="notes-menu-button" onClick={toggleMenu} type="button">
        Notas
      </button>
      {isOpen ? (
        <div className="notes-dropdown" role="dialog" aria-label="Notas rápidas">
          <div className="notes-dropdown-header">
            <strong>Notas</strong>
            <div>
              {mayWrite ? (
                <button onClick={createNote} type="button">
                  Adicionar
                </button>
              ) : null}
              <Link href="/notas" onClick={() => setIsOpen(false)}>
                Ver todas
              </Link>
            </div>
          </div>

          {isLoading ? <p className="notes-menu-info">A carregar notas...</p> : null}
          {message ? <p className="notes-menu-error">{message}</p> : null}

          {!isLoading && notes.length === 0 ? <p className="notes-menu-info">Ainda não existem anotações.</p> : null}

          <div className="notes-preview-list">
            {notes.map((note) => (
              <div
                className={mayWrite || mayDelete ? "notes-preview-row" : "notes-preview-row notes-preview-row-single"}
                key={note.id}
              >
                <Link className="notes-preview-link" href={`/notas?nota=${note.id}`} onClick={() => setIsOpen(false)}>
                  <strong>{note.titulo}</strong>
                  <span>{shortText(note.conteudo || "Sem descrição")}</span>
                  <small>{formatDate(note.updated_at)}</small>
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
