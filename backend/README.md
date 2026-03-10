# MMTC DOCX/XLSX → PDF ZIP generator

## What’s included
- Your templates are already copied into:
  - `templates/employment_contract_template.docx`
  - `templates/salary_schedule_template.xlsx`
- Backend fills DOCX + XLSX, converts both to PDF (via LibreOffice), generates invoices (PDF), then returns a ZIP.

## Prerequisites
On Windows, backend now prefers Microsoft Office automation (Word/Excel) for DOCX/XLSX → PDF.
LibreOffice is used as fallback (or primary on non-Windows).
- Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y libreoffice`
- Windows: install LibreOffice, ensure `soffice` is in PATH
- macOS: install LibreOffice, add `soffice` to PATH

## Conversion timeout tuning
LibreOffice conversion timeout defaults to 180000 ms (3 minutes).
- `LIBREOFFICE_TIMEOUT_MS` (applies to all conversions)
- `LIBREOFFICE_DOCX_TIMEOUT_MS` (overrides DOCX conversion timeout)
- `LIBREOFFICE_XLSX_TIMEOUT_MS` (overrides XLSX conversion timeout)
- `PDF_CONVERTER` (`auto` default, `office`, or `libreoffice`)

## Run (backend)
```bash
cd app/backend
npm install
npm run dev
```
Backend: http://localhost:8787

## Run (frontend)
```bash
cd app/frontend
npm install
npm run dev
```
Frontend: http://localhost:5173

## DOCX placeholders (recommended)
Add placeholders in the Word template where you want values inserted:
- {{EMPLOYER_NAME}}
- {{EMPLOYER_NRIC}}
- {{EMPLOYER_ADDRESS}}
- {{EMPLOYER_CONTACT}}
- {{FDW_NAME}}
- {{FDW_FIN}}
- {{FDW_PASSPORT}}
- {{WAGE}}
- {{CITY}}
- {{COUNTRY}}
- {{TOTAL_LOAN}}
- {{DATE}}
- {{WITNESS}}
