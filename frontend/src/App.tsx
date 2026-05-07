import { useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1, y + 2];
})();

function defaultNextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function safeFile(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "-").trim();
}

function maskNric(nric: string) {
  // Keep first char + last 4 chars, mask middle with xxxx
  // e.g. S7108623B → Sxxxx623B
  if (nric.length < 5) return nric;
  return nric[0] + "xxxx" + nric.slice(-4);
}

function deriveInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join("");
}

type Stage = "initial" | "revised";

type Payload = {
  stage: Stage;
  employerSalutation: string;
  employerName: string;
  employerNric: string;
  employerAddress: string;
  employerContact: string;
  fdwName: string;
  fdwFin?: string;
  fdwPassport: string;
  monthlyWage: number;
  cityOfOrigin: string;
  countryOfOrigin: string;
  totalLoan: number;
  monthlyDeduction: number;
  loanMonths: number;
  extraDeduction?: number;
  startWorkMonthText: string;
  employerInitials: string;
  additionalServicesInvoice1: { description: string; amount: number | string }[];
  additionalServicesInvoice2: { description: string; amount: number | string }[];
  additionalServicesInvoice3: { description: string; amount: number | string }[];
  startDay?: number;
  startMonth?: number;
  startYear?: number;
};

type ServiceSelection = {
  code: string;
  enabled: boolean;
  invoiceNo: 1 | 2 | 3;
  waived: boolean;
};

const SERVICE_OPTIONS = [
  { code: "transport", label: "Transport", amount: 200, waivable: false },
  { code: "ipa", label: "IPA", amount: 35, waivable: false },
  { code: "work_permit_issuance", label: "Work Permit Issuance", amount: 35, waivable: false },
  { code: "sip_medical", label: "SIP and Medical", amount: 137, waivable: false },
  { code: "processing_fee", label: "Processing fee", amount: 100, waivable: true }
] as const;

function defaultServiceSelections() {
  return [
    { code: "transport", enabled: false, invoiceNo: 1, waived: false },
    { code: "ipa", enabled: false, invoiceNo: 1, waived: false },
    { code: "work_permit_issuance", enabled: false, invoiceNo: 1, waived: false },
    { code: "sip_medical", enabled: false, invoiceNo: 1, waived: false },
    { code: "processing_fee", enabled: false, invoiceNo: 1, waived: false }
  ] satisfies ServiceSelection[];
}

