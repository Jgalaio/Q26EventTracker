import { randomUUID } from "crypto";
import {
  canCreateSupportTickets,
  canManageSupportTickets,
  canReplySupportTickets,
  canViewSupport,
  type AuthSession
} from "./auth-types";
import { readAppSetting, writeAppSetting } from "./app-settings";

export type SupportUrgency = "baixa" | "normal" | "alta" | "urgente";
export type SupportStatus = "aberto" | "em_analise" | "respondido" | "fechado";
export type SupportCategory = "bug" | "pedido" | "duvida" | "acesso" | "outro";

export type SupportAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type SupportMessage = {
  id: string;
  author: string;
  authorRole: string;
  createdAt: string;
  text: string;
  attachments: SupportAttachment[];
};

export type SupportTicket = {
  id: string;
  title: string;
  category: SupportCategory;
  urgency: SupportUrgency;
  status: SupportStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  messages: SupportMessage[];
};

export type SupportMessageInput = {
  text?: unknown;
  attachments?: unknown;
};

export type SupportTicketInput = SupportMessageInput & {
  title?: unknown;
  category?: unknown;
  urgency?: unknown;
};

export class SupportTicketError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const SUPPORT_TICKETS_KEY = "support_tickets";
const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 8000;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 1_500_000;
const MAX_STORED_TICKETS = 500;
const URGENCIES: SupportUrgency[] = ["baixa", "normal", "alta", "urgente"];
const STATUSES: SupportStatus[] = ["aberto", "em_analise", "respondido", "fechado"];
const CATEGORIES: SupportCategory[] = ["bug", "pedido", "duvida", "acesso", "outro"];

function cleanText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function normalizeUrgency(value: unknown): SupportUrgency {
  return typeof value === "string" && URGENCIES.includes(value as SupportUrgency) ? (value as SupportUrgency) : "normal";
}

function normalizeStatus(value: unknown): SupportStatus {
  return typeof value === "string" && STATUSES.includes(value as SupportStatus) ? (value as SupportStatus) : "aberto";
}

function normalizeCategory(value: unknown): SupportCategory {
  return typeof value === "string" && CATEGORIES.includes(value as SupportCategory) ? (value as SupportCategory) : "outro";
}

function safeDate(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function normalizeAttachment(value: unknown): SupportAttachment | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<SupportAttachment>;
  const name = cleanText(source.name, 120) || "imagem";
  const type = cleanText(source.type, 80);
  const dataUrl = typeof source.dataUrl === "string" ? source.dataUrl : "";
  const estimatedSize = estimateDataUrlBytes(dataUrl);
  const size = typeof source.size === "number" && Number.isFinite(source.size) ? source.size : estimatedSize;

  if (!type.startsWith("image/")) return null;
  if (!dataUrl.startsWith("data:image/")) return null;
  if (size <= 0 || size > MAX_ATTACHMENT_BYTES || estimatedSize > MAX_ATTACHMENT_BYTES) return null;

  return {
    id: typeof source.id === "string" && source.id ? source.id : randomUUID(),
    name,
    type,
    size,
    dataUrl
  };
}

function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_ATTACHMENTS)
    .map(normalizeAttachment)
    .filter((attachment): attachment is SupportAttachment => Boolean(attachment));
}

function normalizeMessage(value: unknown): SupportMessage | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<SupportMessage>;
  const now = new Date().toISOString();
  const text = cleanText(source.text, MAX_MESSAGE_LENGTH);
  const attachments = normalizeAttachments(source.attachments);
  if (!text && !attachments.length) return null;

  return {
    id: typeof source.id === "string" && source.id ? source.id : randomUUID(),
    author: cleanText(source.author, 80) || "Utilizador",
    authorRole: cleanText(source.authorRole, 48) || "Utilizador",
    createdAt: safeDate(source.createdAt, now),
    text,
    attachments
  };
}

function normalizeTicket(value: unknown): SupportTicket | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<SupportTicket>;
  const now = new Date().toISOString();
  const title = cleanText(source.title, MAX_TITLE_LENGTH);
  const messages = Array.isArray(source.messages)
    ? source.messages.map(normalizeMessage).filter((message): message is SupportMessage => Boolean(message))
    : [];

  if (!title || !messages.length) return null;

  const status = normalizeStatus(source.status);
  return {
    id: typeof source.id === "string" && source.id ? source.id : randomUUID(),
    title,
    category: normalizeCategory(source.category),
    urgency: normalizeUrgency(source.urgency),
    status,
    createdBy: cleanText(source.createdBy, 80) || messages[0].author,
    createdAt: safeDate(source.createdAt, messages[0].createdAt),
    updatedAt: safeDate(source.updatedAt, messages[messages.length - 1].createdAt),
    closedAt: status === "fechado" ? safeDate(source.closedAt, now) : null,
    messages
  };
}

