import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getUserAuditLogs } from "../audit-log";
import { getSession } from "../auth";
import { TopbarActions } from "../topbar-actions";
import { TopbarBrand } from "../topbar-brand";
import { UserClient } from "./user-client";

export default async function UserPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/utilizador");

  const [appLogo, audit] = await Promise.all([getAppLogo(), getUserAuditLogs(session.username, 40)]);

  return (
    <main className="shell user-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Utilizador" />
        <TopbarActions active="utilizador" session={session} />
      </section>

      <UserClient auditError={audit.error} auditLogs={audit.logs} session={session} />
    </main>
  );
}
