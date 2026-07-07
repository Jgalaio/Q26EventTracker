import { redirect } from "next/navigation";
import { getAppFavicon, getAppLogo, getQ25Settings, getReportLogo } from "../app-settings";
import { getAuditLogs } from "../audit-log";
import { getSession, listAuthUsers } from "../auth";
import { getClosedEvents } from "../supabase-data";
import { TopbarActions } from "../topbar-actions";
import { TopbarBrand } from "../topbar-brand";
import { AdminClient } from "./admin-client";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parseLogPage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(page) && page > 0 ? page : 0;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "admin") redirect(session.role === "view" ? "/overview" : "/");

  const params = searchParams ? await searchParams : {};
  const auditPage = parseLogPage(params.logPage);
  const [users, reportLogo, appFavicon, appLogo, q25Settings, audit, closedEvents] = await Promise.all([
    listAuthUsers(),
    getReportLogo(),
    getAppFavicon(),
    getAppLogo(),
    getQ25Settings(),
    getAuditLogs(auditPage, 50),
    getClosedEvents()
  ]);

  return (
    <main className="shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Admin" />
        <TopbarActions active="admin" session={session} />
      </section>

      <AdminClient
        auditHasNext={audit.hasNext}
        auditLogError={audit.error}
        auditLogs={audit.logs}
        auditPage={auditPage}
        appFavicon={appFavicon}
        appLogo={appLogo}
        closedEvents={closedEvents.data}
        closedEventsError={closedEvents.error}
        q25Balance={q25Settings.amount}
        q25ProfitCardEnabled={q25Settings.showProfitCard}
        reportLogo={reportLogo}
        session={session}
        users={users}
      />
    </main>
  );
}
