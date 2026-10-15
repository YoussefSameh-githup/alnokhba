import ExcelJS from "exceljs";

export type XlsxColumn<T> = {
  header: string;
  width?: number;
  value: (row: T) => string | number | Date | null | undefined;
  /** Excel number format, e.g. '#,##0" ج.م"' or 'yyyy-mm-dd hh:mm' */
  numFmt?: string;
};

export type XlsxSheet<T> = { name: string; rows: T[]; columns: XlsxColumn<T>[] };

/** Type-checks columns against the row type, then erases it for buildWorkbook(). */
export function defineSheet<T>(sheet: XlsxSheet<T>): XlsxSheet<unknown> {
  return sheet as XlsxSheet<unknown>;
}

/**
 * Builds a clean, right-to-left .xlsx workbook: bold branded header, frozen
 * header row, auto-filter, sensible widths. Values are written as real
 * numbers/dates (not strings) so Excel can sort, filter and sum them.
 */
export async function buildWorkbook(title: string, sheets: XlsxSheet<unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "سنتر النخبة التعليمي";
  wb.created = new Date();
  wb.title = title;

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
    });
    ws.columns = sheet.columns.map((c) => ({ header: c.header, width: c.width ?? 18, style: c.numFmt ? { numFmt: c.numFmt } : {} }));

    const header = ws.getRow(1);
    header.height = 22;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      cell.alignment = { vertical: "middle", horizontal: "right" };
    });

    for (const r of sheet.rows) ws.addRow(sheet.columns.map((c) => c.value(r) ?? ""));

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    ws.eachRow((row, i) => {
      if (i === 1) return;
      row.alignment = { vertical: "middle", horizontal: "right" };
      if (i % 2 === 0) row.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }));
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const STATUS_AR = { PAID: "مدفوع", UNPAID: "غير مدفوع", PENDING: "معلق" } as const;
export const METHOD_AR = { SCAN: "كارت QR", MANUAL: "يدوي" } as const;