function sortTickets(tickets: SupportTicket[]) {
  return tickets.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function buildMessage(session: AuthSession, input: SupportMessageInput) {
  const text = cleanText(input.text, MAX_MESSAGE_LENGTH);
  const attachments = normalizeAttachments(input.attachments);
  if (!text && !attachments.length) {
    throw new SupportTicketError("Escreve uma mensagem ou adiciona pelo menos uma imagem.", 400);
  }

  return {
    id: randomUUID(),
    author: session.username,
    authorRole: session.roleLabel,
    createdAt: new Date().toISOString(),
    text,
    attachments
  };
}

async function writeTickets(tickets: SupportTicket[]) {
  await writeAppSetting(SUPPORT_TICKETS_KEY, sortTickets(tickets).slice(0, MAX_STORED_TICKETS));
}

export async function getSupportTickets() {
  const setting = await readAppSetting<unknown>(SUPPORT_TICKETS_KEY);
  if (!Array.isArray(setting)) return [];
  return sortTickets(setting.map(normalizeTicket).filter((ticket): ticket is SupportTicket => Boolean(ticket)));
}

export async function getVisibleSupportTickets(session: AuthSession) {
  const tickets = await getSupportTickets();
  if (canManageSupportTickets(session) || canReplySupportTickets(session)) return tickets;
  return tickets.filter((ticket) => ticket.createdBy === session.username);
}

export async function createSupportTicket(session: AuthSession, input: SupportTicketInput) {
  if (!canCreateSupportTickets(session)) {
    throw new SupportTicketError("Sem permissão para criar tickets de suporte.", 403);
  }

  const title = cleanText(input.title, MAX_TITLE_LENGTH);
  if (!title) throw new SupportTicketError("Indica o assunto do pedido.", 400);

  const message = buildMessage(session, input);
  const ticket: SupportTicket = {
    id: randomUUID(),
    title,
    category: normalizeCategory(input.category),
    urgency: normalizeUrgency(input.urgency),
    status: "aberto",
    createdBy: session.username,
    createdAt: message.createdAt,
    updatedAt: message.createdAt,
    closedAt: null,
    messages: [message]
  };

  const tickets = await getSupportTickets();
  await writeTickets([ticket, ...tickets]);
  return ticket;
}

export async function addSupportMessage(session: AuthSession, ticketId: string, input: SupportMessageInput) {
  if (!canViewSupport(session)) {
    throw new SupportTicketError("Sem permissão para consultar o suporte.", 403);
  }

  const tickets = await getSupportTickets();
  const index = tickets.findIndex((ticket) => ticket.id === ticketId);
  if (index < 0) throw new SupportTicketError("Ticket não encontrado.", 404);

  const ticket = tickets[index];
  const isOwner = ticket.createdBy === session.username;
  const canAnswer = canReplySupportTickets(session) || canManageSupportTickets(session);
  if (!isOwner && !canAnswer) {
    throw new SupportTicketError("Sem permissão para responder a este ticket.", 403);
  }
  if (ticket.status === "fechado" && !canAnswer) {
    throw new SupportTicketError("Este ticket está fechado.", 400);
  }

  const message = buildMessage(session, input);
  const nextStatus: SupportStatus = canAnswer ? "respondido" : "em_analise";
  const updatedTicket: SupportTicket = {
    ...ticket,
    status: ticket.status === "fechado" ? "fechado" : nextStatus,
    updatedAt: message.createdAt,
    messages: [...ticket.messages, message]
  };

  tickets[index] = updatedTicket;
  await writeTickets(tickets);
  return updatedTicket;
}

export async function updateSupportTicketStatus(session: AuthSession, ticketId: string, status: unknown) {
  if (!canManageSupportTickets(session)) {
    throw new SupportTicketError("Sem permissão para gerir tickets de suporte.", 403);
  }

  const tickets = await getSupportTickets();
  const index = tickets.findIndex((ticket) => ticket.id === ticketId);
  if (index < 0) throw new SupportTicketError("Ticket não encontrado.", 404);

  const nextStatus = normalizeStatus(status);
  const now = new Date().toISOString();
  const updatedTicket: SupportTicket = {
    ...tickets[index],
    status: nextStatus,
    updatedAt: now,
    closedAt: nextStatus === "fechado" ? now : null
  };

  tickets[index] = updatedTicket;
  await writeTickets(tickets);
  return updatedTicket;
}
