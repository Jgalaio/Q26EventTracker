import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getSession } from "../auth";
import { canWrite } from "../auth-types";
import { getFaturacaoReports, getTesourariaData } from "../supabase-data";
import { FacturacaoClient } from "./facturacao-client";

export default async function FacturacaoPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/facturacao");
  if (!canWrite(session.role)) redirect("/overview");

  const [{ eventos, movimentos, error }, reports, appLogo] = await Promise.all([
    getTesourariaData(),
    getFaturacaoReports(),
    getAppLogo()
  ]);

  return (
    <FacturacaoClient
      appLogo={appLogo}
      error={error}
      eventos={eventos}
      movimentos={movimentos}
      reports={reports.data}
      reportsError={reports.error}
      session={session}
    />
  );
}
