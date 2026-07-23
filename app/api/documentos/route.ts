import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../../audit-log";
import { getSession } from "../../auth";
import {
  createArchivedDocument,
  DocumentArchiveError,
  getArchivedDocumentSummaries,
  type ArchivedDocumentInput
} from "../../document-archive";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  try {
    return NextResponse.json({ documents: await getArchivedDocumentSummaries(session) });
  } catch (error) {
    if (error instanceof DocumentArchiveError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível carregar o arquivo." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as ArchivedDocumentInput;

  try {
    const document = await createArchivedDocument(session, body);
    await writeAuditLog({
      session,
      action: "Arquivou documento",
      resource: "document_archive",
      resourceId: document.id,
      summary: `Arquivou documento: ${document.title}`,
      details: {
        category: document.category,
        fileName: document.fileName,
        size: document.size
      }
    });

    return NextResponse.json({ message: "Documento arquivado.", document });
  } catch (error) {
    if (error instanceof DocumentArchiveError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível arquivar o documento." },
      { status: 500 }
    );
  }
}
