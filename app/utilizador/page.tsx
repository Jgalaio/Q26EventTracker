import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getUserAuditLogs } from "../audit-log";
import { getSession } from "../auth";
import { canUnlockClosedEvents, canViewClosedEvents } from "../auth-types";
import { getClosedEvents } from "../supabase-data";
import { TopbarActions } from "../topbar-actions";
import { TopbarBrand } from "../topbar-brand";
import { getUserQuickNotes } from "../user-quick-notes";
import { UserClient } from "./user-client";

export default async function UserPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/utilizador");

  const mayUnlockClosedEvents = canUnlockClosedEvents(session);
  const mayViewClosedEvents = canViewClosedEvents(session) || mayUnlockClosedEvents;
  const [appLogo, audit, quickNotes, closedEvents] = await Promise.all([
    getAppLogo(),
    getUserAuditLogs(session.username, 40),
    getUserQuickNotes(session.username),
    mayViewClosedEvents ? getClosedEvents() : Promise.resolve({ data: [], error: null })
  ]);

  return (
    <main className="shell user-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Utilizador" />
        <TopbarActions active="utilizador" session={session} />
      </section>

      <UserClient
        auditError={audit.error}
        auditLogs={audit.logs}
        canUnlockClosedEvents={mayUnlockClosedEvents}
        closedEvents={mayViewClosedEvents ? closedEvents.data : null}
        closedEventsError={mayViewClosedEvents ? closedEvents.error : null}
        quickNotes={quickNotes}
        session={session}
      />
    </main>
  );
}
