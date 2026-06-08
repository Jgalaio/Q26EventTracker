"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { ReportLogo } from "../app-settings";
import { ROLE_LABELS, type AuthSession } from "../auth-types";

type AdminUser = {
  username: string;
  role: AuthSession["role"];
};

type AdminClientProps = {
  session: AuthSession;
  users: AdminUser[];
  reportLogo: ReportLogo | null;
  q25Balance: number;
};

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const emptyPasswordForm: PasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
};

export function AdminClient({ session, users, reportLogo, q25Balance }: AdminClientProps) {
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [q25Message, setQ25Message] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState(reportLogo?.dataUrl ?? "");
  const [logoFileName, setLogoFileName] = useState(reportLogo?.fileName ?? "");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [q25Amount, setQ25Amount] = useState(String(q25Balance).replace(".", ","));
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [isSavingQ25, setIsSavingQ25] = useState(false);

  const updatePasswordField = (field: keyof PasswordForm, value: string) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingPassword(true);
    setPasswordMessage(null);

    try {
      const response = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordForm)
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível alterar a password.");
      setPasswordForm(emptyPasswordForm);
      setPasswordMessage(body?.message ?? "Password alterada com sucesso.");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Não foi possível alterar a password.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLogoMessage("Escolhe um ficheiro de imagem.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setLogoPreview(value);
      setLogoDataUrl(value);
      setLogoFileName(file.name);
      setLogoMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!logoDataUrl) {
      setLogoMessage("Escolhe primeiro uma imagem.");
      return;
    }

    setIsSavingLogo(true);
    setLogoMessage(null);
    try {
      const response = await fetch("/api/admin/report-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: logoDataUrl, fileName: logoFileName })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível guardar o logo.");
      setLogoDataUrl("");
      setLogoMessage(body?.message ?? "Logo atualizado.");
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "Não foi possível guardar o logo.");
    } finally {
      setIsSavingLogo(false);
    }
  };

  const removeLogo = async () => {
    setIsSavingLogo(true);
    setLogoMessage(null);
    try {
      const response = await fetch("/api/admin/report-logo", { method: "DELETE" });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível remover o logo.");
      setLogoPreview("");
      setLogoDataUrl("");
      setLogoFileName("");
      setLogoMessage(body?.message ?? "Logo removido.");
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "Não foi possível remover o logo.");
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleQ25Submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingQ25(true);
    setQ25Message(null);

    try {
      const response = await fetch("/api/admin/q25-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: q25Amount })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível guardar o montante.");
      setQ25Message(body?.message ?? "Montante Q25 atualizado.");
    } catch (error) {
      setQ25Message(error instanceof Error ? error.message : "Não foi possível guardar o montante.");
    } finally {
      setIsSavingQ25(false);
    }
  };

  return (
    <>
      <section className="admin-settings-grid" aria-label="Definições do admin">
        <form className="admin-settings-card" onSubmit={handlePasswordSubmit}>
          <div>
            <p className="eyebrow">Segurança</p>
            <h2>Alterar a minha password</h2>
          </div>
          <label>
            Utilizador
            <input readOnly value={session.username} />
          </label>
          <label>
            Password atual
            <input
              required
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) => updatePasswordField("currentPassword", event.target.value)}
            />
          </label>
          <label>
            Nova password
            <input
              minLength={6}
              required
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) => updatePasswordField("newPassword", event.target.value)}
            />
          </label>
          <label>
            Confirmar nova password
            <input
              minLength={6}
              required
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) => updatePasswordField("confirmPassword", event.target.value)}
            />
          </label>
          {passwordMessage ? <p className="form-message">{passwordMessage}</p> : null}
          <button disabled={isSavingPassword} type="submit">
            {isSavingPassword ? "A guardar..." : "Guardar password"}
          </button>
        </form>

        <form className="admin-settings-card" onSubmit={handleLogoSubmit}>
          <div>
            <p className="eyebrow">Relatório</p>
            <h2>Alterar logo do relatório</h2>
          </div>
          <div className="logo-preview-box">
            {logoPreview ? <img alt="Logo atual do relatório" src={logoPreview} /> : <span>Q26</span>}
          </div>
          <label>
            Imagem
            <input accept="image/*" type="file" onChange={handleLogoChange} />
          </label>
          {logoFileName ? <p className="admin-file-name">{logoFileName}</p> : null}
          {logoMessage ? <p className="form-message">{logoMessage}</p> : null}
          <div className="admin-inline-actions">
            <button disabled={isSavingLogo || !logoDataUrl} type="submit">
              {isSavingLogo ? "A guardar..." : "Guardar logo"}
            </button>
            <button className="secondary-button" disabled={isSavingLogo || !logoPreview} type="button" onClick={removeLogo}>
              Remover
            </button>
          </div>
        </form>

        <form className="admin-settings-card" onSubmit={handleQ25Submit}>
          <div>
            <p className="eyebrow">Totais</p>
            <h2>Montante deixado pelos Q25</h2>
          </div>
          <label>
            Montante
            <input
              inputMode="decimal"
              placeholder="0,00"
              value={q25Amount}
              onChange={(event) => setQ25Amount(event.target.value)}
            />
          </label>
          {q25Message ? <p className="form-message">{q25Message}</p> : null}
          <button disabled={isSavingQ25} type="submit">
            {isSavingQ25 ? "A guardar..." : "Guardar montante"}
          </button>
        </form>
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
    </>
  );
}
