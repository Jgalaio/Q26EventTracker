import { NextRequest, NextResponse } from "next/server";
import { canUnlockClosedEvents, canWrite } from "../../../auth-types";
import {
  bodyHasClosedState,
  bodyOnlyUnlocksEvent,
  eventLockedResponse,
  getEventLockState,
  prepareWritePayload,
  readJsonBody,
  requireDeleteAccess,
  requireSessionAccess,
  requireWriteAccess,
  supabaseWrite
} from "../../q26-write";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await requireSessionAccess();
  if (access.error) return access.error;

  const { id } = await context.params;
  const body = await readJsonBody(request);
  const unlockRequest = bodyOnlyUnlocksEvent(body);
  const mayUnlock = canUnlockClosedEvents(access.session);
  const mayWrite = canWrite(access.session);

  if (!mayWrite && !(unlockRequest && mayUnlock)) {
    return NextResponse.json({ message: "Sem permissão para gravar." }, { status: 403 });
  }

  const lock = await getEventLockState(id);
  if (lock.error) return lock.error;

  if (bodyHasClosedState(body)) {
    if (unlockRequest) {
      if (!mayUnlock) {
        return NextResponse.json({ message: "Sem permissão para abrir eventos fechados." }, { status: 403 });
      }
    } else if (access.session.role !== "admin") {
      return NextResponse.json({ message: "Só Admin pode fechar eventos." }, { status: 403 });
    }
  }

  if (lock.event.fechado && !(unlockRequest && mayUnlock)) {
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
