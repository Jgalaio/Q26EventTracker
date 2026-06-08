import Link from "next/link";
import { redirect } from "next/navigation";
import { getQ25Balance, getReportLogo } from "../app-settings";
import { getSession, listAuthUsers } from "../auth";
import { AdminClient } from "./admin-client";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "admin") redirect(session.role === "view" ? "/overview" : "/");

  const [users, reportLogo, q25Balance] = await Promise.all([listAuthUsers(), getReportLogo(), getQ25Balance()]);

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Q26</p>
          <h1>Admin</h1>
        </div>
        <div className="top-actions">
          <Link className="nav-button" href="/">
            Tesouraria
          </Link>
          <Link className="nav-button secondary-nav-button" href="/reports">
            Relatórios
          </Link>
          <Link className="nav-button secondary-nav-button" href="/facturacao">
            Facturação
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

      <AdminClient q25Balance={q25Balance} reportLogo={reportLogo} session={session} users={users} />
    </main>
  );
}
