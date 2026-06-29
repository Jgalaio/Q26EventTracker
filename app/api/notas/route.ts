import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../auth";
import { getNotas } from "../../supabase-data";
import { prepareWritePayload, readJsonBody, requireWriteAccess, supabaseWrite } from "../q26-write";

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

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "5", 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(200, Math.max(1, parsed));
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Sessão expirada. Entra novamente." }, { status: 401 });
  }

  const notes = await getNotas(parseLimit(request.nextUrl.searchParams.get("limit")));
  if (notes.error) {
    return NextResponse.json({ message: notes.error }, { status: 500 });
  }

  return NextResponse.json(notes.data);
}

export async function POST(request: NextRequest) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const body = await readJsonBody(request);
  const titulo = normalizeText(body.titulo);
  const conteudo = normalizeText(body.conteudo);
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
      created_by: access.session.username,
      updated_by: access.session.username
    },
    access.session,
    false,
    "note"
  );
  if (prepared.error) return prepared.error;

  return supabaseWrite("notas", "POST", prepared.payload, access.session);
}
