"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { canDelete, canWrite, type AuthSession } from "../auth-types";
import type { Nota } from "../supabase-data";

type NotesPageClientProps = {
  initialNotes: Nota[];
  initialSelectedId: string | null;
  notesError: string | null;
  role: AuthSession["role"];
};

type FormState = {
  titulo: string;
  conteudo: string;
  justification: string;
};

type Mode = "view" | "create" | "edit";

const emptyForm: FormState = {
  titulo: "",
  conteudo: "",
  justification: ""
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function previewText(value: string) {
  if (!value.trim()) return "Sem conteúdo";
  return value.length > 96 ? `${value.slice(0, 96)}...` : value;
}

export function NotesPageClient({ initialNotes, initialSelectedId, notesError, role }: NotesPageClientProps) {
  const router = useRouter();
  const initialVisibleId = initialNotes.find((note) => note.id === initialSelectedId)?.id ?? initialNotes[0]?.id ?? null;
  const [notes, setNotes] = useState(initialNotes);
  const [selectedId, setSelectedId] = useState(initialVisibleId);
  const [mode, setMode] = useState<Mode>(() => (initialNotes.length || !canWrite(role) ? "view" : "create"));
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(notesError);
  const mayWrite = canWrite(role);
  const mayDelete = canDelete(role);

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedId) ?? notes[0] ?? null, [notes, selectedId]);

  const selectNote = (note: Nota) => {
    setSelectedId(note.id);
    setMode("view");
    setForm(emptyForm);
    setMessage(null);
    router.replace(`/notas?nota=${note.id}`, { scroll: false });
  };

  const startCreate = () => {
    setSelectedId(null);
    setMode("create");
    setForm(emptyForm);
    setMessage(null);
    router.replace("/notas", { scroll: false });
  };

  const startEdit = () => {
    if (!selectedNote) return;
    setMode("edit");
    setForm({
      titulo: selectedNote.titulo,
      conteudo: selectedNote.conteudo,
      justification: ""
    });
    setMessage(null);
  };

  const reloadNotes = async (nextSelectedId?: string | null) => {
    const nextNotes = await requestJson<Nota[]>("/api/notas?limit=200");
    setNotes(nextNotes);
    const nextId = nextSelectedId ?? selectedId;
    const visibleId = nextNotes.find((note) => note.id === nextId)?.id ?? nextNotes[0]?.id ?? null;
    setSelectedId(visibleId);
    router.replace(visibleId ? `/notas?nota=${visibleId}` : "/notas", { scroll: false });
  };

  const saveNote = async () => {
    if (!mayWrite) return;
    if (!form.titulo.trim()) {
      setMessage("Indica o título da nota.");
      return;
    }
    if (role === "operator" && mode === "edit" && !form.justification.trim()) {
      setMessage("Indica a justificação da alteração.");
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      if (mode === "create") {
        const created = await requestJson<Nota[]>("/api/notas", {
          method: "POST",
          body: JSON.stringify({ titulo: form.titulo, conteudo: form.conteudo })
        });
        await reloadNotes(created[0]?.id ?? null);
      } else if (selectedNote) {
        const updated = await requestJson<Nota[]>(`/api/notas/${selectedNote.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            titulo: form.titulo,
            conteudo: form.conteudo,
            justification: form.justification
          })
        });
        await reloadNotes(updated[0]?.id ?? selectedNote.id);
      }
      setMode("view");
      setForm(emptyForm);
      setMessage("Nota guardada.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível guardar a nota.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteNote = async () => {
    if (!selectedNote || !mayDelete) return;
    if (!window.confirm(`Apagar a nota "${selectedNote.titulo}"?`)) return;

    setIsSaving(true);
    setMessage(null);
    try {
      await requestJson<Nota[]>(`/api/notas/${selectedNote.id}`, { method: "DELETE" });
      await reloadNotes(null);
      setMode("view");
      setMessage("Nota apagada.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível apagar a nota.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="notes-page-layout" aria-label="Anotações">
      <aside className="notes-list-panel">
        <div className="notes-page-heading">
          <div>
            <p className="eyebrow">Anotações</p>
            <h2>Notas guardadas</h2>
          </div>
          {mayWrite ? (
            <button className="compact-action-button" onClick={startCreate} type="button">
              Adicionar
            </button>
          ) : null}
        </div>

        <div className="notes-list">
          {notes.length ? (
            notes.map((note) => (
              <button
                className={selectedNote?.id === note.id && mode !== "create" ? "note-list-item active" : "note-list-item"}
                key={note.id}
                onClick={() => selectNote(note)}
                type="button"
              >
                <strong>{note.titulo}</strong>
                <span>{previewText(note.conteudo)}</span>
                <small>{formatDate(note.updated_at)}</small>
              </button>
            ))
          ) : (
            <p className="notes-empty-state">Ainda não existem anotações.</p>
          )}
        </div>
      </aside>

      <article className="notes-detail-panel">
        <div className="notes-page-heading">
          <div>
            <p className="eyebrow">{mode === "create" ? "Nova nota" : "Detalhe"}</p>
            <h2>{mode === "create" ? "Adicionar anotação" : selectedNote?.titulo ?? "Sem nota selecionada"}</h2>
          </div>
          {mode === "view" && selectedNote ? (
            <div className="notes-detail-actions">
              {mayWrite ? (
                <button className="compact-action-button" onClick={startEdit} type="button">
                  Editar
                </button>
              ) : null}
              {mayDelete ? (
                <button className="danger-action-button" onClick={deleteNote} type="button">
                  Apagar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {message ? <p className="notes-page-message">{message}</p> : null}

        {mode === "view" ? (
          selectedNote ? (
            <div className="note-readable">
              <p>{selectedNote.conteudo || "Sem conteúdo."}</p>
              <dl>
                <div>
                  <dt>Criada por</dt>
                  <dd>{selectedNote.created_by}</dd>
                </div>
                <div>
                  <dt>Última alteração</dt>
                  <dd>{formatDate(selectedNote.updated_at)}</dd>
                </div>
                <div>
                  <dt>Editada por</dt>
                  <dd>{selectedNote.updated_by ?? selectedNote.created_by}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="notes-empty-state">Seleciona uma nota ou adiciona uma nova anotação.</p>
          )
        ) : (
          <form className="note-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              Título
              <input
                value={form.titulo}
                onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))}
              />
            </label>
            <label>
              Anotação
              <textarea
                rows={12}
                value={form.conteudo}
                onChange={(event) => setForm((current) => ({ ...current, conteudo: event.target.value }))}
              />
            </label>
            {role === "operator" && mode === "edit" ? (
              <label>
                Justificação
                <input
                  value={form.justification}
                  onChange={(event) => setForm((current) => ({ ...current, justification: event.target.value }))}
                />
              </label>
            ) : null}
            <div className="note-form-actions">
              <button className="compact-action-button" disabled={isSaving} onClick={saveNote} type="button">
                {isSaving ? "A gravar..." : "Gravar"}
              </button>
              <button
                className="neutral-action-button"
                disabled={isSaving}
                onClick={() => {
                  setMode("view");
                  setForm(emptyForm);
                }}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </article>
    </section>
  );
}
