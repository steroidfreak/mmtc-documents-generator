import fs from "fs/promises";
import path from "path";
import PizZip from "pizzip";

function fmtDateLong(d) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/,/g, "");
}

function decodeXmlText(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function encodeXmlText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Robust text replacement strategy:
 * 1. Extract all <w:t> nodes from the XML
 * 2. Build a concatenated "flat text" from all nodes
 * 3. For each replacement, find the target string in the flat text
 * 4. Map character positions back to individual <w:t> nodes
 * 5. Splice the replacement across the affected nodes
 *
 * This handles Word's arbitrary text splitting across runs.
 */
function updateContractXml(xml, data) {
  const nodeRegex = /<w:t(?!\w)([^>]*)>([\s\S]*?)<\/w:t>/g;
  const nodes = [...xml.matchAll(nodeRegex)];
  if (!nodes.length) return xml;

  // Decode all node texts
  const texts = nodes.map((m) => decodeXmlText(m[2]));

  // Build flat text and offset map: flatText[charIdx] -> { nodeIdx, localIdx }
  let flatText = "";
  const charMap = []; // charMap[flatIdx] = { node, local }
  for (let n = 0; n < texts.length; n++) {
    for (let c = 0; c < texts[n].length; c++) {
      charMap.push({ node: n, local: c });
      flatText += texts[n][c];
    }
  }

  // Track which character ranges have been replaced
  const replaced = new Set();

  function applyReplacement(find, value) {
    const idx = flatText.indexOf(find);
    if (idx < 0) return false;

    // Check if any part of this range was already replaced
    for (let i = idx; i < idx + find.length; i++) {
      if (replaced.has(i)) return false;
    }

    const startMap = charMap[idx];
    const endMap = charMap[idx + find.length - 1];

    // Put full replacement in the first affected node at the start position
    const before = texts[startMap.node].substring(0, startMap.local);
    const after = texts[endMap.node].substring(endMap.local + 1);
    texts[startMap.node] = before + value + (startMap.node === endMap.node ? after : "");

    // Clear intermediate and end nodes' affected portions
    if (startMap.node !== endMap.node) {
      for (let n = startMap.node + 1; n < endMap.node; n++) {
        texts[n] = "";
      }
      texts[endMap.node] = after;
    }

    // Mark range as replaced
    for (let i = idx; i < idx + find.length; i++) replaced.add(i);
    return true;
  }

  // Employer fields — the template has blank value slots after each label.
  // Walk forward from the label node to find the separator (contains ':'),
  // then set the first whitespace-only node to the value.
  // Falls back to placeholder-text replacement for older template versions.
  function setFieldAfterLabel(labelText, value, maxIdx = 40) {
    const labelIdx = texts.findIndex((t, i) => i < maxIdx && t.trim() === labelText);
    if (labelIdx < 0) return false;
    let sepFound = false;
    let sepText = "";
    for (let j = labelIdx + 1; j < Math.min(labelIdx + 8, texts.length); j++) {
      const t = texts[j];
      if (!sepFound) {
        if (t.includes(":")) { sepFound = true; sepText = t; }
        continue;
      }
      if (/^\s*$/.test(t)) {
        // If separator doesn't end with a space, preserve leading space so output is "Label: value"
        const prefix = sepText.endsWith(" ") ? "" : " ";
        texts[j] = prefix + value;
        // Clear any extra trailing whitespace nodes belonging to the same blank field
        for (let k = j + 1; k < Math.min(j + 4, texts.length); k++) {
          if (/^\s+$/.test(texts[k])) texts[k] = "";
          else break;
        }
        return true;
      }
      break; // non-whitespace means template already has content — give up
    }
    return false;
  }

  const salutation = String(data.employerSalutation ?? "Mr.");
  const employerNameOnly = String(data.employerName ?? "");
  const fullName = `${salutation} ${employerNameOnly}`.trim();

  if (!setFieldAfterLabel("The employer", fullName)) {
    applyReplacement("Mr. Tan Thi Thu", fullName) || applyReplacement("Tan Thi Thu", employerNameOnly);
  }
  if (!setFieldAfterLabel("NRIC No", String(data.employerNric ?? ""))) {
    applyReplacement("Sxxxx589J", String(data.employerNric ?? ""));
  }
  if (!setFieldAfterLabel("Address", String(data.employerAddress ?? ""))) {
    applyReplacement("Blk 457 Ang Mo Kio Ave 10, #13-1502 SINGAPORE 560457", String(data.employerAddress ?? "")) ||
    applyReplacement("Blk 457 Ang Mo Kio Ave 10, #13-1502 Singapore 560457", String(data.employerAddress ?? "")) ||
    applyReplacement("Blk 457 Ang Mo Kio Ave 10", String(data.employerAddress ?? ""));
  }
  if (!setFieldAfterLabel("Contact", String(data.employerContact ?? ""))) {
    applyReplacement("+65 8239 9081", String(data.employerContact ?? ""));
  }

  // FDW name appears multiple times (body + signature)
  const fdwName = String(data.fdwName ?? "");
  let searchFrom = 0;
  while (true) {
    const idx = flatText.indexOf("Thandar Lwin", searchFrom);
    if (idx < 0) break;
    const startMap = charMap[idx];
    const endMap = charMap[idx + "Thandar Lwin".length - 1];
    const before = texts[startMap.node].substring(0, startMap.local);
    const after = texts[endMap.node].substring(endMap.local + 1);
    texts[startMap.node] = before + fdwName + (startMap.node === endMap.node ? after : "");
    if (startMap.node !== endMap.node) {
      for (let n = startMap.node + 1; n < endMap.node; n++) texts[n] = "";
      texts[endMap.node] = after;
    }
    searchFrom = idx + "Thandar Lwin".length;
  }

  // Passport: replace "MK087062" or just "K087062" with prefix handling
  const passport = String(data.fdwPassport ?? "");
  if (!applyReplacement("MK087062", passport)) {
    applyReplacement("K087062", passport);
  }

  // Monthly wage
  applyReplacement("550", String(data.monthlyWage ?? 550));

  // Total loan "2400" (may be split as "240" + "0")
  applyReplacement("2400", String(data.totalLoan ?? 2400));

  // City & country of origin
  applyReplacement("Yangon", String(data.cityOfOrigin ?? "Yangon"));
  applyReplacement("Myanmar ", String(data.countryOfOrigin ?? "Myanmar") + " ");

  // Declaration date → today
  applyReplacement("20 Jan 2026", fmtDateLong(new Date()));

  // Rebuild XML with updated texts
  let cursor = 0;
  return xml.replace(nodeRegex, (full, attrs) => {
    const text = encodeXmlText(texts[cursor]);
    cursor++;
    return `<w:t${attrs}>${text}</w:t>`;
  });
}

/**
 * Remove any paragraph in the document body that contains an embedded image
 * (r:embed="..."). This strips the payment schedule image that was hardcoded
 * in the template for a specific customer.
 */
function removeImageParagraphs(xml) {
  let result = xml;
  let searchFrom = 0;
  while (true) {
    const embedIdx = result.indexOf('r:embed="', searchFrom);
    if (embedIdx < 0) break;

    // Find the opening <w:p ...> that encloses this image reference
    let pStart = result.lastIndexOf("<w:p ", embedIdx);
    const pStartExact = result.lastIndexOf("<w:p>", embedIdx);
    if (pStartExact > pStart) pStart = pStartExact;

    // Find the closing </w:p> that follows
    const pEnd = result.indexOf("</w:p>", embedIdx);
    if (pStart >= 0 && pEnd >= 0) {
      result = result.substring(0, pStart) + result.substring(pEnd + "</w:p>".length);
      searchFrom = pStart;
    } else {
      searchFrom = embedIdx + 1;
    }
  }
  return result;
}

export async function buildContractDocx({ templatesDir, outDir, data }) {
  const tplPath = path.join(templatesDir, "employment_contract_template.docx");

  let buf;
  try {
    buf = await fs.readFile(tplPath);
  } catch (e) {
    throw new Error(`Contract template not found at ${tplPath}: ${e.message}`);
  }

  const zip = new PizZip(buf);
  const docXml = zip.file("word/document.xml")?.asText();
  if (!docXml) {
    throw new Error("Contract template is invalid — missing word/document.xml");
  }

  const cleanedXml = removeImageParagraphs(docXml);
  zip.file("word/document.xml", updateContractXml(cleanedXml, data));

  const outBuf = zip.generate({ type: "nodebuffer" });
  const outPath = path.join(outDir, "Employment_Contract_filled.docx");
  await fs.writeFile(outPath, outBuf);
  return outPath;
}
