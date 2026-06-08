import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, listAuthUsers } from "../auth";
import { ROLE_LABELS } from "../auth-types";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "admin") redirect(session.role === "view" ? "/overview" : "/");

  const users = listAuthUsers();

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

      <section className="admin-grid" aria-label="Utilizadores">
        {users.map((user) => (
          <article className="admin-card" key={user.username}>
            <span>{ROLE_LABELS[user.role]}</span>
            <strong>{user.username}</strong>
            <p>
              {user.role === "admin"
                ? "Acesso total, incluindo apagar registos e painel Admin."
                : user.role === "operator"
                  ? "Pode adicionar e alterar. Alterações exigem justificação."
                  : "Pode apenas consultar o OverView."}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
