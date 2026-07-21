import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../../../audit-log";
import { getSession } from "../../../../../auth";
import { addSupportMessage, SupportTicketError, type SupportMessageInput } from "../../../../../support-tickets";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as SupportMessageInput;

  try {
    const ticket = await addSupportMessage(session, id, body);
    await writeAuditLog({
      session,
      action: "Respondeu ticket de suporte",
      resource: "support_tickets",
      resourceId: ticket.id,
      summary: `Respondeu ao ticket: ${ticket.title}`,
      details: {
        status: ticket.status,
        attachments: ticket.messages[ticket.messages.length - 1]?.attachments.length ?? 0
      }
    });

    return NextResponse.json({ message: "Resposta guardada.", ticket });
  } catch (error) {
    if (error instanceof SupportTicketError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível responder ao ticket." },
      { status: 500 }
    );
  }
}
