"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import type { AuthSession } from "../auth-types";
import type {
  SupportAttachment,
  SupportCategory,
  SupportStatus,
  SupportTicket,
  SupportUrgency
} from "../support-tickets";

type SupportClientProps = {
  initialTickets: SupportTicket[];
  session: AuthSession;
};

type TicketResponse = {
  message?: string;
  ticket?: SupportTicket;
};

type AttachmentDraft = Omit<SupportAttachment, "id">;
type SupportStatusFilter = SupportStatus | "todos";
type SupportUrgencyFilter = SupportUrgency | "todos";
type SupportCategoryFilter = SupportCategory | "todos";

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 1_500_000;

const urgencyOptions: Array<{ value: SupportUrgency; label: string }> = [
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" }
];

const categoryOptions: Array<{ value: SupportCategory; label: string }> = [
  { value: "bug", label: "Bug" },
  { value: "pedido", label: "Pedido" },
  { value: "duvida", label: "Dúvida" },
  { value: "acesso", label: "Acesso" },
  { value: "outro", label: "Outro" }
];

const statusOptions: Array<{ value: SupportStatus; label: string }> = [
  { value: "aberto", label: "Aberto" },
  { value: "em_analise", label: "Em análise" },
  { value: "respondido", label: "Respondido" },
  { value: "fechado", label: "Fechado" }
];

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function statusLabel(status: SupportStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function urgencyLabel(urgency: SupportUrgency) {
  return urgencyOptions.find((option) => option.value === urgency)?.label ?? urgency;
}

function categoryLabel(category: SupportCategory) {
  return categoryOptions.find((option) => option.value === category)?.label ?? category;
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function sortTickets(tickets: SupportTicket[]) {
  return [...tickets].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function replaceTicket(tickets: SupportTicket[], ticket: SupportTicket) {
  const next = tickets.some((item) => item.id === ticket.id)
    ? tickets.map((item) => (item.id === ticket.id ? ticket : item))
    : [ticket, ...tickets];
  return sortTickets(next);
}

function shortText(value: string) {
  return value.length > 110 ? `${value.slice(0, 110)}...` : value;
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      if (typeof reader.result !== "string") reject(new Error("Imagem inválida."));
      else resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function attachmentsFromInput(input: HTMLInputElement | null): Promise<AttachmentDraft[]> {
  const files = Array.from(input?.files ?? []);
  if (!files.length) return [];
  if (files.length > MAX_ATTACHMENTS) throw new Error(`Podes anexar no máximo ${MAX_ATTACHMENTS} imagens por mensagem.`);

  return Promise.all(
    files.map(async (file) => {
      if (!file.type.startsWith("image/")) throw new Error("Só são aceites imagens.");
      if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Cada imagem deve ter no máximo 1,5 MB.");
      return {
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: await readFileAsDataUrl(file)
      };
    })
  );
}

export function SupportClient({ initialTickets, session }: SupportClientProps) {
  const [tickets, setTickets] = useState(() => sortTickets(initialTickets));
  const [selectedTicketId, setSelectedTicketId] = useState(initialTickets[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<SupportCategory>("pedido");
  const [urgency, setUrgency] = useState<SupportUrgency>("normal");
  const [statusFilter, setStatusFilter] = useState<SupportStatusFilter>("todos");
  const [urgencyFilter, setUrgencyFilter] = useState<SupportUrgencyFilter>("todos");
  const [categoryFilter, setCategoryFilter] = useState<SupportCategoryFilter>("todos");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const createFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const canCreate = session.role === "admin" || session.permissions.createSupportTickets;
  const canManage = session.role === "admin" || session.permissions.manageSupportTickets;
  const canReply = session.role === "admin" || session.permissions.replySupportTickets || canManage;
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (statusFilter !== "todos" && ticket.status !== statusFilter) return false;
      if (urgencyFilter !== "todos" && ticket.urgency !== urgencyFilter) return false;
      if (categoryFilter !== "todos" && ticket.category !== categoryFilter) return false;
      return true;
    });
  }, [categoryFilter, statusFilter, tickets, urgencyFilter]);
  const selectedTicket = useMemo(
    () => filteredTickets.find((ticket) => ticket.id === selectedTicketId) ?? filteredTickets[0] ?? null,
    [filteredTickets, selectedTicketId]
  );
  const openTickets = tickets.filter((ticket) => ticket.status !== "fechado").length;
  const urgentTickets = tickets.filter((ticket) => ticket.status !== "fechado" && ticket.urgency === "urgente").length;
  const answeredTickets = tickets.filter((ticket) => ticket.status === "respondido").length;

  const saveTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;
    setFeedback(null);
    setIsSaving(true);

    try {
      const attachments = await attachmentsFromInput(createFileInputRef.current);
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, urgency, text: message, attachments })
      });
      const body = (await response.json().catch(() => ({}))) as TicketResponse;
      if (!response.ok || !body.ticket) throw new Error(body.message ?? `${response.status} ${response.statusText}`);

      setTickets((current) => replaceTicket(current, body.ticket as SupportTicket));
      setSelectedTicketId(body.ticket.id);
      setTitle("");
      setCategory("pedido");
      setUrgency("normal");
      setMessage("");
      if (createFileInputRef.current) createFileInputRef.current.value = "";
      setFeedback("Ticket criado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível criar o ticket.");
    } finally {
      setIsSaving(false);
    }
  };

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTicket) return;
    setFeedback(null);
    setIsSaving(true);

    try {
      const attachments = await attachmentsFromInput(replyFileInputRef.current);
      const response = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply, attachments })
      });
      const body = (await response.json().catch(() => ({}))) as TicketResponse;
      if (!response.ok || !body.ticket) throw new Error(body.message ?? `${response.status} ${response.statusText}`);

      setTickets((current) => replaceTicket(current, body.ticket as SupportTicket));
      setSelectedTicketId(body.ticket.id);
      setReply("");
      if (replyFileInputRef.current) replyFileInputRef.current.value = "";
      setFeedback("Resposta guardada.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível guardar a resposta.");
    } finally {
      setIsSaving(false);
    }
  };

  const changeStatus = async (ticket: SupportTicket, status: SupportStatus) => {
    if (!canManage) return;
    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const body = (await response.json().catch(() => ({}))) as TicketResponse;
      if (!response.ok || !body.ticket) throw new Error(body.message ?? `${response.status} ${response.statusText}`);

      setTickets((current) => replaceTicket(current, body.ticket as SupportTicket));
      setSelectedTicketId(body.ticket.id);
      setFeedback("Estado atualizado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível atualizar o estado.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="support-grid" aria-label="Suporte">
      <aside className="support-panel support-create-panel">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Novo ticket</p>
            <h2>Abrir pedido</h2>
          </div>
        </div>

        <form className="support-form" onSubmit={saveTicket}>
          <label>
            Assunto
            <input
              disabled={!canCreate || isSaving}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex: Erro ao criar entrada"
              required
              type="text"
              value={title}
            />
          </label>
          <label>
            Urgência
            <select
              disabled={!canCreate || isSaving}
              onChange={(event) => setUrgency(event.target.value as SupportUrgency)}
              value={urgency}
            >
              {urgencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Categoria
            <select
              disabled={!canCreate || isSaving}
              onChange={(event) => setCategory(event.target.value as SupportCategory)}
              value={category}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mensagem
            <textarea
              disabled={!canCreate || isSaving}
              maxLength={8000}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Descreve o que aconteceu..."
              required
              rows={6}
              value={message}
            />
          </label>
          <label>
            Imagens
            <input
              accept="image/*"
              disabled={!canCreate || isSaving}
              multiple
              ref={createFileInputRef}
              type="file"
            />
          </label>
          <button className="primary-action" disabled={!canCreate || isSaving} type="submit">
            Criar ticket
          </button>
        </form>
      </aside>

      <aside className="support-panel support-list-panel">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Tickets</p>
            <h2>{filteredTickets.length} pedidos</h2>
          </div>
          <span>{openTickets} abertos</span>
        </div>
        <div className="support-stats">
          <span>{tickets.length} totais</span>
          <span>{urgentTickets} urgentes</span>
          <span>{answeredTickets} respondidos</span>
        </div>
        <div className="support-filters" aria-label="Filtros de suporte">
          <label>
            Estado
            <select onChange={(event) => setStatusFilter(event.target.value as SupportStatusFilter)} value={statusFilter}>
              <option value="todos">Todos</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Urgência
            <select onChange={(event) => setUrgencyFilter(event.target.value as SupportUrgencyFilter)} value={urgencyFilter}>
              <option value="todos">Todas</option>
              {urgencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Categoria
            <select onChange={(event) => setCategoryFilter(event.target.value as SupportCategoryFilter)} value={categoryFilter}>
              <option value="todos">Todas</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="support-ticket-list">
          {filteredTickets.length ? (
            filteredTickets.map((ticket) => (
              <button
                className={ticket.id === selectedTicket?.id ? "support-ticket-card active" : "support-ticket-card"}
                key={ticket.id}
                onClick={() => setSelectedTicketId(ticket.id)}
                type="button"
              >
                <span className="support-ticket-badges">
                  <i className={`support-urgency ${ticket.urgency}`}>{urgencyLabel(ticket.urgency)}</i>
                  <i className={`support-category ${ticket.category}`}>{categoryLabel(ticket.category)}</i>
                </span>
                <strong>{ticket.title}</strong>
                <small>
                  {statusLabel(ticket.status)} · {formatDate(ticket.updatedAt)}
                </small>
                <em>{shortText(ticket.messages[ticket.messages.length - 1]?.text ?? "Sem texto")}</em>
              </button>
            ))
          ) : (
            <div className="support-empty">{tickets.length ? "Sem tickets para estes filtros." : "Sem tickets."}</div>
          )}
        </div>
      </aside>

      <section className="support-panel support-detail-panel">
        {selectedTicket ? (
          <>
            <div className="support-detail-header">
              <div>
                <p className="eyebrow">Ticket</p>
                <h2>{selectedTicket.title}</h2>
                <span>
                  {selectedTicket.createdBy} · {formatDate(selectedTicket.createdAt)}
                </span>
              </div>
              <div className="support-ticket-controls">
                <span className={`support-category ${selectedTicket.category}`}>
                  {categoryLabel(selectedTicket.category)}
                </span>
                <span className={`support-urgency ${selectedTicket.urgency}`}>{urgencyLabel(selectedTicket.urgency)}</span>
                {canManage ? (
                  <select
                    aria-label="Estado do ticket"
                    disabled={isSaving}
                    onChange={(event) => changeStatus(selectedTicket, event.target.value as SupportStatus)}
                    value={selectedTicket.status}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`support-status ${selectedTicket.status}`}>{statusLabel(selectedTicket.status)}</span>
                )}
              </div>
            </div>

            <div className="support-messages">
              {selectedTicket.messages.map((item) => {
                const isMine = item.author === session.username;
                return (
                  <article className={isMine ? "support-message mine" : "support-message"} key={item.id}>
                    <header>
                      <strong>{item.author}</strong>
                      <span>
                        {item.authorRole} · {formatDate(item.createdAt)}
                      </span>
                    </header>
                    {item.text ? <p>{item.text}</p> : null}
                    {item.attachments.length ? (
                      <div className="support-attachments">
                        {item.attachments.map((attachment) => (
                          <a href={attachment.dataUrl} key={attachment.id} rel="noreferrer" target="_blank">
                            <img alt={attachment.name} src={attachment.dataUrl} />
                            <span>{attachment.name}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {selectedTicket.status !== "fechado" || canReply ? (
              <form className="support-reply-form" onSubmit={sendReply}>
                <label>
                  Nova resposta
                  <textarea
                    disabled={isSaving}
                    maxLength={8000}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Responder ao ticket..."
                    rows={4}
                    value={reply}
                  />
                </label>
                <div className="support-reply-actions">
                  <input accept="image/*" disabled={isSaving} multiple ref={replyFileInputRef} type="file" />
                  <button className="primary-action" disabled={isSaving} type="submit">
                    Responder
                  </button>
                </div>
              </form>
            ) : null}
          </>
        ) : (
          <div className="support-empty">Seleciona ou cria um ticket.</div>
        )}

        {feedback ? <p className="form-message">{feedback}</p> : null}
      </section>
    </section>
  );
}
