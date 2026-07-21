import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../../audit-log";
import { getSession } from "../../../../auth";
import { updateSupportTicketStatus, SupportTicketError } from "../../../../support-tickets";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { status?: unknown };

  try {
    const ticket = await updateSupportTicketStatus(session, id, body.status);
    await writeAuditLog({
      session,
      action: "Alterou ticket de suporte",
      resource: "support_tickets",
      resourceId: ticket.id,
      summary: `Alterou estado do ticket: ${ticket.title}`,
      details: { status: ticket.status }
    });

    return NextResponse.json({ message: "Ticket atualizado.", ticket });
  } catch (error) {
    if (error instanceof SupportTicketError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível atualizar o ticket." },
      { status: 500 }
    );
  }
}
