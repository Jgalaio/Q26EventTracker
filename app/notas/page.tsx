import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getSession } from "../auth";
import { ROLE_LABELS, canAccessAdmin, canWrite } from "../auth-types";
import { NotesMenu } from "../notes-menu";
import { getNotas } from "../supabase-data";
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

  const params = searchParams ? await searchParams : {};
  const selectedNoteId = firstParam(params.nota);
  const [notes, appLogo] = await Promise.all([getNotas(200), getAppLogo()]);

  return (
    <main className="shell notes-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Notas" />
        <div className="top-actions">
          <NotesMenu role={session.role} />
          {canAccessAdmin(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/admin">
              Admin
            </Link>
          ) : null}
          {canWrite(session.role) ? (
            <Link className="nav-button" href="/">
              Tesouraria
            </Link>
          ) : null}
          {canWrite(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/reports">
              Relatórios
            </Link>
          ) : null}
          {canWrite(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/facturacao">
              Fat.Finanças
            </Link>
          ) : null}
          {canWrite(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/fat-patrocinios">
              Fat. Patrocínios
            </Link>
          ) : null}
          <Link className="nav-button secondary-nav-button" href="/overview">
            OverView
          </Link>
          <div className="user-chip">
            <span>{session.username}</span>
            <strong>{ROLE_LABELS[session.role]}</strong>
          </div>
          <form action="/api/logout" method="post">
            <button className="logout-button" type="submit">
              Sair
            </button>
          </form>
        </div>
      </section>

      <NotesPageClient
        initialNotes={notes.data}
        initialSelectedId={selectedNoteId}
        notesError={notes.error}
        role={session.role}
      />
    </main>
  );
}