export default function App() {
  const [loading, setLoading] = useState<Stage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [readyFiles, setReadyFiles] = useState<{ name: string; url: string }[]>([]);

  const [employerSalutation, setEmployerSalutation] = useState("Mr.");
  const [employerName, setEmployerName] = useState("");
  const [employerNric, setEmployerNric] = useState("");
  const [employerAddress, setEmployerAddress] = useState("");
  const [employerContact, setEmployerContact] = useState("");

  const [fdwName, setFdwName] = useState("");
  const [fdwFin, setFdwFin] = useState("");
  const [fdwPassport, setFdwPassport] = useState("");

  const [monthlyWage, setMonthlyWage] = useState<number>(550);
  const [cityOfOrigin, setCityOfOrigin] = useState("Yangon");
  const [countryOfOrigin, setCountryOfOrigin] = useState("Myanmar");

  const [monthlyDeduction, setMonthlyDeduction] = useState<number>(480);
  const [loanMonths, setLoanMonths] = useState<number>(7);
  const [hasExtraMonth, setHasExtraMonth] = useState<boolean>(false);
  const [extraDeduction, setExtraDeduction] = useState<number>(200);
  const totalLoan = useMemo(
    () => Math.max(0, Number(monthlyDeduction || 0) * Number(loanMonths || 0)),
    [monthlyDeduction, loanMonths]
  );

  const { month: defaultMonth, year: defaultYear } = defaultNextMonth();
  const [indicativeMonth, setIndicativeMonth] = useState(defaultMonth);
  const [indicativeYear, setIndicativeYear] = useState(defaultYear);
  const [confirmedDay, setConfirmedDay] = useState("");
  const [confirmedMonth, setConfirmedMonth] = useState(defaultMonth);
  const [confirmedYear, setConfirmedYear] = useState(defaultYear);

  const [serviceSelections, setServiceSelections] = useState<ServiceSelection[]>(defaultServiceSelections);
  const employerInitials = useMemo(() => deriveInitials(employerName), [employerName]);

  const canGenerate =
    employerName.trim() &&
    employerNric.trim() &&
    employerAddress.trim() &&
    employerContact.trim() &&
    fdwName.trim() &&
    fdwPassport.trim();

  const confirmedDayNum = parseInt(confirmedDay, 10);
  const hasValidConfirmedDate =
    confirmedDay.trim() !== "" &&
    Number.isInteger(confirmedDayNum) &&
    confirmedDayNum >= 1 &&
    confirmedDayNum <= 31;

  const selectedServiceLines = useMemo(
    () =>
      serviceSelections
        .filter((s) => s.enabled)
        .map((s) => {
          const def = SERVICE_OPTIONS.find((opt) => opt.code === s.code)!;
          const amount = def.waivable && s.waived ? "Waived" : def.amount;
          return { invoiceNo: s.invoiceNo, description: def.label, amount };
        }),
    [serviceSelections]
  );

  function buildPayload(stage: Stage): Payload {
    const startWorkMonthText =
      stage === "initial"
        ? `${MONTH_NAMES[indicativeMonth - 1]} ${indicativeYear}`
        : `${confirmedDay} ${MONTH_NAMES[confirmedMonth - 1]} ${confirmedYear}`;

    return {
      stage,
      employerSalutation,
      employerName,
      employerNric,
      employerAddress,
      employerContact,
      fdwName,
      fdwFin: fdwFin.trim() ? fdwFin.trim() : undefined,
      fdwPassport,
      monthlyWage,
      cityOfOrigin,
      countryOfOrigin,
      totalLoan,
      monthlyDeduction,
      loanMonths,
      ...(hasExtraMonth && extraDeduction > 0 ? { extraDeduction } : {}),
      startWorkMonthText,
      employerInitials,
      additionalServicesInvoice1: selectedServiceLines
        .filter((s) => s.invoiceNo === 1)
        .map((s) => ({ description: s.description, amount: s.amount })),
      additionalServicesInvoice2: selectedServiceLines
        .filter((s) => s.invoiceNo === 2)
        .map((s) => ({ description: s.description, amount: s.amount })),
      additionalServicesInvoice3: selectedServiceLines
        .filter((s) => s.invoiceNo === 3)
        .map((s) => ({ description: s.description, amount: s.amount })),
      ...(hasValidConfirmedDate && {
        startDay: confirmedDayNum,
        startMonth: confirmedMonth,
        startYear: confirmedYear,
      }),
    };
  }

  async function generateFiles(stage: Stage) {
    setErr(null);
    setReadyFiles([]);
    setLoading(stage);
    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(stage)),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Server error (${res.status})`);
      }

      const { files } = await res.json() as { files: { name: string; data: string }[] };

      const ready = files.map((file) => {
        const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/pdf" });
        return { name: file.name, url: URL.createObjectURL(blob) };
      });
      setReadyFiles(ready);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(null);
    }
  }

  function fillSample() {
    setEmployerSalutation("Mr.");
    setEmployerName("Tan Thi Thu");
    setEmployerNric("Sxxxx589J");
    setEmployerAddress("Blk 457 Ang Mo Kio Ave 10, #13-1502 Singapore 560457");
    setEmployerContact("+65 8239 9081");
    setFdwName("Thandar Lwin");
    setFdwFin("");
    setFdwPassport("MK087062");
    setMonthlyWage(550);
    setMonthlyDeduction(480);
    setLoanMonths(7);
    setCityOfOrigin("Yangon");
    setCountryOfOrigin("Myanmar");
    setIndicativeMonth(4);
    setIndicativeYear(2026);
    setConfirmedDay("");
    setConfirmedMonth(4);
    setConfirmedYear(2026);
    setServiceSelections(defaultServiceSelections());
  }

  function updateServiceSelection(code: string, patch: Partial<ServiceSelection>) {
    setServiceSelections((prev) =>
      prev.map((row) => (row.code === code ? { ...row, ...patch } : row))
    );
  }

  // ── Document scanner ──────────────────────────────────────────────────────
  type ScanResult = {
    filename: string;
    docType: "ic" | "passport" | "unknown";
    employerName?: string | null;
    employerNric?: string | null;
    employerAddress?: string | null;
    fdwName?: string | null;
    fdwPassport?: string | null;
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanFiles, setScanFiles] = useState<File[]>([]);
  const [scanPreviews, setScanPreviews] = useState<string[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[] | null>(null);
  const [scanErr, setScanErr] = useState<string | null>(null);

  function handleScanFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setScanFiles(files);
    setScanResults(null);
    setScanErr(null);
    scanPreviews.forEach((u) => URL.revokeObjectURL(u));
    setScanPreviews(files.map((f) => f.type.startsWith("image/") ? URL.createObjectURL(f) : ""));
  }

  async function runScan() {
    if (!scanFiles.length) return;
    setScanLoading(true);
    setScanErr(null);
    setScanResults(null);
    try {
      const form = new FormData();
      scanFiles.forEach((f) => form.append("files", f));
      const res = await fetch(`${API_BASE}/api/scan`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text().catch(() => `Server error (${res.status})`));
      const data: ScanResult[] = await res.json();
      setScanResults(data);
    } catch (e: any) {
      setScanErr(e?.message ?? String(e));
    } finally {
      setScanLoading(false);
    }
  }

  function applyScannedFields() {
    if (!scanResults) return;
    for (const r of scanResults) {
      if (r.docType === "ic") {
        if (r.employerName) setEmployerName(r.employerName);
        if (r.employerNric) setEmployerNric(maskNric(r.employerNric));
        if (r.employerAddress) setEmployerAddress(r.employerAddress);
      } else if (r.docType === "passport") {
        if (r.fdwName) setFdwName(r.fdwName);
        if (r.fdwPassport) setFdwPassport(r.fdwPassport);
      }
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>MMTC Contract + Schedule + Invoices (ZIP)</h1>
        <div className="note">
          Backend runs on <b>http://localhost:8787</b> by default. Change <code>VITE_API_BASE</code> if needed.
        </div>

        {/* ── Document Scanner ── */}
        <h2>Scan Documents <span style={{ fontWeight: 400, fontSize: 13, color: "#888" }}>(optional — upload IC + passport to auto-fill)</span></h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              style={{ display: "none" }}
              onChange={handleScanFileChange}
            />
            <button className="secondary" onClick={() => fileInputRef.current?.click()} disabled={scanLoading}>
              Choose files
            </button>
            {scanFiles.length > 0 && (
              <span style={{ fontSize: 13, opacity: 0.75 }}>
                {scanFiles.map((f) => f.name).join(", ")}
              </span>
            )}
            <button onClick={runScan} disabled={!scanFiles.length || scanLoading}>
              {scanLoading ? "Scanning…" : `Scan${scanFiles.length > 1 ? ` (${scanFiles.length} files)` : ""}`}
            </button>
          </div>

          {scanPreviews.some(Boolean) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {scanPreviews.map((url, i) =>
                url ? (
                  <img
                    key={i}
                    src={url}
                    alt={scanFiles[i]?.name}
                    style={{ maxHeight: 160, maxWidth: 240, objectFit: "contain", borderRadius: 8, border: "1px solid #e6e8ef" }}
                  />
                ) : null
              )}
            </div>
          )}

          {scanErr && (
            <div className="note" style={{ color: "#b00020" }}><b>Scan error:</b> {scanErr}</div>
          )}

          {scanResults && (
            <div style={{ background: "#f6f7fb", border: "1px solid #e6e8ef", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Scan results — review before applying:</div>
              {scanResults.map((r, i) => {
                const typeLabel = r.docType === "ic" ? "NRIC / IC → Employer" : r.docType === "passport" ? "Passport → Helper" : "Unknown document";
                const typeColor = r.docType === "ic" ? "#1a6ef5" : r.docType === "passport" ? "#16a34a" : "#888";
                const rows: [string, string | null | undefined][] =
                  r.docType === "ic"
                    ? [["Employer Name", r.employerName], ["Employer NRIC", r.employerNric ? maskNric(r.employerNric) : r.employerNric], ["Employer Address", r.employerAddress]]
                    : r.docType === "passport"
                    ? [["Helper Name", r.fdwName], ["Passport No", r.fdwPassport]]
                    : [];
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: typeColor, marginBottom: 4 }}>
                      {r.filename} — {typeLabel}
                    </div>
                    {rows.length > 0 ? (
                      <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
                        <tbody>
                          {rows.map(([label, val]) => (
                            <tr key={label}>
                              <td style={{ opacity: 0.6, paddingRight: 10, whiteSpace: "nowrap", paddingBottom: 2 }}>{label}</td>
                              <td style={{ color: val ? "#111" : "#aaa" }}>{val ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ fontSize: 12, color: "#aaa" }}>Could not extract fields from this document.</div>
                    )}
                  </div>
                );
              })}
              <button style={{ marginTop: 6 }} onClick={applyScannedFields}>
                Apply to form
              </button>
            </div>
          )}
        </div>

        <h2>Employer</h2>
        <div className="grid">
          <div className="field">
            <label>Salutation</label>
            <select value={employerSalutation} onChange={(e) => setEmployerSalutation(e.target.value)}>
              <option value="Mr.">Mr.</option>
              <option value="Mrs.">Mrs.</option>
              <option value="Ms.">Ms.</option>
              <option value="Mdm.">Mdm.</option>
              <option value="Dr.">Dr.</option>
            </select>
          </div>
          <div className="field">
            <label>Employer Name</label>
            <input value={employerName} onChange={(e) => setEmployerName(e.target.value)} />
          </div>
          <div className="field">
            <label>NRIC</label>
            <input value={employerNric} onChange={(e) => setEmployerNric(e.target.value)} />
          </div>
          <div className="field">
            <label>Address</label>
            <input value={employerAddress} onChange={(e) => setEmployerAddress(e.target.value)} />
          </div>
          <div className="field">
            <label>Contact</label>
            <input value={employerContact} onChange={(e) => setEmployerContact(e.target.value)} />
          </div>
        </div>

        <h2>FDW</h2>
        <div className="grid">
          <div className="field">
            <label>FDW Name</label>
            <input value={fdwName} onChange={(e) => setFdwName(e.target.value)} />
          </div>
          <div className="field">
            <label>FIN / WP No (optional)</label>
            <input value={fdwFin} onChange={(e) => setFdwFin(e.target.value)} />
          </div>
          <div className="field">
            <label>Passport No</label>
            <input value={fdwPassport} onChange={(e) => setFdwPassport(e.target.value)} />
          </div>
        </div>

        <h2>Contract Terms</h2>
        <div className="grid">
          <div className="field">
            <label>Monthly Wage</label>
            <input type="number" value={monthlyWage} onChange={(e) => setMonthlyWage(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>City of Origin</label>
            <input value={cityOfOrigin} onChange={(e) => setCityOfOrigin(e.target.value)} />
          </div>
          <div className="field">
            <label>Country</label>
            <input value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)} />
          </div>
        </div>

        <h2>Loan</h2>
        <div className="grid">
          <div className="field">
            <label>Total Loan (auto)</label>
            <input type="number" value={totalLoan} readOnly />
          </div>
          <div className="field">
            <label>Monthly Deduction</label>
            <input type="number" value={monthlyDeduction} onChange={(e) => setMonthlyDeduction(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Loan Months</label>
            <input type="number" value={loanMonths} onChange={(e) => setLoanMonths(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={hasExtraMonth}
                onChange={(e) => setHasExtraMonth(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Add extra deduction month (Month {loanMonths + 1})
            </label>
            {hasExtraMonth && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <input
                  type="number"
                  min={0}
                  max={monthlyWage}
                  value={extraDeduction}
                  onChange={(e) => setExtraDeduction(Number(e.target.value))}
                  style={{ width: 100 }}
                />
                <span style={{ fontSize: 12, color: "#666" }}>
                  Deduct ${extraDeduction || 0} → Helper receives ${Math.max(0, monthlyWage - (extraDeduction || 0))}
                </span>
              </div>
            )}
          </div>
        </div>

        <h2>Start Date</h2>
        <div className="grid">
          <div className="field">
            <label>
              Indicative Month{" "}
              <span style={{ color: "#888", fontWeight: 400, fontSize: 12 }}>(used for Initial Package)</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={indicativeMonth} onChange={(e) => setIndicativeMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={indicativeYear} onChange={(e) => setIndicativeYear(Number(e.target.value))}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>
              Confirmed Start Date{" "}
              <span style={{ color: "#888", fontWeight: 400, fontSize: 12 }}>(optional — unlocks Revised Package)</span>
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                min={1}
                max={31}
                placeholder="Day"
                value={confirmedDay}
                onChange={(e) => setConfirmedDay(e.target.value)}
                style={{ width: 64 }}
              />
              <select value={confirmedMonth} onChange={(e) => setConfirmedMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={confirmedYear} onChange={(e) => setConfirmedYear(Number(e.target.value))}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        <h2>Invoices</h2>
        <div className="grid">
          <div className="field">
            <label>Employer Initials (auto)</label>
            <input value={employerInitials} readOnly />
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Additional Services (choose invoice 01 or 02)</label>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Include</th>
                <th style={{ textAlign: "left" }}>Service Type</th>
                <th style={{ textAlign: "left" }}>Amount</th>
                <th style={{ textAlign: "left" }}>Invoice</th>
                <th style={{ textAlign: "left" }}>Waived</th>
              </tr>
            </thead>
            <tbody>
              {SERVICE_OPTIONS.map((opt) => {
                const row = serviceSelections.find((s) => s.code === opt.code)!;
                return (
                  <tr key={opt.code}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => updateServiceSelection(opt.code, { enabled: e.target.checked })}
                      />
                    </td>
                    <td>{opt.label}</td>
                    <td>{opt.waivable && row.waived ? "Waived" : `$${opt.amount}`}</td>
                    <td>
                      <select
                        value={row.invoiceNo}
                        onChange={(e) => updateServiceSelection(opt.code, { invoiceNo: Number(e.target.value) as 1 | 2 | 3 })}
                      >
                        <option value={1}>01</option>
                        <option value={2}>02</option>
                        <option value={3}>03</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.waived}
                        disabled={!opt.waivable}
                        onChange={(e) => updateServiceSelection(opt.code, { waived: e.target.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="actions">
          <button disabled={!canGenerate || loading !== null} onClick={() => generateFiles("initial")}>
            {loading === "initial" ? "Generating..." : "Generate Initial Package"}
          </button>
          <button
            disabled={!canGenerate || !hasValidConfirmedDate || loading !== null}
            onClick={() => generateFiles("revised")}
            title={!hasValidConfirmedDate ? "Enter confirmed start date above to enable" : undefined}
          >
            {loading === "revised" ? "Generating..." : "Generate Revised Package"}
          </button>
          <button className="secondary" onClick={fillSample} disabled={loading !== null}>
            Fill sample
          </button>
        </div>

        {err ? <div className="note" style={{ color: "#b00020" }}><b>Error:</b> {err}</div> : null}

        {readyFiles.length > 0 && (
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "12px 16px", marginTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Files ready — tap each to open / save:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {readyFiles.map(({ name, url }) => (
                <a
                  key={name}
                  href={url}
                  download={name}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 14, color: "#15803d", fontWeight: 500 }}
                >
                  {name}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="note">
          <b>Initial Package:</b> Employment_Contract.pdf, Salary_Payment_Schedule.pdf, Invoice-01.pdf<br />
          <b>Revised Package:</b> Salary_Payment_Schedule_Revised.pdf, Invoice-02.pdf … Invoice-N.pdf. Enter confirmed start date above to unlock.
        </div>
      </div>
    </div>
  );
}
