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

function normalizeChoice(value: unknown, allowed: string[], fallback: string) {
  const text = normalizeText(value);
  return allowed.includes(text) ? text : fallback;
}

function normalizeDateTime(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const body = await readJsonBody(request);
  const titulo = normalizeText(body.titulo);
  const conteudo = normalizeText(body.conteudo);
  const justificacao = normalizeText(body.justification);
  const estado = normalizeChoice(body.estado, ["todo", "em_curso", "concluido", "cancelado"], "todo");
  const concluidoEm = estado === "concluido" ? normalizeDateTime(body.concluido_em) ?? new Date().toISOString() : null;

  if (!titulo) {
    return NextResponse.json({ message: "Indica o título da tarefa." }, { status: 400 });
  }

  const prepared = prepareWritePayload(
    {
      titulo,
      conteudo,
      tipo_tarefa: normalizeChoice(body.tipo_tarefa, ["task", "lembrete", "follow_up", "evento", "outro"], "task"),
      estado,
      prioridade: normalizeChoice(body.prioridade, ["baixa", "normal", "alta", "urgente"], "normal"),
      agendado_para: normalizeDateTime(body.agendado_para),
      prazo_para: normalizeDateTime(body.prazo_para),
      responsavel: normalizeText(body.responsavel) || null,
      categoria: normalizeText(body.categoria) || null,
      concluido_em: concluidoEm,
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
