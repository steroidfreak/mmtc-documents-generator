import path from "path";
import fs from "fs/promises";
import ExcelJS from "exceljs";

function yymmdd(d) {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function fmtDateShort(d) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/,/g, "");
}

function safe(s) {
  return String(s ?? "").replace(/[\\/:*?"<>|]/g, "-").trim();
}

function deriveInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  return parts.map((p) => p[0].toUpperCase()).join("");
}

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function invoiceNumber(invoiceDate, initials, seq) {
  return `MMTC/${yymmdd(invoiceDate)}/${initials}-${String(seq).padStart(2, "0")}`;
}

function normalizedServices(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((s) => ({
      desc: String(s?.description ?? "").trim(),
      amount: s?.amount
    }))
    .filter((s) => s.desc)
    .map((s) => {
      if (typeof s.amount === "string" && s.amount.trim().toLowerCase() === "waived") {
        return { desc: s.desc, amount: "Waived" };
      }
      const n = Number(s.amount ?? 0);
      return { desc: s.desc, amount: Number.isFinite(n) ? n : 0 };
    });
}

async function resolveTemplatePath(templatesDir) {
  const candidates = [
    path.join(templatesDir, "monthly_salary_template.xlsx"),
    path.resolve(templatesDir, "..", "monthly_salary_template.xlsx"),
  ];
  for (const p of candidates) {
    try {
      await fs.stat(p);
      return p;
    } catch {}
  }
  throw new Error(
    `Invoice template not found. Tried:\n${candidates.join("\n")}`
  );
}

async function makeInvoiceXlsx({ outDir, data, seq, lines, invoiceDate, initials, tplPath }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(tplPath);
  const ws = wb.worksheets[0];

  const invNo = invoiceNumber(invoiceDate, initials, seq);
  ws.name = `${initials}_${String(seq).padStart(2, "0")}`;
  ws.getCell("E3").value = data.employerName;
  ws.getCell("E4").value = data.employerContact;
  ws.getCell("L3").value = invoiceDate;
  ws.getCell("L4").value = invNo;

  for (let r = 7; r <= 15; r++) {
    ws.getCell(`C${r}`).value = "";
    ws.getCell(`D${r}`).value = "";
    ws.getCell(`M${r}`).value = "";
  }

  // Row 8 is part of merged cells for row 7 in this template. Skip it.
  const targetRows = [7, 9, 10, 11, 12, 13, 14, 15];
  lines.slice(0, targetRows.length).forEach((line, idx) => {
    const row = targetRows[idx];
    ws.getCell(`C${row}`).value = idx + 1;
    ws.getCell(`D${row}`).value = line.desc;
    ws.getCell(`M${row}`).value = line.amount;
  });
  const total = lines.reduce((acc, line) => {
    if (typeof line.amount === "number") return acc + line.amount;
    const n = Number(line.amount);
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
  ws.getCell("M16").value = total;

  const xlsxPath = path.join(outDir, `${safe(invNo)}.xlsx`);
  await wb.xlsx.writeFile(xlsxPath);
  return xlsxPath;
}

/**
 * Calculate the period start and end dates for invoice month m (1-indexed).
 * Period start = startDate + (m-1) months
 * Period end   = startDate + m months - 1 day
 */
function getPeriod(startDate, m) {
  const periodStart = new Date(startDate.getFullYear(), startDate.getMonth() + (m - 1), startDate.getDate());
  const periodEnd   = new Date(startDate.getFullYear(), startDate.getMonth() + m, startDate.getDate() - 1);
  return { periodStart, periodEnd };
}

/**
 * Generate invoices from startSeq to endSeq (inclusive).
 * @param {number} startSeq - first invoice sequence number (default 1)
 * @param {number|null} endSeq - last invoice sequence number (default: loanMonths)
 */
export async function generateInvoices({ templatesDir, outDir, data, startSeq = 1, endSeq = null }) {
  const tplPath = await resolveTemplatePath(templatesDir);
  const today = new Date();
  const employerInitials = deriveInitials(data.employerName) || "EMP";

  const monthlyWage = Number(data.monthlyWage ?? 550);
  const monthlyDeduction = Number(data.monthlyDeduction ?? 480);
  const loanMonths = Number(data.loanMonths ?? 7);
  const remaining = monthlyWage - monthlyDeduction;
  const extraInv1 = normalizedServices(data.additionalServicesInvoice1);
  const extraInv2 = normalizedServices(data.additionalServicesInvoice2);
  const extraInv3 = normalizedServices(data.additionalServicesInvoice3);
  const results = [];

  const finalEnd = endSeq ?? loanMonths;

  // Parse confirmed start date for period/date calculations (revised packages)
  const startDate =
    data.startDay && data.startMonth && data.startYear
      ? new Date(Number(data.startYear), Number(data.startMonth) - 1, Number(data.startDay))
      : null;

  // Invoice #1 — date is today (generated at point of initial package)
  if (startSeq <= 1 && finalEnd >= 1) {
    const maxTemplateLines = 8;
    const invoice1Lines = [
      {
        desc: `First Month Deposit for Helper ${data.fdwName} - IPA application is in progress. If application is unsuccessful, please show proof of rejection by MOM and we will refund the deposit amount SGD ${monthlyDeduction}.`,
        amount: monthlyDeduction
      },
      { desc: `To give $${remaining} directly to helper by end of first month`, amount: "" },
      ...extraInv1.slice(0, maxTemplateLines - 2),
    ];

    results.push(
      await makeInvoiceXlsx({
        outDir, data, seq: 1, invoiceDate: today, initials: employerInitials, lines: invoice1Lines, tplPath
      })
    );
  }

  // Invoices #2..N
  for (let m = Math.max(2, startSeq); m <= finalEnd; m++) {
    let invoiceDate = today;
    let periodText = "";

    if (startDate) {
      const { periodStart, periodEnd } = getPeriod(startDate, m);
      // Invoice #2 is upfront (date = start of period); #3 onwards is end of period
      invoiceDate = m === 2 ? startDate : periodEnd;
      periodText = `, ${fmtDateShort(periodStart)} to ${fmtDateShort(periodEnd)}`;
    }

    const baseLines = [
      { desc: `${ordinal(m)} Month salary payment (Loan)${periodText}`, amount: monthlyDeduction },
      { desc: `To give $${remaining} directly to helper by end of first month`, amount: "" },
    ];

    const extras = m === 2 ? extraInv2 : m === 3 ? extraInv3 : [];
    const lines = [...baseLines, ...extras];

    results.push(
      await makeInvoiceXlsx({
        outDir, data, seq: m, invoiceDate, initials: employerInitials, lines, tplPath
      })
    );
  }

  return results;
}
