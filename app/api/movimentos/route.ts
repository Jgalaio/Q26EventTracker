import { NextRequest } from "next/server";
import { prepareWritePayload, readJsonBody, requireWriteAccess, supabaseWrite } from "../q26-write";

export async function POST(request: NextRequest) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const body = await readJsonBody(request);
  const prepared = prepareWritePayload(body, access.session, false, "movement");
  if (prepared.error) return prepared.error;

  return supabaseWrite("movimentos", "POST", prepared.payload);
}
