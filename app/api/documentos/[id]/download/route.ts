import { NextResponse } from "next/server";
import { getSession } from "../../../../auth";
import { DocumentArchiveError, getArchivedDocumentFile } from "../../../../document-archive";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function bufferFromDataUrl(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return Buffer.from("");
  return Buffer.from(dataUrl.slice(commaIndex + 1), "base64");
}

function contentDisposition(fileName: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  const { id } = await context.params;

  try {
    const document = await getArchivedDocumentFile(session, id);
    return new Response(bufferFromDataUrl(document.dataUrl), {
      headers: {
        "Content-Disposition": contentDisposition(document.fileName),
        "Content-Length": String(document.size),
        "Content-Type": document.mimeType || "application/octet-stream"
      }
    });
  } catch (error) {
    if (error instanceof DocumentArchiveError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Não foi possível descarregar o documento." },
      { status: 500 }
    );
  }
}
