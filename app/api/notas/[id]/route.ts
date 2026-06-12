import { NextRequest, NextResponse } from "next/server";
import {
  prepareWritePayload,
  readJsonBody,
  requireDeleteAccess,
  requireWriteAccess,
  supabaseWrite
} from "../../q26-write";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const body = await readJsonBody(request);
  const titulo = normalizeText(body.titulo);
  const conteudo = normalizeText(body.conteudo);
  const justificacao = normalizeText(body.justification);

  if (!titulo) {
    return NextResponse.json({ message: "Indica o título da nota." }, { status: 400 });
  }

  const prepared = prepareWritePayload(
    {
      titulo,
      conteudo,
      updated_by: access.session.username,
      updated_at: new Date().toISOString(),
      justification: justificacao
    },
    access.session,
    true,
    "note"
  );
  if (prepared.error) return prepared.error;

  const { id } = await context.params;
  return supabaseWrite(
    `notas?id=eq.${encodeURIComponent(id)}`,
    "PATCH",
    prepared.payload,
    access.session,
    justificacao ? { justificacao } : undefined
  );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const deleteError = requireDeleteAccess(access.session);
  if (deleteError) return deleteError;

  const { id } = await context.params;
  return supabaseWrite(`notas?id=eq.${encodeURIComponent(id)}`, "DELETE", undefined, access.session);
}
