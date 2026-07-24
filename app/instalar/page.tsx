import Link from "next/link";
import { getSession } from "../auth";
import { getInstallerSql, getInstallerStatus } from "../installer";
import { InstallerClient } from "./installer-client";

export default async function InstallerPage() {
  const [session, status, installSql] = await Promise.all([getSession(), getInstallerStatus(), getInstallerSql()]);
  const installerClosed = status.installed && session?.role !== "admin";

  return (
    <main className="shell installer-shell">
      <section className="installer-hero">
        <div>
          <p className="eyebrow">First run</p>
          <h1>Instalador Q26</h1>
        </div>
        <Link className="secondary-button" href={session ? "/" : "/login"}>
          {session ? "Voltar ao painel" : "Voltar ao login"}
        </Link>
      </section>

      {installerClosed ? (
        <section className="installer-panel installer-closed-panel">
          <p className="eyebrow">Protegido</p>
          <h2>Instalador fechado</h2>
          <p>Já existe pelo menos um Admin nesta instalação. Entra como Admin para rever este módulo.</p>
        </section>
      ) : (
        <InstallerClient initialStatus={status} installSql={installSql} sessionIsAdmin={session?.role === "admin"} />
      )}
    </main>
  );
}
