"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { InternalNotificationsPayload } from "./internal-notifications";

const emptyPayload: InternalNotificationsPayload = {
  total: 0,
  items: []
};

async function requestNotifications() {
  const response = await fetch("/api/notifications", { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as InternalNotificationsPayload;
}

function badgeLabel(total: number) {
  return total > 99 ? "99+" : String(total);
}

export function NotificationsMenu() {
  const [payload, setPayload] = useState<InternalNotificationsPayload>(emptyPayload);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadNotifications = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      setPayload(await requestNotifications());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar os alertas.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const toggleMenu = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) await loadNotifications();
  };

  return (
    <div className="notifications-menu">
      <button
        aria-expanded={isOpen}
        className={payload.total > 0 ? "notifications-button has-alerts" : "notifications-button"}
        onClick={toggleMenu}
        type="button"
      >
        Alertas
        {payload.total > 0 ? <span>{badgeLabel(payload.total)}</span> : null}
      </button>
      {isOpen ? (
        <div className="notifications-dropdown" role="dialog" aria-label="Notificações internas">
          <div className="notifications-dropdown-header">
            <strong>Notificações</strong>
            <button disabled={isLoading} onClick={loadNotifications} type="button">
              Atualizar
            </button>
          </div>

          {isLoading && !payload.items.length ? <p className="notes-menu-info">A carregar alertas...</p> : null}
          {message ? <p className="notes-menu-error">{message}</p> : null}

          {!isLoading && !message && payload.items.length === 0 ? (
            <p className="notifications-empty">Sem alertas pendentes.</p>
          ) : null}

          <div className="notifications-list">
            {payload.items.map((item) => (
              <Link
                className={`notifications-row ${item.tone}`}
                href={item.href}
                key={item.id}
                onClick={() => setIsOpen(false)}
              >
                <span>{item.count}</span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
