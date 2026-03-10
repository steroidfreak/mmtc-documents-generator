import path from "path";
import fs from "fs/promises";
import ExcelJS from "exceljs";

function money(n) {
  return `$${Number(n).toFixed(0)}`;
}

// Returns { date: Date|null, monthOnly: boolean }
// monthOnly=true  → caller provided only month+year (or nothing) → show "Jan 2025" format
// monthOnly=false → caller provided a specific day → show "1st Jan 2025" format
function parseStartDate(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { date: null, monthOnly: true };

  const dmy = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/;
  const monthYear = /^([A-Za-z]{3,9})\s+(\d{4})$/;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

  if (dmy.test(raw)) {
    const [, d, m, y] = raw.match(dmy);
    const dt = new Date(`${m} ${d}, ${y}`);
    if (!Number.isNaN(dt.getTime())) return { date: dt, monthOnly: false };
  }

  if (monthYear.test(raw)) {
    const [, m, y] = raw.match(monthYear);
    const dt = new Date(`${m} 1, ${y}`);
    if (!Number.isNaN(dt.getTime())) return { date: dt, monthOnly: true };
  }

  if (iso.test(raw)) {
    const [, y, m, d] = raw.match(iso);
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(dt.getTime())) return { date: dt, monthOnly: false };
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return { date: fallback, monthOnly: false };
  return { date: null, monthOnly: true };
}

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function formatDateWithOrdinal(d) {
  return `${ordinal(d.getDate())} ${d.toLocaleDateString("en-GB", { month: "short" })} ${d.getFullYear()}`;
}

function formatMonthOnly(d) {
  return `${d.toLocaleDateString("en-GB", { month: "short" })} ${d.getFullYear()}`;
}

function fmtShort(d) {
  return `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })} ${d.getFullYear()}`;
}

function addMonthsClamped(date, months) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const day = date.getDate();
  const target = new Date(y, m + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(day, lastDay));
}

export async function buildScheduleXlsx({ templatesDir, outDir, data }) {
  const candidates = [
    path.resolve(templatesDir, "..", "..", "updated_schedule_template.xlsx"),
    path.join(templatesDir, "updated_schedule_template.xlsx"),
    path.join(templatesDir, "salary_schedule_template.xlsx")
  ];
  let buf;
  let lastError;
  for (const tplPath of candidates) {
    try {
      buf = await fs.readFile(tplPath);
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!buf) {
    throw new Error(`Schedule template not found. Tried updated_schedule_template.xlsx and salary_schedule_template.xlsx. ${lastError?.message ?? ""}`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];

  // Rebalance table widths so date ranges stay inside "For Salary" (B)
  // while reducing "Acknowledgement" (H) width.
  ws.getColumn(2).width = 24;
  ws.getColumn(8).width = 12;

  const monthlyWage = Number(data.monthlyWage ?? 550);
  const monthlyDeduction = Number(data.monthlyDeduction ?? 480);
  const loanMonths = Number(data.loanMonths ?? 7);
  const { date: parsedDate, monthOnly } = parseStartDate(data.startWorkMonthText);
  const startDate = parsedDate ?? new Date();

  const fmtDate = monthOnly ? formatMonthOnly : formatDateWithOrdinal;

  ws.getCell("D3").value = data.employerName;
  ws.getCell("D4").value = data.fdwName;
  ws.getCell("D5").value = `$ ${monthlyWage} with one Sun off per month`;
  ws.getCell("D6").value = fmtDate(startDate);

  const startRow = 9;
  const colMonthNo = 1;   // A
  const colPeriod = 2;    // B
  const colSalaryPaymentDate = 3; // C
  const colSalary = 4;    // D
  const colOffDay = 5;    // E
  const colDeduct = 6;    // F
  const colReceive = 7;   // G

  for (let i = 1; i <= 24; i++) {
    const r = startRow + (i - 1);
    const deduction = i <= loanMonths ? monthlyDeduction : 0;
    const receive = monthlyWage - deduction;

    // Period: from = start + (i-1) months, to = start + i months - 1 day
    let fromDate, toDate;
    if (monthOnly) {
      fromDate = addMonthsClamped(startDate, i - 1);
      toDate   = addMonthsClamped(startDate, i);
    } else {
      fromDate = new Date(startDate.getFullYear(), startDate.getMonth() + (i - 1), startDate.getDate());
      toDate   = new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate() - 1);
    }

    const periodCell = ws.getRow(r).getCell(colPeriod);

    ws.getRow(r).getCell(colMonthNo).value = i;
    periodCell.value = monthOnly
      ? `${formatMonthOnly(fromDate)} - ${formatMonthOnly(toDate)}`
      : `${fmtShort(fromDate)} to ${fmtShort(toDate)}`;
    periodCell.font = { ...(periodCell.font ?? {}), size: 9 };
    periodCell.alignment = {
      ...(periodCell.alignment ?? {}),
      horizontal: "left",
      shrinkToFit: true,
      vertical: "middle"
    };

    let salaryPaymentDate = "";
    if (i === 1) {
      salaryPaymentDate = "Upon Confirm";
    } else if (i === 2) {
      salaryPaymentDate = monthOnly ? `End ${ordinal(i)} month` : fmtShort(startDate);
    } else if (i <= loanMonths) {
      salaryPaymentDate = monthOnly ? `End ${ordinal(i)} month` : fmtShort(toDate);
    }
    ws.getRow(r).getCell(colSalaryPaymentDate).value = salaryPaymentDate;
    ws.getRow(r).getCell(colSalary).value = money(monthlyWage);
    ws.getRow(r).getCell(colOffDay).value = "-";
    ws.getRow(r).getCell(colDeduct).value = i <= loanMonths ? money(deduction) : "-";
    ws.getRow(r).getCell(colReceive).value = money(receive);
  }

  const outPath = path.join(outDir, "Salary_Payment_Schedule_filled.xlsx");
  await wb.xlsx.writeFile(outPath);
  return outPath;
}
