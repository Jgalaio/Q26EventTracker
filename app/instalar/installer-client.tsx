"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { InstallerStatus } from "../installer";

type InstallerClientProps = {
  initialStatus: InstallerStatus;
  installSql: string;
  sessionIsAdmin: boolean;
};

type InstallerForm = {
  confirmPassword: string;
  installerSecret: string;
  password: string;
  username: string;
};

const emptyForm: InstallerForm = {
  confirmPassword: "",
  installerSecret: "",
  password: "",
  username: ""
};

function StatusPill({ ok }: { ok: boolean }) {
  return <span className={ok ? "installer-status-pill ok" : "installer-status-pill error"}>{ok ? "OK" : "Falta"}</span>;
}

function CheckList({ checks }: { checks: InstallerStatus["envChecks"] }) {
  return (
    <div className="installer-check-list">
      {checks.map((item) => (
        <div className="installer-check-row" key={item.id}>
          <StatusPill ok={item.ok} />
          <div>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InstallerClient({ initialStatus, installSql, sessionIsAdmin }: InstallerClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [copied, setCopied] = useState(false);

  const missingEnv = useMemo(() => status.envChecks.filter((item) => !item.ok), [status.envChecks]);
  const missingDatabase = useMemo(() => status.databaseChecks.filter((item) => !item.ok), [status.databaseChecks]);
  const canCreateAdmin = status.schemaReady && (status.canBootstrap || sessionIsAdmin);

  async function refreshStatus() {
    setIsRefreshing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/installer/status", { cache: "no-store" });
      const body = (await response.json()) as { status?: InstallerStatus; message?: string };
      if (!response.ok || !body.status) throw new Error(body.message ?? "Não foi possível verificar.");
      setStatus(body.status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível verificar.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function copySql() {
    await navigator.clipboard.writeText(installSql);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function submitInstall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsInstalling(true);
    setMessage(null);
    try {
      const response = await fetch("/api/installer/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; status?: InstallerStatus };
      if (!response.ok) throw new Error(body.message ?? "Não foi possível concluir a instalação.");
      if (body.status) setStatus(body.status);
      setMessage(body.message ?? "Instalação concluída.");
      setForm(emptyForm);
      router.refresh();
      router.push("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a instalação.");
    } finally {
      setIsInstalling(false);
    }
  }

  function updateField(field: keyof InstallerForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="installer-grid" aria-label="Instalador">
      <article className="installer-panel">
        <div className="installer-panel-heading">
          <span className="installer-step">1</span>
          <div>
            <p className="eyebrow">Ambiente</p>
            <h2>Ligação ao projeto</h2>
          </div>
        </div>
        <CheckList checks={status.envChecks} />
      </article>

      <article className="installer-panel installer-sql-panel">
        <div className="installer-panel-heading">
          <span className="installer-step">2</span>
          <div>
            <p className="eyebrow">Base de dados</p>
            <h2>Schema limpo</h2>
          </div>
        </div>

        {status.databaseChecks.length ? <CheckList checks={status.databaseChecks} /> : null}

        {missingEnv.length ? (
          <p className="installer-warning">Completa as variáveis de ambiente antes de verificar a base de dados.</p>
        ) : missingDatabase.length ? (
          <p className="installer-warning">Corre o SQL abaixo no Supabase e volta a verificar.</p>
        ) : (
          <p className="installer-success">Schema pronto para criar o primeiro Admin.</p>
        )}

        <div className="installer-sql-actions">
          <button className="secondary-button" type="button" onClick={copySql}>
            {copied ? "Copiado" : "Copiar SQL"}
          </button>
          <a className="secondary-button" href="/api/installer/sql">
            Download SQL
          </a>
          <button className="secondary-button" disabled={isRefreshing} type="button" onClick={refreshStatus}>
            {isRefreshing ? "A verificar..." : "Verificar"}
          </button>
        </div>

        <textarea className="installer-sql-box" readOnly value={installSql} />
      </article>

      <article className="installer-panel">
        <div className="installer-panel-heading">
          <span className="installer-step">3</span>
          <div>
            <p className="eyebrow">Admin</p>
            <h2>Primeiro utilizador</h2>
          </div>
        </div>

        {status.installed ? (
          <div className="installer-success-card">
            <strong>Instalação ativa</strong>
            <span>{status.adminCount ?? 0} Admin encontrado(s).</span>
          </div>
        ) : (
          <form className="installer-form" onSubmit={submitInstall}>
            {!sessionIsAdmin ? (
              <label>
                Chave do instalador
                <input
                  autoComplete="off"
                  disabled={!status.schemaReady || isInstalling}
                  onChange={(event) => updateField("installerSecret", event.target.value)}
                  required
                  type="password"
                  value={form.installerSecret}
                />
              </label>
            ) : null}
            <label>
              Utilizador Admin
              <input
                autoComplete="username"
                disabled={!canCreateAdmin || isInstalling}
                onChange={(event) => updateField("username", event.target.value)}
                required
                value={form.username}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="new-password"
                disabled={!canCreateAdmin || isInstalling}
                minLength={6}
                onChange={(event) => updateField("password", event.target.value)}
                required
                type="password"
                value={form.password}
              />
            </label>
            <label>
              Confirmar password
              <input
                autoComplete="new-password"
                disabled={!canCreateAdmin || isInstalling}
                minLength={6}
                onChange={(event) => updateField("confirmPassword", event.target.value)}
                required
                type="password"
                value={form.confirmPassword}
              />
            </label>
            <button disabled={!canCreateAdmin || isInstalling} type="submit">
              {isInstalling ? "A instalar..." : "Criar Admin e entrar"}
            </button>
          </form>
        )}

        {message ? <p className="form-message">{message}</p> : null}
      </article>
    </section>
  );
}
