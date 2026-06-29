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

type TaskStatus = NonNullable<Nota["estado"]>;
type TaskPriority = NonNullable<Nota["prioridade"]>;
type TaskType = NonNullable<Nota["tipo_tarefa"]>;

type FormState = {
  titulo: string;
  conteudo: string;
  tipo_tarefa: TaskType;
  estado: TaskStatus;
  prioridade: TaskPriority;
  agendado_para: string;
  prazo_para: string;
  responsavel: string;
  categoria: string;
  justification: string;
};

type Mode = "view" | "create" | "edit";
type StatusFilter = "ativas" | "hoje" | "atrasadas" | "todas" | TaskStatus;

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "A fazer" },
  { value: "em_curso", label: "Em curso" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" }
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" }
];

const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: "task", label: "Task" },
  { value: "lembrete", label: "Lembrete" },
  { value: "follow_up", label: "Follow-up" },
  { value: "evento", label: "Evento" },
  { value: "outro", label: "Outro" }
];

const emptyForm: FormState = {
  titulo: "",
  conteudo: "",
  tipo_tarefa: "task",
  estado: "todo",
  prioridade: "normal",
  agendado_para: "",
  prazo_para: "",
  responsavel: "",
  categoria: "",
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

function noteStatus(note: Nota): TaskStatus {
  return note.estado ?? "todo";
}

function notePriority(note: Nota): TaskPriority {
  return note.prioridade ?? "normal";
}

function noteType(note: Nota): TaskType {
  return note.tipo_tarefa ?? "task";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function previewText(value: string) {
  if (!value.trim()) return "Sem descrição";
  return value.length > 96 ? `${value.slice(0, 96)}...` : value;
}

function statusLabel(value: TaskStatus) {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? "A fazer";
}

function priorityLabel(value: TaskPriority) {
  return PRIORITY_OPTIONS.find((option) => option.value === value)?.label ?? "Normal";
}

function typeLabel(value: TaskType) {
  return TYPE_OPTIONS.find((option) => option.value === value)?.label ?? "Task";
}

function dateForSort(note: Nota) {
  return note.agendado_para ?? note.prazo_para ?? note.updated_at;
}

function isDone(note: Nota) {
  const status = noteStatus(note);
  return status === "concluido" || status === "cancelado";
}

function isToday(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isOverdue(note: Nota) {
  if (isDone(note)) return false;
  const target = note.prazo_para ?? note.agendado_para;
  if (!target) return false;
  return new Date(target).getTime() < Date.now() && !isToday(target);
}

function taskToForm(note: Nota): FormState {
  return {
    titulo: note.titulo,
    conteudo: note.conteudo,
    tipo_tarefa: noteType(note),
    estado: noteStatus(note),
    prioridade: notePriority(note),
    agendado_para: formatDateInput(note.agendado_para),
    prazo_para: formatDateInput(note.prazo_para),
    responsavel: note.responsavel ?? "",
    categoria: note.categoria ?? "",
    justification: ""
  };
}

function formPayload(form: FormState) {
  return {
    titulo: form.titulo,
    conteudo: form.conteudo,
    tipo_tarefa: form.tipo_tarefa,
    estado: form.estado,
    prioridade: form.prioridade,
    agendado_para: form.agendado_para || null,
    prazo_para: form.prazo_para || null,
    responsavel: form.responsavel,
    categoria: form.categoria,
    concluido_em: form.estado === "concluido" ? new Date().toISOString() : null,
    justification: form.justification
  };
}

export function NotesPageClient({ initialNotes, initialSelectedId, notesError, role }: NotesPageClientProps) {
  const router = useRouter();
  const initialVisibleId = initialNotes.find((note) => note.id === initialSelectedId)?.id ?? initialNotes[0]?.id ?? null;
  const [notes, setNotes] = useState(initialNotes);
  const [selectedId, setSelectedId] = useState<string | null>(initialVisibleId);
  const [mode, setMode] = useState<Mode>(() => (initialNotes.length || !canWrite(role) ? "view" : "create"));
  const [form, setForm] = useState<FormState>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ativas");
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(notesError);
  const mayWrite = canWrite(role);
  const mayDelete = canDelete(role);

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedId) ?? notes[0] ?? null, [notes, selectedId]);

  const stats = useMemo(() => {
    return notes.reduce(
      (acc, note) => {
        if (!isDone(note)) acc.ativas += 1;
        if (isToday(note.agendado_para) || isToday(note.prazo_para)) acc.hoje += 1;
        if (isOverdue(note)) acc.atrasadas += 1;
        if (notePriority(note) === "urgente" || notePriority(note) === "alta") acc.prioritarias += 1;
        return acc;
      },
      { ativas: 0, hoje: 0, atrasadas: 0, prioritarias: 0 }
    );
  }, [notes]);

  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return notes
      .filter((note) => {
        const status = noteStatus(note);
        const matchesStatus =
          statusFilter === "todas" ||
          (statusFilter === "ativas" && !isDone(note)) ||
          (statusFilter === "hoje" && (isToday(note.agendado_para) || isToday(note.prazo_para))) ||
          (statusFilter === "atrasadas" && isOverdue(note)) ||
          status === statusFilter;
        const matchesQuery =
          !normalizedQuery ||
          note.titulo.toLowerCase().includes(normalizedQuery) ||
          note.conteudo.toLowerCase().includes(normalizedQuery) ||
          note.responsavel?.toLowerCase().includes(normalizedQuery) ||
          note.categoria?.toLowerCase().includes(normalizedQuery);
        return matchesStatus && matchesQuery;
      })
      .sort((a, b) => {
        const aDone = isDone(a);
        const bDone = isDone(b);
        if (aDone !== bDone) return aDone ? 1 : -1;
        const priorityOrder: Record<TaskPriority, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
        const priorityDiff = priorityOrder[notePriority(a)] - priorityOrder[notePriority(b)];
        if (priorityDiff) return priorityDiff;
        return new Date(dateForSort(a)).getTime() - new Date(dateForSort(b)).getTime();
      });
  }, [notes, query, statusFilter]);

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
    setForm(taskToForm(selectedNote));
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

  const saveTask = async () => {
    if (!mayWrite) return;
    if (!form.titulo.trim()) {
      setMessage("Indica o título da tarefa.");
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
          body: JSON.stringify(formPayload(form))
        });
        await reloadNotes(created[0]?.id ?? null);
      } else if (selectedNote) {
        const updated = await requestJson<Nota[]>(`/api/notas/${selectedNote.id}`, {
          method: "PATCH",
          body: JSON.stringify(formPayload(form))
        });
        await reloadNotes(updated[0]?.id ?? selectedNote.id);
      }
      setMode("view");
      setForm(emptyForm);
      setMessage("Tarefa guardada.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível guardar a tarefa.");
    } finally {
      setIsSaving(false);
    }
  };

  const quickStatus = async (note: Nota, estado: TaskStatus) => {
    if (!mayWrite) return;
    const justification =
      role === "operator" ? window.prompt(`Justificação para alterar "${note.titulo}" para ${statusLabel(estado)}`) : "";
    if (role === "operator" && !justification?.trim()) {
      setMessage("Indica a justificação da alteração.");
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      const updated = await requestJson<Nota[]>(`/api/notas/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify(formPayload({ ...taskToForm(note), estado, justification: justification ?? "" }))
      });
      await reloadNotes(updated[0]?.id ?? note.id);
      setMessage("Estado atualizado.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível atualizar a tarefa.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTask = async () => {
    if (!selectedNote || !mayDelete) return;
    if (!window.confirm(`Apagar a tarefa "${selectedNote.titulo}"?`)) return;

    setIsSaving(true);
    setMessage(null);
    try {
      await requestJson<Nota[]>(`/api/notas/${selectedNote.id}`, { method: "DELETE" });
      await reloadNotes(null);
      setMode("view");
      setMessage("Tarefa apagada.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível apagar a tarefa.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="notes-page-layout todo-page-layout" aria-label="TODO e agendamento">
      <aside className="notes-list-panel">
        <div className="notes-page-heading">
          <div>
            <p className="eyebrow">Agenda</p>
            <h2>TODO</h2>
          </div>
          {mayWrite ? (
            <button className="compact-action-button" onClick={startCreate} type="button">
              Nova tarefa
            </button>
          ) : null}
        </div>

        <div className="todo-stats-grid">
          <button type="button" onClick={() => setStatusFilter("ativas")}>
            <span>Ativas</span>
            <strong>{stats.ativas}</strong>
          </button>
          <button type="button" onClick={() => setStatusFilter("hoje")}>
            <span>Hoje</span>
            <strong>{stats.hoje}</strong>
          </button>
          <button className={stats.atrasadas ? "danger" : ""} type="button" onClick={() => setStatusFilter("atrasadas")}>
            <span>Atrasadas</span>
            <strong>{stats.atrasadas}</strong>
          </button>
          <button type="button" onClick={() => setStatusFilter("todas")}>
            <span>Prioridade</span>
            <strong>{stats.prioritarias}</strong>
          </button>
        </div>

        <div className="todo-filters">
          <label>
            Pesquisa
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Título, responsável..." />
          </label>
          <label>
            Estado
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="ativas">Ativas</option>
              <option value="hoje">Hoje</option>
              <option value="atrasadas">Atrasadas</option>
              <option value="todas">Todas</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="notes-list">
          {visibleNotes.length ? (
            visibleNotes.map((note) => (
              <button
                className={selectedNote?.id === note.id && mode !== "create" ? "note-list-item todo-list-item active" : "note-list-item todo-list-item"}
                key={note.id}
                onClick={() => selectNote(note)}
                type="button"
              >
                <span className={`todo-status-chip ${noteStatus(note)}`}>{statusLabel(noteStatus(note))}</span>
                <strong>{note.titulo}</strong>
                <span>{previewText(note.conteudo)}</span>
                <small>
                  <i className={`task-dot ${notePriority(note)}`} />
                  {priorityLabel(notePriority(note))} · {formatDate(note.agendado_para ?? note.prazo_para ?? note.updated_at)}
                </small>
              </button>
            ))
          ) : (
            <p className="notes-empty-state">Sem tarefas para este filtro.</p>
          )}
        </div>
      </aside>

      <article className="notes-detail-panel">
        <div className="notes-page-heading">
          <div>
            <p className="eyebrow">{mode === "create" ? "Nova tarefa" : "Detalhe TODO"}</p>
            <h2>{mode === "create" ? "Adicionar tarefa" : selectedNote?.titulo ?? "Sem tarefa selecionada"}</h2>
          </div>
          {mode === "view" && selectedNote ? (
            <div className="notes-detail-actions">
              {mayWrite && noteStatus(selectedNote) !== "concluido" ? (
                <button className="compact-action-button" onClick={() => quickStatus(selectedNote, "concluido")} type="button">
                  Concluir
                </button>
              ) : null}
              {mayWrite && noteStatus(selectedNote) === "concluido" ? (
                <button className="neutral-action-button" onClick={() => quickStatus(selectedNote, "todo")} type="button">
                  Reabrir
                </button>
              ) : null}
              {mayWrite ? (
                <button className="compact-action-button" onClick={startEdit} type="button">
                  Editar
                </button>
              ) : null}
              {mayDelete ? (
                <button className="danger-action-button" onClick={deleteTask} type="button">
                  Apagar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {message ? <p className="notes-page-message">{message}</p> : null}

        {mode === "view" ? (
          selectedNote ? (
            <div className="note-readable todo-readable">
              <div className="todo-meta-bar">
                <span className={`todo-status-chip ${noteStatus(selectedNote)}`}>{statusLabel(noteStatus(selectedNote))}</span>
                <span className={`todo-priority-chip ${notePriority(selectedNote)}`}>{priorityLabel(notePriority(selectedNote))}</span>
                <span>{typeLabel(noteType(selectedNote))}</span>
              </div>
              <p>{selectedNote.conteudo || "Sem descrição."}</p>
              <dl>
                <div>
                  <dt>Agendado</dt>
                  <dd>{formatDate(selectedNote.agendado_para)}</dd>
                </div>
                <div>
                  <dt>Prazo</dt>
                  <dd>{formatDate(selectedNote.prazo_para)}</dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>{selectedNote.responsavel || "Sem responsável"}</dd>
                </div>
                <div>
                  <dt>Categoria</dt>
                  <dd>{selectedNote.categoria || "Sem categoria"}</dd>
                </div>
                <div>
                  <dt>Criada por</dt>
                  <dd>{selectedNote.created_by}</dd>
                </div>
                <div>
                  <dt>Última alteração</dt>
                  <dd>{formatDate(selectedNote.updated_at)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="notes-empty-state">Seleciona uma tarefa ou adiciona uma nova.</p>
          )
        ) : (
          <form className="note-form todo-form" onSubmit={(event) => event.preventDefault()}>
            <label className="full">
              Título
              <input
                value={form.titulo}
                onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))}
              />
            </label>
            <label>
              Tipo
              <select
                value={form.tipo_tarefa}
                onChange={(event) => setForm((current) => ({ ...current, tipo_tarefa: event.target.value as TaskType }))}
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select
                value={form.estado}
                onChange={(event) => setForm((current) => ({ ...current, estado: event.target.value as TaskStatus }))}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prioridade
              <select
                value={form.prioridade}
                onChange={(event) => setForm((current) => ({ ...current, prioridade: event.target.value as TaskPriority }))}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Responsável
              <input
                value={form.responsavel}
                onChange={(event) => setForm((current) => ({ ...current, responsavel: event.target.value }))}
              />
            </label>
            <label>
              Agendado para
              <input
                type="datetime-local"
                value={form.agendado_para}
                onChange={(event) => setForm((current) => ({ ...current, agendado_para: event.target.value }))}
              />
            </label>
            <label>
              Prazo
              <input
                type="datetime-local"
                value={form.prazo_para}
                onChange={(event) => setForm((current) => ({ ...current, prazo_para: event.target.value }))}
              />
            </label>
            <label>
              Categoria
              <input
                value={form.categoria}
                onChange={(event) => setForm((current) => ({ ...current, categoria: event.target.value }))}
              />
            </label>
            <label className="full">
              Descrição / lembrete
              <textarea
                rows={8}
                value={form.conteudo}
                onChange={(event) => setForm((current) => ({ ...current, conteudo: event.target.value }))}
              />
            </label>
            {role === "operator" && mode === "edit" ? (
              <label className="full">
                Justificação
                <input
                  value={form.justification}
                  onChange={(event) => setForm((current) => ({ ...current, justification: event.target.value }))}
                />
              </label>
            ) : null}
            <div className="note-form-actions full">
              <button className="compact-action-button" disabled={isSaving} onClick={saveTask} type="button">
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
