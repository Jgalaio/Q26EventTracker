import { redirect } from "next/navigation";
import { getSession } from "../auth";
import { canWrite } from "../auth-types";
import { getTesourariaData } from "../supabase-data";
import { FacturacaoClient } from "./facturacao-client";

export default async function FacturacaoPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/facturacao");
  if (!canWrite(session.role)) redirect("/overview");

  const { eventos, movimentos, error } = await getTesourariaData();

  return <FacturacaoClient error={error} eventos={eventos} movimentos={movimentos} session={session} />;
}
