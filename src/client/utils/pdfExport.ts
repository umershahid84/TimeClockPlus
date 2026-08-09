/**
 * Builds a landscape PDF from tabular data and triggers a download.
 * jsPDF/autotable are loaded on demand (they're a large dependency) so
 * they don't add to the app's main bundle for users who never export a
 * PDF. Used anywhere a report or timesheet needs a downloadable PDF that
 * contains only the data itself - never a screenshot of the page.
 */
export async function exportRowsToPdf(params: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });

  doc.setFontSize(14);
  doc.text(params.title, 40, 40);

  let startY = 56;
  if (params.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(params.subtitle, 40, 58);
    startY = 72;
  }

  autoTable(doc, {
    startY,
    head: [params.columns],
    body: params.rows.map((row) => params.columns.map((c) => String(row[c] ?? ""))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 58, 95] },
    margin: { left: 40, right: 40 },
  });

  doc.save(params.filename);
}
