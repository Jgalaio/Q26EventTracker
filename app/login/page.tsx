import { redirect } from "next/navigation";
import { getAppLogo, getReportLogo } from "../app-settings";
import { getSession } from "../auth";
import { isViewOnly } from "../auth-types";
import { getInstallerStatus } from "../installer";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function safeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  if (session) redirect(isViewOnly(session) ? "/overview" : "/");

  const params: Record<string, string | string[] | undefined> = searchParams ? await searchParams : {};
  const [appLogo, reportLogo, installerStatus] = await Promise.all([
    getAppLogo(),
    getReportLogo(),
    getInstallerStatus()
  ]);
  const loginLogo = appLogo ?? reportLogo;
  const next = safeNextPath(getSearchValue(params, "next"));
  const hasError = getSearchValue(params, "error") === "1";
  const hasExpiredSession = getSearchValue(params, "expired") === "1";

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <div className={loginLogo ? "login-logo-card custom-login-logo-card" : "login-logo-card"}>
            {loginLogo ? (
              <img alt="Logo Q26" src={loginLogo.dataUrl} />
            ) : (
              <>
                <span>Q26</span>
                <small>Pontével</small>
              </>
            )}
          </div>
          <h1>Login</h1>
        </div>

        {hasExpiredSession ? <p className="auth-error">Sessão expirada. Entra novamente.</p> : null}
        {hasError ? <p className="auth-error">Username ou password inválidos.</p> : null}

        <form action="/api/login" className="auth-form" method="post">
          <input name="next" type="hidden" value={next} />
          <label>
            Username
            <input autoComplete="username" name="username" required />
          </label>
          <label>
            Password
            <input autoComplete="current-password" name="password" required type="password" />
          </label>
          <button type="submit">Entrar</button>
        </form>
        {!installerStatus.installed ? (
          <a className="installer-login-link" href="/instalar">
            Instalar / configurar primeiro arranque
          </a>
        ) : null}
      </section>

      <section className="login-creator-panel" aria-label="Criadores">
        <p>Criado por J.Galaio e A.Lopes.</p>
        <img alt="Criado por J.Galaio e A.Lopes" src="/login-creators.png" />
      </section>
    </main>
  );
}
