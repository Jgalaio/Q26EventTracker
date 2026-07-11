import { redirect } from "next/navigation";
import { getAppLogo, getQ25Balance, getReportLogo } from "../app-settings";
import { getSession } from "../auth";
import { canWrite } from "../auth-types";
import { getTesourariaData } from "../supabase-data";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/reports");
  if (!canWrite(session.role)) redirect("/overview");

  const [{ eventos, movimentos, error }, reportLogo, appLogo, q25Balance] = await Promise.all([
    getTesourariaData(),
    getReportLogo(),
    getAppLogo(),
    getQ25Balance()
  ]);

  return (
    <ReportsClient
      error={error}
      eventos={eventos}
      generatedAt={new Date().toISOString()}
      appLogo={appLogo}
      movimentos={movimentos}
      q25Balance={q25Balance}
      reportLogo={reportLogo}
      session={session}
    />
  );
}
