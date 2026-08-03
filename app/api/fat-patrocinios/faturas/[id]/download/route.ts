import { NextResponse } from "next/server";
import { getSession } from "../../../../../auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type InvoiceFile = {
  fileName: string;
  dataUrl: string;
  contentType?: string;
  size?: number;
};

type MovementRow = {
  raw: Record<string, unknown> | null;
};

function endpoint(resource: string) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`;
}

function isInvoiceFile(value: unknown): value is InvoiceFile {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as InvoiceFile).fileName === "string" &&
    typeof (value as InvoiceFile).dataUrl === "string"
  );
}

function invoiceFileFromRaw(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return null;
  if (isInvoiceFile(raw.fatura_patrocinio)) return raw.fatura_patrocinio;
  if (isInvoiceFile(raw.ficheiro_fatura_patrocinio)) return raw.ficheiro_fatura_patrocinio;
  return null;
}

function bufferFromDataUrl(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return Buffer.from("");
  return Buffer.from(dataUrl.slice(commaIndex + 1), "base64");
}

function contentDisposition(fileName: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  if (session.role !== "admin" && !session.permissions.uploadViewInvoiceFiles) {
    return NextResponse.json({ message: "Sem permissão para consultar ficheiros de faturas." }, { status: 403 });
  }

  const { id } = await context.params;
  const response = await fetch(`${endpoint("movimentos")}?id=eq.${encodeURIComponent(id)}&select=raw&limit=1`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return NextResponse.json({ message: "Não foi possível carregar a fatura." }, { status: response.status });
  }

  const rows = (await response.json().catch(() => [])) as MovementRow[];
  const invoiceFile = invoiceFileFromRaw(rows[0]?.raw);
  if (!invoiceFile) return NextResponse.json({ message: "Ficheiro não encontrado." }, { status: 404 });

  const fileBuffer = bufferFromDataUrl(invoiceFile.dataUrl);
  return new Response(fileBuffer, {
    headers: {
      "Content-Disposition": contentDisposition(invoiceFile.fileName),
      "Content-Length": String(invoiceFile.size ?? fileBuffer.length),
      "Content-Type": invoiceFile.contentType || "application/octet-stream"
    }
  });
}
