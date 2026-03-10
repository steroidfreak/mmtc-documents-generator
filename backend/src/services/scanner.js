import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const EXTRACT_PROMPT = `Examine this document image carefully.

Step 1 — Identify the document type by looking for text printed on the document:
- "ic" if the words "IDENTITY CARD" appear anywhere on the document (regardless of card color — may be pink, blue, or any other color)
- "passport" if it is a passport booklet or shows a passport data page
- "unknown" for anything else

Step 2 — Extract fields based on the type:
- IC: extract "employerName" (full name as printed on the card), "employerNric" (IC number, typically starts with S, T, F, or G followed by 7 digits and a letter), and "employerAddress" (residential address printed at the bottom left of the back of the card — include block, street, unit, and postal code)
- Passport: extract "fdwName" (full name as printed) and "fdwPassport" (passport number)

Return ONLY a JSON object with these keys (null for fields not applicable or not visible):
{
  "docType": "ic" | "passport" | "unknown",
  "employerName": null,
  "employerNric": null,
  "employerAddress": null,
  "fdwName": null,
  "fdwPassport": null
}

Rules:
- Copy values exactly as printed, do not guess or alter
- If you cannot read a field clearly, use null
- Return only the JSON object, no explanation`;

/**
 * Scan a single image or PDF buffer and return detected doc type + extracted fields.
 * @param {Buffer} fileBuffer
 * @param {string} mimeType - e.g. "image/jpeg", "application/pdf"
 * @returns {Promise<{docType: string, employerName: string|null, employerNric: string|null, fdwName: string|null, fdwPassport: string|null}>}
 */
export async function scanDocument(fileBuffer, mimeType) {
  const base64Data = fileBuffer.toString("base64");

  const contentBlock =
    mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data: base64Data } };

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: [contentBlock, { type: "text", text: EXTRACT_PROMPT }] }],
  });

  const raw = message.content[0]?.text ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");
  return JSON.parse(jsonMatch[0]);
}
