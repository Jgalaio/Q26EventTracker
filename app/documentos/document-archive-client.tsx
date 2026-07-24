"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { canDeleteDocuments, canDownloadDocuments, canUploadDocuments, type AuthSession } from "../auth-types";
import type { ArchivedDocumentSummary, DocumentCategory } from "../document-archive";
import { eventDisplayName } from "../payment-labels";
import type { EventoResumo } from "../supabase-data";

type DocumentArchiveClientProps = {
  events: EventoResumo[];
  initialDocuments: ArchivedDocumentSummary[];
  session: AuthSession;
};

type DocumentResponse = {
  message?: string;
  document?: ArchivedDocumentSummary;
  documents?: ArchivedDocumentSummary[];
};

type CategoryFilter = DocumentCategory | "todos";

const MAX_DOCUMENT_BYTES = 4_000_000;

const categoryOptions: Array<{ value: DocumentCategory; label: string }> = [
  { value: "atas", label: "Atas" },
  { value: "faturas", label: "Faturas" },
  { value: "contratos", label: "Contratos" },
  { value: "recibos", label: "Recibos" },
  { value: "licencas", label: "Licenças" },
  { value: "imagens", label: "Imagens" },
  { value: "outro", label: "Outro" }
];

const acceptedFiles = ".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function categoryLabel(category: DocumentCategory) {
  return categoryOptions.find((option) => option.value === category)?.label ?? category;
}

function formatDate(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function formatBytes(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} MB`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} KB`;
  return `${value} B`;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function documentHaystack(document: ArchivedDocumentSummary) {
  return normalizeText(
    [
      document.title,
      document.description,
      document.fileName,
      document.category,
      categoryLabel(document.category),
      document.eventSlug,
      document.eventName,
      document.createdBy,
      document.tags.join(" ")
    ].join(" ")
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o ficheiro."));
    reader.readAsDataURL(file);
  });
}

