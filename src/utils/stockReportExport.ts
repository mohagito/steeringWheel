import { Reference } from "../types";
import { MESHES_PRICE_LIST } from "./stockValuation";
import { getCasablancaParts } from "./timeUtils";

export interface StockReportExportOptions {
  includeUnitPrice?: boolean;
  includeTotal?: boolean;
}

/**
 * Returns formatted date strings according to Africa/Casablanca:
 * - filenameDate: "DD-MM-YY" (e.g. "29-09-26")
 * - displayDate: "DD/MM/YY" (e.g. "29/09/26")
 * - fullDate: "DD/MM/YYYY HH:mm" (e.g. "29/09/2026 12:22")
 */
export function getStockReportDateStrings(): { filenameDate: string; displayDate: string; fullDate: string } {
  const parts = getCasablancaParts();
  if (!parts) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const yyyy = String(now.getFullYear());
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    return {
      filenameDate: `${dd}-${mm}-${yy}`,
      displayDate: `${dd}/${mm}/${yy}`,
      fullDate: `${dd}/${mm}/${yyyy} ${hh}:${min}`
    };
  }

  const yy = parts.year.slice(-2);
  return {
    filenameDate: `${parts.day}-${parts.month}-${yy}`,
    displayDate: `${parts.day}/${parts.month}/${yy}`,
    fullDate: `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
  };
}

/**
 * Exports the stock report in formatted Excel (.xls)
 * EXACTLY matching the reference image:
 *
 * Row 1: Blank
 * Row 2: STOCK AUDIT REPORT — STOCK 1, STOCK 2, STOCK 3
 * Row 3: Report Date: DD/MM/YY | Generated: DD/MM/YYYY HH:mm
 * Row 4: Blank
 * Row 5: Table Header:
 *        Reference | Description | Unit Price | Stock 1 | Stock 2 | Stock 3 | Total Stock | Manual S1 | Manual S2 | Manual S3
 * Data Rows:
 *        Clean bordered table with formatted values
 * Total Row:
 *        TOTAL SYSTEM INVENTORY (X REFS) | sum S1 | sum S2 | sum S3 | sum Total | empty S1 | empty S2 | empty S3
 */
export function exportStockAuditExcel(
  references: Reference[],
  _options: StockReportExportOptions = {}
): void {
  const { filenameDate, displayDate, fullDate } = getStockReportDateStrings();
  const filename = `stock report ${filenameDate}.xls`;

  // Color constants strictly matching the user's reference image
  const greenHeaderBg = "#005a36";
  const darkColHeaderBg = "#1e293b";
  const totalRowBg = "#d1fae5";
  const totalStockBg = "#a7f3d0";
  const darkGreenText = "#005a36";
  const cellBorder = "1px solid #cbd5e1";
  const totalBorder = "1px solid #6ee7b7";

  let grandTotalS1 = 0;
  let grandTotalS2 = 0;
  let grandTotalS3 = 0;
  let grandTotalStock = 0;

  const dataRowsHtml = references
    .map((ref) => {
      const s1 = typeof ref.stock1 === "number" ? ref.stock1 : 0;
      const s2 = typeof ref.stock2 === "number" ? ref.stock2 : 0;
      const s3 = typeof ref.stock3 === "number" ? ref.stock3 : 0;
      const total = s1 + s2 + s3;

      grandTotalS1 += s1;
      grandTotalS2 += s2;
      grandTotalS3 += s3;
      grandTotalStock += total;

      const codeKey = (ref.code || "").trim().toUpperCase();
      const unitPriceVal = MESHES_PRICE_LIST[codeKey];
      const unitPriceDisplay =
        unitPriceVal !== undefined ? `€${unitPriceVal.toFixed(2)}` : "";

      return `
        <tr>
          <td style="border: ${cellBorder}; padding: 6px 10px; font-weight: bold; font-family: Calibri, Arial, sans-serif; text-align: left; color: #000000;">${ref.code || ""}</td>
          <td style="border: ${cellBorder}; padding: 6px 10px; font-family: Calibri, Arial, sans-serif; text-align: left; color: #000000;">${(ref.description || "").toUpperCase()}</td>
          <td style="border: ${cellBorder}; padding: 6px 10px; font-family: Calibri, Arial, sans-serif; text-align: right; color: #000000;">${unitPriceDisplay}</td>
          <td style="border: ${cellBorder}; padding: 6px 10px; font-family: Calibri, Arial, sans-serif; text-align: right; color: #000000; mso-number-format: '\\#,\\#\\#0';">${s1.toLocaleString()}</td>
          <td style="border: ${cellBorder}; padding: 6px 10px; font-family: Calibri, Arial, sans-serif; text-align: right; color: #000000; mso-number-format: '\\#,\\#\\#0';">${s2.toLocaleString()}</td>
          <td style="border: ${cellBorder}; padding: 6px 10px; font-family: Calibri, Arial, sans-serif; text-align: right; color: #000000; mso-number-format: '\\#,\\#\\#0';">${s3.toLocaleString()}</td>
          <td style="border: ${cellBorder}; padding: 6px 10px; font-family: Calibri, Arial, sans-serif; text-align: right; font-weight: bold; color: ${darkGreenText}; mso-number-format: '\\#,\\#\\#0';">${total.toLocaleString()}</td>
          <td style="border: ${cellBorder}; padding: 6px 10px; text-align: center;"></td>
          <td style="border: ${cellBorder}; padding: 6px 10px; text-align: center;"></td>
          <td style="border: ${cellBorder}; padding: 6px 10px; text-align: center;"></td>
        </tr>
      `;
    })
    .join("");

  const totalRowHtml = `
    <tr style="background-color: ${totalRowBg}; font-weight: bold;">
      <td colspan="3" style="border: ${totalBorder}; padding: 6px 10px; text-align: left; font-family: Calibri, Arial, sans-serif; color: ${darkGreenText}; font-weight: bold;">
        TOTAL SYSTEM INVENTORY (${references.length} REFS)
      </td>
      <td style="border: ${totalBorder}; padding: 6px 10px; text-align: right; font-family: Calibri, Arial, sans-serif; color: ${darkGreenText}; font-weight: bold; mso-number-format: '\\#,\\#\\#0';">${grandTotalS1.toLocaleString()}</td>
      <td style="border: ${totalBorder}; padding: 6px 10px; text-align: right; font-family: Calibri, Arial, sans-serif; color: ${darkGreenText}; font-weight: bold; mso-number-format: '\\#,\\#\\#0';">${grandTotalS2.toLocaleString()}</td>
      <td style="border: ${totalBorder}; padding: 6px 10px; text-align: right; font-family: Calibri, Arial, sans-serif; color: ${darkGreenText}; font-weight: bold; mso-number-format: '\\#,\\#\\#0';">${grandTotalS3.toLocaleString()}</td>
      <td style="border: ${totalBorder}; padding: 6px 10px; text-align: right; font-family: Calibri, Arial, sans-serif; color: ${darkGreenText}; font-weight: bold; background-color: ${totalStockBg}; mso-number-format: '\\#,\\#\\#0';">${grandTotalStock.toLocaleString()}</td>
      <td style="border: ${totalBorder}; padding: 6px 10px; background-color: ${totalRowBg};"></td>
      <td style="border: ${totalBorder}; padding: 6px 10px; background-color: ${totalRowBg};"></td>
      <td style="border: ${totalBorder}; padding: 6px 10px; background-color: ${totalRowBg};"></td>
    </tr>
  `;

  const excelDocument = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>Stock Audit</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; padding: 20px; }
    .report-title { font-size: 15pt; font-weight: bold; color: ${darkGreenText}; font-family: Calibri, Arial, sans-serif; }
    .report-subtitle { font-size: 10pt; color: #4b5563; font-family: Calibri, Arial, sans-serif; }
    table { border-collapse: collapse; width: 100%; font-family: Calibri, Arial, sans-serif; }
    th { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
    td { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  </style>
</head>
<body>
  <table>
    <tr><td></td></tr>
    <tr>
      <td colspan="10" class="report-title">
        STOCK AUDIT REPORT — STOCK 1, STOCK 2, STOCK 3
      </td>
    </tr>
    <tr>
      <td colspan="10" class="report-subtitle">
        Report Date: ${displayDate} | Generated: ${fullDate}
      </td>
    </tr>
    <tr><td></td></tr>
    <thead>
      <tr style="color: #ffffff; font-weight: bold;">
        <th style="background-color: ${greenHeaderBg}; border: ${cellBorder}; padding: 8px 10px; text-align: left; width: 140px;">Reference</th>
        <th style="background-color: ${greenHeaderBg}; border: ${cellBorder}; padding: 8px 10px; text-align: left; width: 340px;">Description</th>
        <th style="background-color: ${greenHeaderBg}; border: ${cellBorder}; padding: 8px 10px; text-align: right; width: 95px;">Unit Price</th>
        <th style="background-color: ${greenHeaderBg}; border: ${cellBorder}; padding: 8px 10px; text-align: right; width: 80px;">Stock 1</th>
        <th style="background-color: ${greenHeaderBg}; border: ${cellBorder}; padding: 8px 10px; text-align: right; width: 80px;">Stock 2</th>
        <th style="background-color: ${greenHeaderBg}; border: ${cellBorder}; padding: 8px 10px; text-align: right; width: 80px;">Stock 3</th>
        <th style="background-color: ${greenHeaderBg}; border: ${cellBorder}; padding: 8px 10px; text-align: right; width: 100px;">Total Stock</th>
        <th style="background-color: ${darkColHeaderBg}; border: ${cellBorder}; padding: 8px 10px; text-align: center; width: 90px;">Manual S1</th>
        <th style="background-color: ${darkColHeaderBg}; border: ${cellBorder}; padding: 8px 10px; text-align: center; width: 90px;">Manual S2</th>
        <th style="background-color: ${darkColHeaderBg}; border: ${cellBorder}; padding: 8px 10px; text-align: center; width: 90px;">Manual S3</th>
      </tr>
    </thead>
    <tbody>
      ${dataRowsHtml}
      ${totalRowHtml}
    </tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([excelDocument], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Standard CSV Export matching the same schema
 */
export function exportStockAuditCSV(references: Reference[]): void {
  const { filenameDate } = getStockReportDateStrings();
  const filename = `stock report ${filenameDate}.csv`;

  const headers: string[] = [
    "Reference",
    "Description",
    "Unit Price",
    "Stock 1",
    "Stock 2",
    "Stock 3",
    "Total Stock",
    "Manual S1",
    "Manual S2",
    "Manual S3"
  ];

  let grandTotalS1 = 0;
  let grandTotalS2 = 0;
  let grandTotalS3 = 0;
  let grandTotalStock = 0;

  const rows: string[][] = references.map((ref) => {
    const s1 = typeof ref.stock1 === "number" ? ref.stock1 : 0;
    const s2 = typeof ref.stock2 === "number" ? ref.stock2 : 0;
    const s3 = typeof ref.stock3 === "number" ? ref.stock3 : 0;
    const total = s1 + s2 + s3;

    grandTotalS1 += s1;
    grandTotalS2 += s2;
    grandTotalS3 += s3;
    grandTotalStock += total;

    const codeKey = (ref.code || "").trim().toUpperCase();
    const unitPriceVal = MESHES_PRICE_LIST[codeKey];
    const unitPriceDisplay =
      unitPriceVal !== undefined ? `€${unitPriceVal.toFixed(2)}` : "";

    return [
      ref.code || "",
      `"${(ref.description || "").replace(/"/g, '""').toUpperCase()}"`,
      unitPriceDisplay,
      s1.toString(),
      s2.toString(),
      s3.toString(),
      total.toString(),
      "",
      "",
      ""
    ];
  });

  // Total summary row
  rows.push([
    `TOTAL SYSTEM INVENTORY (${references.length} REFS)`,
    "",
    "",
    grandTotalS1.toString(),
    grandTotalS2.toString(),
    grandTotalS3.toString(),
    grandTotalStock.toString(),
    "",
    "",
    ""
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
