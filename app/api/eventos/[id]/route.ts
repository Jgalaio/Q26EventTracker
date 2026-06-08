import { NextRequest } from "next/server";
import { prepareWritePayload, readJsonBody, requireDeleteAccess, requireWriteAccess, supabaseWrite } from "../../q26-write";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const { id } = await context.params;
  const body = await readJsonBody(request);
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
  return supabaseWrite(`eventos?id=eq.${encodeURIComponent(id)}`, "DELETE", undefined, access.session);
}
