import { getBackupSettings } from "./backup-manager";
import {
  canManageSupportTickets,
  canReplySupportTickets,
  canViewSupport,
  canViewTreasury,
  type AuthSession
} from "./auth-types";
import { getSupportTickets, getVisibleSupportTickets, type SupportTicket } from "./support-tickets";
import { getNotificationNotas, getPendingPaymentCount, type Nota } from "./supabase-data";

export type InternalNotificationTone = "info" | "warning" | "danger" | "success";

export type InternalNotification = {
  id: string;
  title: string;
  detail: string;
  href: string;
  count: number;
  tone: InternalNotificationTone;
};

export type InternalNotificationsPayload = {
  total: number;
  items: InternalNotification[];
};

function activeTicket(ticket: SupportTicket) {
  return ticket.status !== "fechado";
}

type NotificationNote = Pick<Nota, "estado" | "prioridade" | "responsavel">;

function activeTask(note: NotificationNote) {
  return note.estado !== "concluido" && note.estado !== "cancelado";
}

function relevantTaskForUser(note: NotificationNote, session: AuthSession) {
  if (session.role === "admin") return true;
  if (!note.responsavel) return true;
  return note.responsavel.trim().toLowerCase() === session.username.trim().toLowerCase();
}

function notificationTotal(items: InternalNotification[]) {
  return items.reduce((total, item) => total + item.count, 0);
}

async function supportNotifications(session: AuthSession): Promise<InternalNotification[]> {
  if (!canViewSupport(session)) return [];

  const mayHandleSupport = canReplySupportTickets(session) || canManageSupportTickets(session);
  const tickets = mayHandleSupport ? await getSupportTickets() : await getVisibleSupportTickets(session);
  const items: InternalNotification[] = [];

  if (mayHandleSupport) {
    const urgentTickets = tickets.filter((ticket) => activeTicket(ticket) && ticket.urgency === "urgente");
    const pendingTickets = tickets.filter(
      (ticket) => activeTicket(ticket) && ticket.urgency !== "urgente" && (ticket.status === "aberto" || ticket.status === "em_analise")
    );

    if (urgentTickets.length) {
      items.push({
        id: "support-urgent",
        title: "Tickets urgentes",
        detail: `${urgentTickets.length} pedido${urgentTickets.length === 1 ? "" : "s"} precisa${urgentTickets.length === 1 ? "" : "m"} de resposta.`,
        href: "/suporte",
        count: urgentTickets.length,
        tone: "danger"
      });
    }

    if (pendingTickets.length) {
      items.push({
        id: "support-pending",
        title: "Suporte pendente",
        detail: `${pendingTickets.length} ticket${pendingTickets.length === 1 ? "" : "s"} aberto${pendingTickets.length === 1 ? "" : "s"} ou em análise.`,
        href: "/suporte",
        count: pendingTickets.length,
        tone: "warning"
      });
    }
  } else {
    const answeredTickets = tickets.filter((ticket) => ticket.createdBy === session.username && ticket.status === "respondido");
    if (answeredTickets.length) {
      items.push({
        id: "support-answered",
        title: "Resposta do suporte",
        detail: `${answeredTickets.length} ticket${answeredTickets.length === 1 ? "" : "s"} com resposta para consultar.`,
        href: "/suporte",
        count: answeredTickets.length,
        tone: "info"
      });
    }
  }

  return items;
}

async function todoNotifications(session: AuthSession): Promise<InternalNotification[]> {
  const mayViewTodo = session.role === "admin" || session.permissions.viewTodo;
  if (!mayViewTodo) return [];

  const notes = await getNotificationNotas(150);
  if (notes.error) return [];
  const urgentNotes = notes.data.filter(
    (note) => activeTask(note) && relevantTaskForUser(note, session) && (note.prioridade === "urgente" || note.prioridade === "alta")
  );

  if (!urgentNotes.length) return [];
  return [
    {
      id: "todo-urgent",
      title: "TODO urgente",
      detail: `${urgentNotes.length} tarefa${urgentNotes.length === 1 ? "" : "s"} marcada${urgentNotes.length === 1 ? "" : "s"} como alta/urgente.`,
      href: "/notas",
      count: urgentNotes.length,
      tone: "warning"
    }
  ];
}

async function paymentNotifications(session: AuthSession): Promise<InternalNotification[]> {
  if (!canViewTreasury(session)) return [];

  const pendingPayments = await getPendingPaymentCount();
  if (pendingPayments.error || !pendingPayments.count) return [];

  return [
    {
      id: "pending-payments",
      title: "Pagamentos em falta",
      detail: `${pendingPayments.count} pagamento${pendingPayments.count === 1 ? "" : "s"} por regularizar.`,
      href: "/a-pagar",
      count: pendingPayments.count,
      tone: "danger"
    }
  ];
}

async function backupNotifications(session: AuthSession): Promise<InternalNotification[]> {
  if (session.role !== "admin") return [];

  const settings = await getBackupSettings();
  if (settings.lastStatus === "error") {
    return [
      {
        id: "backup-error",
        title: "Backup com erro",
        detail: settings.lastMessage ?? "O último backup não terminou com sucesso.",
        href: "/admin",
        count: 1,
        tone: "danger"
      }
    ];
  }

  if (!settings.enabled) {
    return [
      {
        id: "backup-paused",
        title: "Backup automático pausado",
        detail: "Os backups automáticos estão desligados.",
        href: "/admin",
        count: 1,
        tone: "warning"
      }
    ];
  }

  return [];
}

export async function getInternalNotifications(session: AuthSession): Promise<InternalNotificationsPayload> {
  const groups = await Promise.all([
    supportNotifications(session).catch(() => []),
    todoNotifications(session).catch(() => []),
    paymentNotifications(session).catch(() => []),
    backupNotifications(session).catch(() => [])
  ]);
  const items = groups.flat();
  return {
    total: notificationTotal(items),
    items
  };
}