function replaceDocument(documents: ArchivedDocumentSummary[], document: ArchivedDocumentSummary) {
  const next = documents.filter((candidate) => candidate.id !== document.id);
  return [document, ...next].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function sortEventsByDate(events: EventoResumo[]) {
  return [...events].sort((left, right) => {
    const leftTime = left.data_inicio ? new Date(`${left.data_inicio}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
    const rightTime = right.data_inicio ? new Date(`${right.data_inicio}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
    return leftTime - rightTime || left.nome.localeCompare(right.nome);
  });
}

export function DocumentArchiveClient({ events, initialDocuments, session }: DocumentArchiveClientProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("outro");
  const [selectedEventSlug, setSelectedEventSlug] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("todos");
  const [focusedDocumentId] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("documento") ?? ""
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mayUpload = canUploadDocuments(session);
  const mayDownload = canDownloadDocuments(session);
  const mayDelete = canDeleteDocuments(session);
  const eventOptions = useMemo(() => sortEventsByDate(events), [events]);
  const selectedEvent = eventOptions.find((event) => event.slug === selectedEventSlug) ?? null;
  const totalSize = documents.reduce((total, document) => total + document.size, 0);
  const filteredDocuments = useMemo(() => {
    const tokens = normalizeText(query).split(" ").filter(Boolean);
    return documents.filter((document) => {
      if (categoryFilter !== "todos" && document.category !== categoryFilter) return false;
      if (!tokens.length) return true;
      const haystack = documentHaystack(document);
      return tokens.every((token) => haystack.includes(token));
    });
  }, [categoryFilter, documents, query]);

  const saveDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0] ?? null;
    if (!file) {
      setMessage("Escolhe o ficheiro a arquivar.");
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setMessage("O ficheiro não pode ter mais de 4 MB.");
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await fetch("/api/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          description,
          tags,
          eventId: category === "faturas" ? selectedEvent?.id ?? null : null,
          eventSlug: category === "faturas" ? selectedEvent?.slug ?? null : null,
          eventName: category === "faturas" ? selectedEvent?.nome ?? null : null,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          dataUrl
        })
      });
      const body = (await response.json().catch(() => ({}))) as DocumentResponse;
      if (!response.ok || !body.document) throw new Error(body.message ?? `${response.status} ${response.statusText}`);

      setDocuments((current) => replaceDocument(current, body.document as ArchivedDocumentSummary));
      setTitle("");
      setCategory("outro");
      setSelectedEventSlug("");
      setDescription("");
      setTags("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("Documento arquivado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível arquivar o documento.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDocument = async (document: ArchivedDocumentSummary) => {
    if (!window.confirm(`Apagar o documento "${document.title}"?`)) return;

    setDeletingId(document.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/documentos/${encodeURIComponent(document.id)}`, { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as DocumentResponse;
      if (!response.ok) throw new Error(body.message ?? `${response.status} ${response.statusText}`);
      setDocuments(body.documents ?? documents.filter((candidate) => candidate.id !== document.id));
      setMessage("Documento apagado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível apagar o documento.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="document-archive-grid">
      <aside className="document-panel document-upload-panel">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Arquivo</p>
            <h2>Novo documento</h2>
          </div>
          <span>{mayUpload ? "Upload ativo" : "Só consulta"}</span>
        </div>

        <form className="document-form" onSubmit={saveDocument}>
          <label>
            Nome do documento
            <input
              disabled={!mayUpload || isSaving}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex: Recibo da Câmara"
              value={title}
            />
          </label>
          <label>
            Categoria
            <select
              disabled={!mayUpload || isSaving}
              onChange={(event) => {
                const nextCategory = event.target.value as DocumentCategory;
                setCategory(nextCategory);
                if (nextCategory !== "faturas") setSelectedEventSlug("");
              }}
              value={category}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {category === "faturas" ? (
            <label>
              Evento associado
              <select
                disabled={!mayUpload || isSaving || eventOptions.length === 0}
                onChange={(event) => setSelectedEventSlug(event.target.value)}
                value={selectedEventSlug}
              >
                <option value="">Sem evento associado</option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.slug}>
                    {eventDisplayName(event)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Descrição
            <textarea
              disabled={!mayUpload || isSaving}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Notas rápidas sobre o documento..."
              rows={4}
              value={description}
            />
          </label>
          <label>
            Etiquetas
            <input
              disabled={!mayUpload || isSaving}
              onChange={(event) => setTags(event.target.value)}
              placeholder="recibo, festa, licença"
              value={tags}
            />
          </label>
          <label>
            Ficheiro
            <input disabled={!mayUpload || isSaving} ref={fileInputRef} type="file" accept={acceptedFiles} />
          </label>
          <small className="document-upload-hint">PDF, imagens, Word, Excel, PowerPoint, texto ou CSV até 4 MB.</small>
          <button className="primary-action" disabled={!mayUpload || isSaving} type="submit">
            {isSaving ? "A arquivar..." : "Arquivar documento"}
          </button>
        </form>
        {message ? <p className="form-message">{message}</p> : null}
      </aside>

      <section className="document-panel document-list-panel">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Documentos</p>
            <h2>{filteredDocuments.length} no arquivo</h2>
          </div>
          <span>{formatBytes(totalSize)} guardados</span>
        </div>

        <div className="document-stats">
          <span>{documents.length} documentos</span>
          <span>{categoryOptions.filter((option) => documents.some((document) => document.category === option.value)).length} categorias</span>
          <span>{formatBytes(totalSize)}</span>
        </div>

        <div className="document-filters">
          <label>
            Pesquisa
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, descrição, ficheiro, etiqueta..."
              type="search"
              value={query}
            />
          </label>
          <label>
            Categoria
            <select onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)} value={categoryFilter}>
              <option value="todos">Todas</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredDocuments.length ? (
          <div className="document-card-grid">
            {filteredDocuments.map((document) => (
              <article className={document.id === focusedDocumentId ? "document-card active" : "document-card"} key={document.id}>
                <header>
                  <span className={`document-category ${document.category}`}>{categoryLabel(document.category)}</span>
                  <small>{formatBytes(document.size)}</small>
                </header>
                <strong>{document.title}</strong>
                <p>{document.description || "Sem descrição."}</p>
                <dl>
                  <div>
                    <dt>Ficheiro</dt>
                    <dd>{document.fileName}</dd>
                  </div>
                  <div>
                    <dt>Arquivado por</dt>
                    <dd>{document.createdBy}</dd>
                  </div>
                  {document.category === "faturas" ? (
                    <div>
                      <dt>Evento</dt>
                      <dd>{document.eventName || "Sem evento associado"}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Data</dt>
                    <dd>{formatDate(document.createdAt)}</dd>
                  </div>
                </dl>
                {document.tags.length ? (
                  <div className="document-tags">
                    {document.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
                <div className="document-actions">
                  {mayDownload ? (
                    <a href={`/api/documentos/${encodeURIComponent(document.id)}/download`}>Download</a>
                  ) : (
                    <span>Sem download</span>
                  )}
                  {mayDelete ? (
                    <button disabled={deletingId === document.id} onClick={() => deleteDocument(document)} type="button">
                      {deletingId === document.id ? "A apagar..." : "Apagar"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="document-empty">
            <strong>{documents.length ? "Sem documentos para estes filtros." : "Ainda não existem documentos arquivados."}</strong>
            <span>Quando adicionares recibos, atas ou ficheiros importantes, ficam disponíveis aqui.</span>
          </div>
        )}
      </section>
    </section>
  );
}
