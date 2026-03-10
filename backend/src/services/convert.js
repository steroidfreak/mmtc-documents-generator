import { execFile } from "child_process";
import path from "path";
import fs from "fs/promises";
import { PDFDocument } from "pdf-lib";

import os from "os";
const SOFFICE = os.platform() === "win32"
  ? "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
  : "soffice";
const DEFAULT_TIMEOUT_MS = 180_000; // 3 minutes per conversion

function runExecFile(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const e = new Error(stderr || error.message);
          e.code = error.code;
          e.killed = error.killed;
          e.signal = error.signal;
          return reject(e);
        }
        resolve(stdout);
      }
    );
  });
}

export async function convertToPdfOffice(inputPath, outDir) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext !== ".docx" && ext !== ".xlsx") {
    throw new Error(`Unsupported conversion input type: ${ext || "unknown"}`);
  }

  const inputAbs = path.resolve(inputPath);
  const outDirAbs = path.resolve(outDir);

  try {
    await runExecFile(
      SOFFICE,
      ["--headless", "--convert-to", "pdf", "--outdir", outDirAbs, inputAbs],
      DEFAULT_TIMEOUT_MS
    );
  } catch (e) {
    if (e.killed || e.signal === "SIGTERM") {
      throw new Error(
        `PDF conversion failed for ${path.basename(inputPath)}.\n` +
        `LibreOffice timed out after ${Math.floor(DEFAULT_TIMEOUT_MS / 1000)}s.`
      );
    }
    throw new Error(
      `PDF conversion failed for ${path.basename(inputPath)}.\n${e.message}`
    );
  }

  const pdfName = path.basename(inputPath).replace(/\.(docx|xlsx)$/i, ".pdf");
  const pdfPath = path.join(outDir, pdfName);

  try {
    const stat = await fs.stat(pdfPath);
    if (stat.size === 0) {
      throw new Error(`PDF output is empty (0 bytes): ${pdfPath}`);
    }
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(`Expected PDF output not found: ${pdfPath}. LibreOffice conversion may have failed silently.`);
    }
    throw e;
  }

  return pdfPath;
}

/**
 * Merge multiple PDF files into one combined PDF.
 * @param {string[]} pdfPaths - ordered list of PDF file paths to merge
 * @param {string} outPath    - destination path for the combined PDF
 */
export async function mergePdfs(pdfPaths, outPath) {
  const merged = await PDFDocument.create();
  for (const pdfPath of pdfPaths) {
    const bytes = await fs.readFile(pdfPath);
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  const outBytes = await merged.save();
  await fs.writeFile(outPath, outBytes);
  return outPath;
}
