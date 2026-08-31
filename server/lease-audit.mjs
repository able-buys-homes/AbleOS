// scripts/lease-audit.mjs
// Counts which lots at Hometown Meadows actually have a lease document.
//
// Answers open question 6 in the rent collection spec. Read-only - it lists
// files and writes nothing.
//
// Run:  node scripts/lease-audit.mjs <path-to-key.json> <leases-folder-id>
import { JWT } from "google-auth-library";
import { readFileSync } from "node:fs";

const [, , keyPath, rootId] = process.argv;
if (!keyPath || !rootId) {
    console.error("Usage: node scripts/lease-audit.mjs <key.json> <folderId>");
    process.exit(1);
}

const creds = JSON.parse(readFileSync(keyPath, "utf8"));

const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});

const { token } = await auth.getAccessToken();
const headers = { Authorization: `Bearer ${token}` };

async function children(parentId) {
    const q = encodeURIComponent(`'${parentId}' in parents and trashed = false`);
    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}` +
        `&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=200` +
        `&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        { headers },
    );

    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const { files = [] } = await res.json();
    return files;
}

const FOLDER = "application/vnd.google-apps.folder";

const lots = (await children(rootId)).filter((f) => f.mimeType === FOLDER);

console.log(`Lot folders found: ${lots.length}\n`);

const withDocs = [];
const empty = [];

for (const lot of lots) {
    const files = (await children(lot.id)).filter((f) => f.mimeType !== FOLDER);

    if (files.length) {
        withDocs.push({ lot: lot.name, files });
    } else {
        empty.push(lot.name);
    }
}

console.log(`--- Lots WITH documents (${withDocs.length}) ---`);
for (const { lot, files } of withDocs) {
    console.log(`\n${lot}`);
    for (const f of files) {
        console.log(`   ${f.name}  ·  ${f.modifiedTime.slice(0, 10)}`);
    }
}

console.log(`\n--- Lots with NOTHING in them (${empty.length}) ---`);
console.log(empty.join(", ") || "none");

console.log(
    `\nSummary: ${withDocs.length} of ${lots.length} lot folders contain at least one document.`,
);