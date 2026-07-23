import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../audit-log";
import { getSession } from "../../../auth";
import { deleteArchivedDocument, DocumentArchiveError, getArchivedDocumentSummaries } from "../../../document-archive";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const { id } = await context.params;

  try {
    const document = await deleteArchivedDocument(session, id);
    await writeAuditLog({
      session,
      action: "Apagou documento arquivado",
      resource: "document_archive",
      resourceId: document.id,
      summary: `Apagou documento: ${document.title}`,
      details: {
        category: document.category,
        fileName: document.fileName,
        size: document.size
      }
    });

    return NextResponse.json({ message: "Documento apagado.", documents: await getArchivedDocumentSummaries(session) });
  } catch (error) {
    if (error instanceof DocumentArchiveError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível apagar o documento." },
      { status: 500 }
    );
  }
}
