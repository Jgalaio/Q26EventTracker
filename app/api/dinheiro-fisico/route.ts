import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../audit-log";
import { writeAppSetting } from "../../app-settings";
import { requireWriteAccess } from "../q26-write";

function parseAmount(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;

  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return Number.NaN;
  if (normalized.includes(",") && normalized.includes(".")) {
    return Number(normalized.replace(/\./g, "").replace(",", "."));
  }
  if (normalized.includes(",")) return Number(normalized.replace(",", "."));
  return Number(normalized);
}

export async function POST(request: NextRequest) {
  const access = await requireWriteAccess();
  if (access.error) return access.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const amount = parseAmount(body.amount);

  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ message: "Indica um valor válido para o dinheiro físico contado." }, { status: 400 });
  }

  try {
    await writeAppSetting("physical_cash_count", { amount });
    await writeAuditLog({
      session: access.session,
      action: "Atualizou dinheiro físico contado",
      resource: "app_settings",
      resourceId: "physical_cash_count",
      summary: `Dinheiro físico contado atualizado para ${amount}`,
      details: { amount }
    });
    return NextResponse.json({ amount, message: "Dinheiro físico contado atualizado." });
  } catch (error) {
    return NextResponse.json(
      {
        message: `Não consegui guardar no Supabase. ${
          error instanceof Error ? error.message : "Confirma se a tabela app_settings está criada."
        }`
      },
      { status: 500 }
    );
  }
}
