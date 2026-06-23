import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
import { writeAppSetting } from "../../../app-settings";
import { getSession } from "../../../auth";

function parseAmount(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const normalized = value.trim().replace(/\s/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    return Number(normalized.replace(/\./g, "").replace(",", "."));
  }
  if (normalized.includes(",")) return Number(normalized.replace(",", "."));
  return Number(normalized);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ message: "Só Admin pode alterar este montante." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const amount = parseAmount(body.amount);
  const showProfitCard = typeof body.showProfitCard === "boolean" ? body.showProfitCard : true;

  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ message: "Indica um montante válido." }, { status: 400 });
  }

  try {
    await writeAppSetting("q25_balance", { amount, showProfitCard });
    await writeAuditLog({
      session,
      action: "Alterou montante Q25",
      resource: "app_settings",
      resourceId: "q25_balance",
      summary: `Montante Q25 atualizado para ${amount}`,
      details: { amount, showProfitCard }
    });
    return NextResponse.json({ message: "Montante Q25 atualizado." });
  } catch (error) {
    return NextResponse.json(
      {
        message: `Não consegui guardar no Supabase. Confirma se já correste o SQL de admin. ${
          error instanceof Error ? error.message : ""
        }`
      },
      { status: 500 }
    );
  }
}
