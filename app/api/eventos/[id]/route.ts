import { NextRequest, NextResponse } from "next/server";
import {
  bodyHasClosedState,
  bodyOnlyUnlocksEvent,
  eventLockedResponse,
  getEventLockState,
  prepareWritePayload,
  readJsonBody,
  requireDeleteAccess,
  requireWriteAccess,
  supabaseWrite
} from "../../q26-write";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const lock = await getEventLockState(id);
  if (lock.error) return lock.error;

  if (bodyHasClosedState(body) && access.session.role !== "admin") {
    return NextResponse.json({ message: "Só Admin pode fechar ou desbloquear eventos." }, { status: 403 });
  }

  if (lock.event.fechado && !(access.session.role === "admin" && bodyOnlyUnlocksEvent(body))) {
    return eventLockedResponse(lock.event.nome);
  }

  const prepared = prepareWritePayload(body, access.session, true, "event");
  if (prepared.error) return prepared.error;

  return supabaseWrite(`eventos?id=eq.${encodeURIComponent(id)}`, "PATCH", prepared.payload, access.session);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const deleteError = requireDeleteAccess(access.session);
  if (deleteError) return deleteError;

  const { id } = await context.params;
  const lock = await getEventLockState(id);
  if (lock.error) return lock.error;
  if (lock.event.fechado) return eventLockedResponse(lock.event.nome);

  return supabaseWrite(`eventos?id=eq.${encodeURIComponent(id)}`, "DELETE", undefined, access.session);
}
