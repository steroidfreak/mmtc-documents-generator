import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import os from "os";
import multer from "multer";

import { buildContractDocx } from "./services/contract.js";
import { buildScheduleXlsx } from "./services/schedule.js";
import { generateInvoices } from "./services/invoices.js";
import { convertToPdfOffice } from "./services/convert.js";
import { scanDocument } from "./services/scanner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/api/scan", upload.array("files", 10), async (req, res) => {
  if (!req.files?.length) return res.status(400).send("No files uploaded or unsupported file type (allowed: jpg, png, webp, pdf)");
  try {
    const results = await Promise.all(
      req.files.map((f) => scanDocument(f.buffer, f.mimetype).then((r) => ({ filename: f.originalname, ...r })))
    );
    res.json(results);
  } catch (e) {
    console.error("Scan error:", e.message);
    res.status(500).send(e?.message ?? String(e));
  }
});

app.post("/api/generate", async (req, res) => {
  const input = req.body ?? {};
  const stage = input.stage === "revised" ? "revised" : "initial";

  const required = ["employerName","employerNric","employerAddress","employerContact","fdwName","fdwPassport"];
  for (const k of required) {
    if (!String(input[k] ?? "").trim()) return res.status(400).send(`Missing field: ${k}`);
  }

  let tempDir;
  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mmtc-gen-"));
  } catch (e) {
    return res.status(500).send(`Failed to create temp directory: ${e.message}`);
  }

  const outDir = path.join(tempDir, "out");
  await fs.mkdir(outDir, { recursive: true });

  try {
    const templatesDir = path.join(__dirname, "..", "templates");
    const entries = []; // { name, filePath }

    if (stage === "initial") {
      const [contractDocxPath, scheduleXlsxPath] = await Promise.all([
        buildContractDocx({ templatesDir, outDir, data: input }),
        buildScheduleXlsx({ templatesDir, outDir, data: input }),
      ]);

      const [contractPdfPath, schedulePdfPath, invoiceXlsxPaths] = await Promise.all([
        convertToPdfOffice(contractDocxPath, outDir),
        convertToPdfOffice(scheduleXlsxPath, outDir),
        generateInvoices({ templatesDir, outDir, data: input, startSeq: 1, endSeq: 1 }),
      ]);

      const invoicePdfPaths = await Promise.all(
        invoiceXlsxPaths.map((p) => convertToPdfOffice(p, outDir))
      );

      entries.push(
        { name: "Employment_Contract.pdf", filePath: contractPdfPath },
        { name: "Salary_Payment_Schedule.pdf", filePath: schedulePdfPath },
      );
      for (const p of invoicePdfPaths) {
        entries.push({ name: path.basename(p), filePath: p });
      }
    } else {
      const scheduleXlsxPath = await buildScheduleXlsx({ templatesDir, outDir, data: input });

      const [schedulePdfPath, invoiceXlsxPaths] = await Promise.all([
        convertToPdfOffice(scheduleXlsxPath, outDir),
        generateInvoices({ templatesDir, outDir, data: input, startSeq: 2 }),
      ]);

      const invoicePdfPaths = await Promise.all(
        invoiceXlsxPaths.map((p) => convertToPdfOffice(p, outDir))
      );

      entries.push({ name: "Salary_Payment_Schedule_Revised.pdf", filePath: schedulePdfPath });
      for (const p of invoicePdfPaths) {
        entries.push({ name: path.basename(p), filePath: p });
      }
    }

    // Return all files as base64 in a JSON array
    const files = await Promise.all(
      entries.map(async ({ name, filePath }) => ({
        name,
        data: (await fs.readFile(filePath)).toString("base64"),
      }))
    );

    res.json({ files });
  } catch (e) {
    console.error("Generation error:", e.message);
    if (!res.headersSent) res.status(500).send(e?.message ?? String(e));
    else res.destroy();
  } finally {
    if (tempDir) fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

// Serve built frontend in production
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
import { existsSync } from "fs";
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(PORT, () => console.log(`MMTC backend listening on http://localhost:${PORT}`));
