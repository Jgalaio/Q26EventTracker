"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { WhatsNewEntry } from "./whats-new";

type WhatsNewPopupProps = {
  release: WhatsNewEntry | null;
  username: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function formatReleaseDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : value;
}

export function WhatsNewPopup({ release, username }: WhatsNewPopupProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(Boolean(release));
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsOpen(Boolean(release));
    setMessage(null);
  }, [release?.id]);

  if (!release || !username || !isOpen || pathname === "/login") return null;

  const acknowledge = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/whats-new/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: release.id })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? `${response.status} ${response.statusText}`);
      setIsOpen(false);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível guardar a confirmação.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div aria-label="Novidades do programa" aria-modal="true" className="modal-backdrop whats-new-backdrop" role="dialog">
      <section className="modal whats-new-modal">
        <header className="whats-new-header">
          <div>
            <p className="eyebrow">O que há de novo</p>
            <h2>{release.title}</h2>
          </div>
          <span>{formatReleaseDate(release.date)}</span>
        </header>

        <p className="whats-new-summary">{release.summary}</p>

        <ul className="whats-new-list">
          {release.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {message ? <p className="form-message">{message}</p> : null}

        <footer className="modal-actions whats-new-actions">
          <button className="secondary-button" disabled={isSaving} onClick={() => setIsOpen(false)} type="button">
            Ver depois
          </button>
          <button disabled={isSaving} onClick={acknowledge} type="button">
            {isSaving ? "A guardar..." : "Entendi"}
          </button>
        </footer>
      </section>
    </div>
  );
}
