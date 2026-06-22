import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppFavicon, getAppLogo, getQ25Balance, getReportLogo } from "../app-settings";
import { getAuditLogs } from "../audit-log";
import { getSession, listAuthUsers } from "../auth";
import { NotesMenu } from "../notes-menu";
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
  const [users, reportLogo, appFavicon, appLogo, q25Balance, audit] = await Promise.all([
    listAuthUsers(),
    getReportLogo(),
    getAppFavicon(),
    getAppLogo(),
    getQ25Balance(),
    getAuditLogs(auditPage, 50)
  ]);

  return (
    <main className="shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Admin" />
        <div className="top-actions">
          <NotesMenu role={session.role} />
          <Link className="nav-button" href="/">
            Tesouraria
          </Link>
          <Link className="nav-button secondary-nav-button" href="/reports">
            Relatórios
          </Link>
          <Link className="nav-button secondary-nav-button" href="/facturacao">
            Fat.Finanças
          </Link>
          <Link className="nav-button secondary-nav-button" href="/fat-patrocinios">
            Fat. Patrocínios
          </Link>
          <Link className="nav-button secondary-nav-button" href="/overview">
            OverView
          </Link>
          <form action="/api/logout" method="post">
            <button className="logout-button" type="submit">
              Sair
            </button>
          </form>
        </div>
      </section>

      <AdminClient
        auditHasNext={audit.hasNext}
        auditLogError={audit.error}
        auditLogs={audit.logs}
        auditPage={auditPage}
        appFavicon={appFavicon}
        appLogo={appLogo}
        q25Balance={q25Balance}
        reportLogo={reportLogo}
        session={session}
        users={users}
      />
    </main>
  );
}
