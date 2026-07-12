import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getSession } from "../auth";
import { isViewOnly } from "../auth-types";
import { getNotas } from "../supabase-data";
import { TopbarActions } from "../topbar-actions";
import { TopbarBrand } from "../topbar-brand";
import { NotesPageClient } from "./notas-client";

type NotesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function NotesPage({ searchParams }: NotesPageProps) {
  const session = await getSession();
  if (!session) redirect("/login?next=/notas");
  if (isViewOnly(session)) redirect("/overview");

  const params = searchParams ? await searchParams : {};
  const selectedNoteId = firstParam(params.nota);
  const [notes, appLogo] = await Promise.all([getNotas(200), getAppLogo()]);

  return (
    <main className="shell notes-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="TODO" />
        <TopbarActions active="notas" session={session} />
      </section>

      <NotesPageClient
        initialNotes={notes.data}
        initialSelectedId={selectedNoteId}
        notesError={notes.error}
        session={session}
      />
    </main>
  );
}
