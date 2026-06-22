import { NextRequest, NextResponse } from "next/server";
import { bodyHasClosedState, prepareWritePayload, readJsonBody, requireWriteAccess, supabaseWrite } from "../q26-write";

export async function POST(request: NextRequest) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const body = await readJsonBody(request);
  if (bodyHasClosedState(body)) {
    return NextResponse.json({ message: "Eventos novos ficam abertos por defeito." }, { status: 400 });
  }

  const prepared = prepareWritePayload(body, access.session, false, "event");
  if (prepared.error) return prepared.error;

  return supabaseWrite("eventos", "POST", prepared.payload, access.session);
}
