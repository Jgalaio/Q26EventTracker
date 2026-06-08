import { redirect } from "next/navigation";
import { getReportLogo } from "../app-settings";
import { getSession } from "../auth";
import { canWrite } from "../auth-types";
import { getTesourariaData } from "../supabase-data";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/reports");
  if (!canWrite(session.role)) redirect("/overview");

  const [{ eventos, movimentos, error }, reportLogo] = await Promise.all([getTesourariaData(), getReportLogo()]);

  return (
    <ReportsClient
      error={error}
      eventos={eventos}
      generatedAt={new Date().toISOString()}
      movimentos={movimentos}
      reportLogo={reportLogo}
      session={session}
    />
  );
}
