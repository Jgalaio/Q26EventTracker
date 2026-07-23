import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
import { getSession } from "../../../auth";
import { canViewSupport } from "../../../auth-types";
import {
  createSupportTicket,
  getVisibleSupportTickets,
  SupportTicketError,
  type SupportTicketInput
} from "../../../support-tickets";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (!canViewSupport(session)) return NextResponse.json({ message: "Sem permissão para abrir o suporte." }, { status: 403 });

  return NextResponse.json({ tickets: await getVisibleSupportTickets(session) });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as SupportTicketInput;

  try {
    const ticket = await createSupportTicket(session, body);
    await writeAuditLog({
      session,
      action: "Criou ticket de suporte",
      resource: "support_tickets",
      resourceId: ticket.id,
      summary: `Criou ticket: ${ticket.title}`,
      details: { category: ticket.category, urgency: ticket.urgency, attachments: ticket.messages[0]?.attachments.length ?? 0 }
    });

    return NextResponse.json({ message: "Ticket criado.", ticket });
  } catch (error) {
    if (error instanceof SupportTicketError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível criar o ticket." },
      { status: 500 }
    );
  }
}
