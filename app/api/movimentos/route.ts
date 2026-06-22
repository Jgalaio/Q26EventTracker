import { NextRequest } from "next/server";
import { eventLockedResponse, getEventLockState, prepareWritePayload, readJsonBody, requireWriteAccess, supabaseWrite } from "../q26-write";

export async function POST(request: NextRequest) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const body = await readJsonBody(request);
  if (typeof body.evento_id === "string") {
    const lock = await getEventLockState(body.evento_id);
    if (lock.error) return lock.error;
    if (lock.event.fechado) return eventLockedResponse(lock.event.nome);
  }

  const prepared = prepareWritePayload(body, access.session, false, "movement");
  if (prepared.error) return prepared.error;

  return supabaseWrite("movimentos", "POST", prepared.payload, access.session);
}
