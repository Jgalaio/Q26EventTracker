"use client";

import type { MovimentoDetalhe } from "../supabase-data";
import type { OverviewRow } from "./overview-client";

type ExcelValue = string | number | null | undefined;

type ExcelCell = {
  value: ExcelValue;
  style?: number;
};

type ExcelRow = {
  cells: ExcelCell[];
  height?: number;
};

type ZipFile = {
  path: string;
  content: string;
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SHEET_COLUMNS = 8;
const CURRENCY_STYLE = 5;
const CURRENCY_GREEN_STYLE = 6;
const CURRENCY_RED_STYLE = 7;
const TEXT_STYLE = 8;
const LABEL_STYLE = 9;
const TABLE_HEADER_STYLE = 10;
const SECTION_STYLE = 11;
const INFO_STYLE = 12;
const TOTAL_STYLE = 13;
const WARNING_STYLE = 14;

const encoder = new TextEncoder();

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
})();

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value: unknown) {
  return stripAccents(String(value ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function rawNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function rawFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeText(value);
  return normalized === "sim" || normalized === "true" || normalized === "1";
}

function entryTypeLabel(movimento: MovimentoDetalhe) {
  const kind = normalizeText(movimento.raw?.tipo_entrada);
  if (kind === "patrocinio") return "Patrocínio";
  if (kind === "peditorio") return "Peditório";
  if (kind === "deposito") return "Depósito";
  return "Faturação";
}

function invoiceIssuedLabel(movimento: MovimentoDetalhe) {
  if (!rawFlag(movimento.raw?.patrocinio) && !rawFlag(movimento.raw?.precisa_fatura)) return "-";
  if (movimento.raw?.fatura_emitida === "nao_precisa") return "N. Precisa";
  return rawFlag(movimento.raw?.fatura_emitida) ? "Sim" : "Não";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function moneyStyle(value: number) {
  if (value > 0) return CURRENCY_GREEN_STYLE;
  if (value < 0) return CURRENCY_RED_STYLE;
  return CURRENCY_STYLE;
}

function movementAmount(movimento: MovimentoDetalhe) {
  return Number(movimento.montante ?? 0);
}

function compareMovements(a: MovimentoDetalhe, b: MovimentoDetalhe) {
  const aDate = a.data_pagamento ? new Date(`${a.data_pagamento}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
  const bDate = b.data_pagamento ? new Date(`${b.data_pagamento}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
  if (aDate !== bDate) return aDate - bDate;
  return a.item.localeCompare(b.item, "pt-PT");
}

function columnName(index: number) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function cellReference(rowIndex: number, columnIndex: number) {
  return `${columnName(columnIndex)}${rowIndex}`;
}

function pushRow(rows: ExcelRow[], cells: ExcelCell[], height?: number) {
  rows.push({ cells, height });
  return rows.length;
}

function pushMergedRow(rows: ExcelRow[], merges: string[], value: string, style: number, height?: number) {
  const rowIndex = pushRow(rows, [{ value, style }], height);
  merges.push(`A${rowIndex}:${columnName(SHEET_COLUMNS)}${rowIndex}`);
}

function blankRow(rows: ExcelRow[]) {
  pushRow(rows, []);
}

function sectionRow(rows: ExcelRow[], merges: string[], title: string) {
  pushMergedRow(rows, merges, title, SECTION_STYLE, 22);
}

function summaryRows(rows: ExcelRow[], row: OverviewRow) {
  pushRow(rows, [
    { value: "Entradas", style: LABEL_STYLE },
    { value: row.entradas, style: CURRENCY_GREEN_STYLE },
    { value: "Saídas", style: LABEL_STYLE },
    { value: row.saidas, style: CURRENCY_RED_STYLE },
    { value: "Lucro", style: LABEL_STYLE },
    { value: row.lucro, style: moneyStyle(row.lucro) },
    { value: "Pagamentos em falta", style: LABEL_STYLE },
    { value: row.aPagamento, style: row.aPagamento > 0 ? CURRENCY_RED_STYLE : CURRENCY_GREEN_STYLE }
  ]);
  pushRow(rows, [
    { value: "Faturado", style: LABEL_STYLE },
    { value: row.faturado, style: CURRENCY_STYLE },
    { value: "Não faturado", style: LABEL_STYLE },
    { value: row.naoFaturado, style: CURRENCY_STYLE },
    { value: "Pago Conta Bancaria", style: LABEL_STYLE },
    { value: row.pagoQ26, style: CURRENCY_STYLE },
    { value: "Transferências", style: LABEL_STYLE },
    { value: row.transferencias, style: CURRENCY_STYLE }
  ]);
}

function buildEntradaRows(rows: ExcelRow[], movimentos: MovimentoDetalhe[], total: number) {
  pushRow(rows, [
    { value: "Item", style: TABLE_HEADER_STYLE },
    { value: "Descrição", style: TABLE_HEADER_STYLE },
    { value: "Data", style: TABLE_HEADER_STYLE },
    { value: "Método", style: TABLE_HEADER_STYLE },
    { value: "Tipo", style: TABLE_HEADER_STYLE },
    { value: "Fatura emitida", style: TABLE_HEADER_STYLE },
    { value: "Montante", style: TABLE_HEADER_STYLE },
    { value: "Valor Fat.Finanças", style: TABLE_HEADER_STYLE }
  ]);

  if (!movimentos.length) {
    pushRow(rows, [{ value: "Sem entradas registadas neste evento.", style: INFO_STYLE }]);
    return;
  }

  movimentos.forEach((movimento) => {
    pushRow(rows, [
      { value: movimento.item, style: TEXT_STYLE },
      { value: movimento.descricao || "-", style: TEXT_STYLE },
      { value: formatDate(movimento.data_pagamento), style: TEXT_STYLE },
      { value: movimento.tipo_pagamento || "-", style: TEXT_STYLE },
      { value: entryTypeLabel(movimento), style: TEXT_STYLE },
      { value: invoiceIssuedLabel(movimento), style: TEXT_STYLE },
      { value: movementAmount(movimento), style: CURRENCY_STYLE },
      { value: rawNumber(movimento.raw?.valor_teorico), style: CURRENCY_STYLE }
    ]);
  });

  pushRow(rows, [
    { value: "Total entradas", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: total, style: TOTAL_STYLE },
    { value: movimentos.reduce((sum, movimento) => sum + rawNumber(movimento.raw?.valor_teorico), 0), style: TOTAL_STYLE }
  ]);
}

function buildSaidaRows(rows: ExcelRow[], movimentos: MovimentoDetalhe[], total: number) {
  pushRow(rows, [
    { value: "Item", style: TABLE_HEADER_STYLE },
    { value: "Descrição", style: TABLE_HEADER_STYLE },
    { value: "Data", style: TABLE_HEADER_STYLE },
    { value: "Pagamento", style: TABLE_HEADER_STYLE },
    { value: "Nº Fatura", style: TABLE_HEADER_STYLE },
    { value: "Fatura C/NIF", style: TABLE_HEADER_STYLE },
    { value: "Pago", style: TABLE_HEADER_STYLE },
    { value: "Montante", style: TABLE_HEADER_STYLE }
  ]);

  if (!movimentos.length) {
    pushRow(rows, [{ value: "Sem saídas registadas neste evento.", style: INFO_STYLE }]);
    return;
  }

  movimentos.forEach((movimento) => {
    const rowStyle = movimento.pago === false ? WARNING_STYLE : TEXT_STYLE;
    pushRow(rows, [
      { value: movimento.item, style: rowStyle },
      { value: movimento.descricao || "-", style: rowStyle },
      { value: formatDate(movimento.data_pagamento), style: rowStyle },
      { value: movimento.tipo_pagamento || "-", style: rowStyle },
      { value: movimento.numero_fatura || "-", style: rowStyle },
      {
        value: movimento.fatura_com_nif === null ? "-" : movimento.fatura_com_nif ? "Sim" : "Não",
        style: rowStyle
      },
      { value: movimento.pago === null ? "-" : movimento.pago ? "Sim" : "Não", style: rowStyle },
      { value: movementAmount(movimento), style: movimento.pago === false ? WARNING_STYLE : CURRENCY_STYLE }
    ]);
  });

  pushRow(rows, [
    { value: "Total saídas", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: total, style: TOTAL_STYLE }
  ]);
}

function buildLegacyPendingRows(rows: ExcelRow[], movimentos: MovimentoDetalhe[]) {
  pushRow(rows, [
    { value: "Item", style: TABLE_HEADER_STYLE },
    { value: "Descrição", style: TABLE_HEADER_STYLE },
    { value: "Data", style: TABLE_HEADER_STYLE },
    { value: "Pagamento", style: TABLE_HEADER_STYLE },
    { value: "Nº Fatura", style: TABLE_HEADER_STYLE },
    { value: "Fatura C/NIF", style: TABLE_HEADER_STYLE },
    { value: "Pago", style: TABLE_HEADER_STYLE },
    { value: "Montante", style: TABLE_HEADER_STYLE }
  ]);

  movimentos.forEach((movimento) => {
    pushRow(rows, [
      { value: movimento.item, style: WARNING_STYLE },
      { value: movimento.descricao || "-", style: WARNING_STYLE },
      { value: formatDate(movimento.data_pagamento), style: WARNING_STYLE },
      { value: movimento.tipo_pagamento || "-", style: WARNING_STYLE },
      { value: movimento.numero_fatura || "-", style: WARNING_STYLE },
      {
        value: movimento.fatura_com_nif === null ? "-" : movimento.fatura_com_nif ? "Sim" : "Não",
        style: WARNING_STYLE
      },
      { value: movimento.pago === null ? "-" : movimento.pago ? "Sim" : "Não", style: WARNING_STYLE },
      { value: movementAmount(movimento), style: WARNING_STYLE }
    ]);
  });
}

function buildRows(row: OverviewRow) {
  const rows: ExcelRow[] = [];
  const merges: string[] = [];
  const entradas = row.movimentos.filter((movimento) => movimento.tipo === "entrada").sort(compareMovements);
  const saidas = row.movimentos.filter((movimento) => movimento.tipo === "saida").sort(compareMovements);
  const legacyPending = row.movimentos.filter((movimento) => movimento.tipo === "a_pagamento").sort(compareMovements);

  pushMergedRow(rows, merges, `Q26 - ${row.nome}`, 1, 30);
  pushMergedRow(
    rows,
    merges,
    `Relatório do evento | Data: ${row.movimentos[0]?.evento_data_inicio ? formatDate(row.movimentos[0].evento_data_inicio) : "-"} | Totais gerais: ${row.contabilizarTotais ? "Sim" : "Não"}`,
    2,
    22
  );
  blankRow(rows);
  summaryRows(rows, row);
  blankRow(rows);
  sectionRow(rows, merges, "Entradas");
  buildEntradaRows(rows, entradas, row.entradas);
  blankRow(rows);
  sectionRow(rows, merges, "Saídas");
  buildSaidaRows(rows, saidas, row.saidas);

  if (legacyPending.length) {
    blankRow(rows);
    sectionRow(rows, merges, "Pagamentos em falta");
    buildLegacyPendingRows(rows, legacyPending);
  }

  blankRow(rows);
  pushRow(rows, [
    { value: "Lucro do evento", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: "", style: TOTAL_STYLE },
    { value: row.lucro, style: TOTAL_STYLE }
  ]);

  return { rows, merges };
}

function cellXml(cell: ExcelCell, rowIndex: number, columnIndex: number) {
  const ref = cellReference(rowIndex, columnIndex);
  const style = cell.style === undefined ? "" : ` s="${cell.style}"`;

  if (cell.value === null || cell.value === undefined || cell.value === "") {
    return `<c r="${ref}"${style}/>`;
  }

  if (typeof cell.value === "number") {
    const number = Number.isFinite(cell.value) ? cell.value : 0;
    return `<c r="${ref}"${style}><v>${number}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(cell.value)}</t></is></c>`;
}

function worksheetXml(rows: ExcelRow[], merges: string[]) {
  const sheetRows = rows
    .map((row, index) => {
      const rowIndex = index + 1;
      const height = row.height ? ` ht="${row.height}" customHeight="1"` : "";
      const cells = row.cells.map((cell, cellIndex) => cellXml(cell, rowIndex, cellIndex + 1)).join("");
      return `<row r="${rowIndex}"${height}>${cells}</row>`;
    })
    .join("");
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((range) => `<mergeCell ref="${range}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="28" customWidth="1"/>
    <col min="2" max="2" width="36" customWidth="1"/>
    <col min="3" max="3" width="14" customWidth="1"/>
    <col min="4" max="4" width="18" customWidth="1"/>
    <col min="5" max="5" width="16" customWidth="1"/>
    <col min="6" max="6" width="16" customWidth="1"/>
    <col min="7" max="7" width="15" customWidth="1"/>
    <col min="8" max="8" width="18" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
  ${mergeXml}
  <pageMargins left="0.4" right="0.4" top="0.55" bottom="0.55" header="0.2" footer="0.2"/>
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;€&quot;"/></numFmts>
  <fonts count="5">
    <font><sz val="11"/><color rgb="FF16233F"/><name val="Aptos"/></font>
    <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FF1F66E5"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FFD70F0F"/><name val="Aptos"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F66E5"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E8FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAFBF3"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFECEF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1457C8"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFC7DCFF"/></left>
      <right style="thin"><color rgb="FFC7DCFF"/></right>
      <top style="thin"><color rgb="FFC7DCFF"/></top>
      <bottom style="thin"><color rgb="FFC7DCFF"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="15">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="3" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="4" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="164" fontId="2" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="4" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function workbookXml(sheetNames: string[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews>
  <sheets>${sheetNames.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>
</workbook>`;
}

function workbookRelsXml(sheetCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${Array.from({ length: sheetCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function contentTypesXml(sheetCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function coreXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Exportação Q26</dc:title>
  <dc:creator>Tesouraria Q26</dc:creator>
  <cp:lastModifiedBy>Tesouraria Q26</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`;
}

function appXml(sheetNames: string[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Tesouraria Q26</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheetNames.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${sheetNames.map((name) => `<vt:lpstr>${escapeXml(name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>
</Properties>`;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function bytes(parts: number[]) {
  return new Uint8Array(parts);
}

function blobPart(part: Uint8Array) {
  const buffer = new ArrayBuffer(part.byteLength);
  new Uint8Array(buffer).set(part);
  return buffer;
}

function createZip(files: ZipFile[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const now = dosDateTime(new Date());
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const localHeader: number[] = [];
    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, now.dosTime);
    writeUint16(localHeader, now.dosDate);
    writeUint32(localHeader, crc);
    writeUint32(localHeader, data.length);
    writeUint32(localHeader, data.length);
    writeUint16(localHeader, nameBytes.length);
    writeUint16(localHeader, 0);

    const localHeaderBytes = bytes(localHeader);
    localParts.push(localHeaderBytes, nameBytes, data);

    const centralHeader: number[] = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, now.dosTime);
    writeUint16(centralHeader, now.dosDate);
    writeUint32(centralHeader, crc);
    writeUint32(centralHeader, data.length);
    writeUint32(centralHeader, data.length);
    writeUint16(centralHeader, nameBytes.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, offset);

    centralParts.push(bytes(centralHeader), nameBytes);
    offset += localHeaderBytes.length + nameBytes.length + data.length;
  });

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endHeader: number[] = [];
  writeUint32(endHeader, 0x06054b50);
  writeUint16(endHeader, 0);
  writeUint16(endHeader, 0);
  writeUint16(endHeader, files.length);
  writeUint16(endHeader, files.length);
  writeUint32(endHeader, centralSize);
  writeUint32(endHeader, centralOffset);
  writeUint16(endHeader, 0);

  return new Blob([...localParts, ...centralParts, bytes(endHeader)].map(blobPart), { type: XLSX_MIME });
}

function safeSheetName(value: string) {
  const cleaned = value.replace(/[\[\]:*?/\\]/g, " ").trim();
  return (cleaned || "Evento").slice(0, 31);
}

function uniqueSheetNames(rows: OverviewRow[]) {
  const used = new Set<string>();
  return rows.map((row, index) => {
    const base = safeSheetName(row.nome || row.slug || `Evento ${index + 1}`);
    let candidate = base;
    let suffix = 2;

    while (used.has(candidate.toLowerCase())) {
      const ending = ` ${suffix}`;
      candidate = `${base.slice(0, 31 - ending.length)}${ending}`;
      suffix += 1;
    }

    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function safeFileName(value: string) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "evento";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportOverviewEventToExcel(row: OverviewRow) {
  exportOverviewEventsToExcel([row], `q26-${safeFileName(row.nome || row.slug)}.xlsx`);
}

export function exportOverviewEventsToExcel(rows: OverviewRow[], filename = "q26-eventos-selecionados.xlsx") {
  if (!rows.length) return;
  const sheetNames = uniqueSheetNames(rows);
  const files: ZipFile[] = [
    { path: "[Content_Types].xml", content: contentTypesXml(rows.length) },
    { path: "_rels/.rels", content: rootRelsXml() },
    { path: "docProps/core.xml", content: coreXml() },
    { path: "docProps/app.xml", content: appXml(sheetNames) },
    { path: "xl/workbook.xml", content: workbookXml(sheetNames) },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(rows.length) },
    { path: "xl/styles.xml", content: stylesXml() }
  ];

  rows.forEach((row, index) => {
    const { rows: sheetRows, merges } = buildRows(row);
    files.push({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheetRows, merges)
    });
  });

  downloadBlob(createZip(files), filename);
}
