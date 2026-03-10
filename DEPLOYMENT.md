# MMTC Document Generator — Deployment Guide

This guide covers how to set up the application on a new Windows PC or VPS (Windows Server).

---

## What You Need to Copy

Copy the entire project folder to the new machine. The essential files are:

```
mmtc-documents-generator/
├── backend/
│   ├── src/
│   ├── templates/          ← required (contract/schedule/invoice templates)
│   ├── .env                ← required (API key)
│   ├── package.json
│   └── package-lock.json
└── frontend/
    ├── src/
    ├── index.html
    ├── package.json
    └── package-lock.json
```

> **Do NOT copy `node_modules/`** — these will be reinstalled fresh on the new machine.

---

## Step 1 — Install Prerequisites

### 1a. Node.js (v18 or later)

Download from: https://nodejs.org
Choose the **LTS** version. Install with default settings.

Verify after install:
```cmd
node -v
npm -v
```

### 1b. LibreOffice

Download from: https://www.libreoffice.org/download/libreoffice-still/
Install with default settings.

The app expects LibreOffice at this exact path:
```
C:\Program Files\LibreOffice\program\soffice.exe
```

If your installation is in a different location, update this line in `backend/src/services/convert.js`:
```js
const SOFFICE = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
```

---

## Step 2 — Install Dependencies

Open a terminal (Command Prompt or PowerShell) and run:

```cmd
cd path\to\mmtc-documents-generator\backend
npm install

cd ..\frontend
npm install
```

---

## Step 3 — Configure Environment

In `backend/.env`, set your Anthropic API key (needed for document scanning):

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Get your key from: https://console.anthropic.com → API Keys

---

## Step 4 — Build the Frontend

The frontend needs to be built for production:

```cmd
cd path\to\mmtc-documents-generator\frontend
npm run build
```

This creates a `frontend/dist/` folder with the compiled static files.

---

## Step 5 — Serve the Frontend from the Backend

Instead of running two separate processes, you can serve the built frontend from the backend.

Add this to `backend/src/server.js` just before `app.listen(...)`:

```js
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Serve built frontend
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
app.use(express.static(frontendDist));
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});
```

Then open `frontend/src/App.tsx` and change the API base URL so it uses the same origin:

```ts
const API_BASE = import.meta.env.VITE_API_BASE ?? "";
```

Rebuild the frontend after this change:
```cmd
cd frontend
npm run build
```

---

## Step 6 — Run the Backend

```cmd
cd path\to\mmtc-documents-generator\backend
node src/server.js
```

The app will be available at: **http://localhost:8787**

---

## Step 7 (Optional) — Keep It Running with PM2

PM2 keeps the server running in the background and auto-restarts on crashes.

Install PM2:
```cmd
npm install -g pm2
```

Start the backend:
```cmd
cd path\to\mmtc-documents-generator\backend
pm2 start src/server.js --name mmtc-backend
```

Auto-start on Windows login:
```cmd
pm2 startup
pm2 save
```

Useful PM2 commands:
```cmd
pm2 status          # check if running
pm2 logs mmtc-backend   # view logs
pm2 restart mmtc-backend
pm2 stop mmtc-backend
```

---

## Step 8 (Optional) — Access from Other Devices on the Same Network

By default the app only listens on localhost. To allow other computers on the same network:

Change this line in `backend/src/server.js`:
```js
app.listen(PORT, () => ...);
```
to:
```js
app.listen(PORT, "0.0.0.0", () => ...);
```

Then allow port 8787 through Windows Firewall:
```cmd
netsh advfirewall firewall add rule name="MMTC App" dir=in action=allow protocol=TCP localport=8787
```

Other devices access the app at: `http://<this-machine-ip>:8787`

---

## Step 9 (Optional) — Custom Port

Set a different port in `backend/.env`:
```
PORT=3000
```

---

## Quick Checklist

| | Item |
|---|---|
| ☐ | Node.js v18+ installed |
| ☐ | LibreOffice installed at default path |
| ☐ | `backend/node_modules/` installed (`npm install`) |
| ☐ | `frontend/node_modules/` installed (`npm install`) |
| ☐ | `backend/.env` has valid `ANTHROPIC_API_KEY` |
| ☐ | Frontend built (`npm run build` in frontend folder) |
| ☐ | Backend running (`node src/server.js`) |
| ☐ | App opens at http://localhost:8787 |
