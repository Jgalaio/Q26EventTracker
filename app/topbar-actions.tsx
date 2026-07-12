"use client";

import Link from "next/link";
import { canAccessAdmin, canViewTreasury, canWrite, type AuthSession } from "./auth-types";
import { NotesMenu } from "./notes-menu";

export type TopbarActive =
  | "inicio"
  | "tesouraria"
  | "pesquisa"
  | "reports"
  | "facturacao"
  | "fat-patrocinios"
  | "overview"
  | "admin"
  | "notas"
  | "a-pagar";

type TopbarActionsProps = {
  active: TopbarActive;
  pendingPaymentsCount?: number;
  session: AuthSession;
};

type NavigationItem = {
  key: TopbarActive;
  href: string;
  label: string;
  show: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export function TopbarActions({ active, pendingPaymentsCount = 0, session }: TopbarActionsProps) {
  const mayViewTreasury = canViewTreasury(session);
  const mayWrite = canWrite(session);
  const mayAccessAdmin = canAccessAdmin(session);
  const groups: NavigationGroup[] = [
    {
      label: "Principal",
      items: [
        { key: "inicio", href: "/", label: "Início", show: true },
        { key: "tesouraria", href: "/tesouraria", label: "Tesouraria", show: mayViewTreasury },
        { key: "overview", href: "/overview", label: "OverView", show: true }
      ]
    },
    {
      label: "Gestão",
      items: [
        { key: "pesquisa", href: "/pesquisa", label: "Pesquisa", show: mayViewTreasury },
        { key: "reports", href: "/reports", label: "Relatórios", show: mayViewTreasury },
        { key: "facturacao", href: "/facturacao", label: "Fat.Finanças", show: mayWrite },
        { key: "fat-patrocinios", href: "/fat-patrocinios", label: "Fat. Patrocínios", show: mayWrite }
      ]
    },
    {
      label: "Admin",
      items: [{ key: "admin", href: "/admin", label: "Admin", show: mayAccessAdmin }]
    }
  ];

  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.show) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="top-actions top-actions-organized">
      <div className="top-menu-cluster">
        <NotesMenu active={active === "notas"} session={session} />
        <nav aria-label="Menu principal" className="top-nav-groups">
          {visibleGroups.map((group) => (
            <div aria-label={group.label} className="top-nav-group" key={group.label}>
              {group.items.map((item) => {
                const isActive = active === item.key;
                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={isActive ? "top-nav-link active" : "top-nav-link"}
                    href={item.href}
                    key={item.key}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
      {pendingPaymentsCount > 0 && mayViewTreasury ? (
        <Link className="warning-nav-button top-warning-link" href="/a-pagar">
          Pagamentos em falta: {pendingPaymentsCount}
        </Link>
      ) : null}
      <div className="top-session">
        <div className="user-chip">
          <span>{session.username}</span>
          <strong>{session.roleLabel}</strong>
        </div>
        <form action="/api/logout" method="post">
          <button className="logout-button" type="submit">
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
