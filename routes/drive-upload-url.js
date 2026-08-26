// api/drive-upload-url.js
// Mints a Google Drive resumable-upload session for a given side + stage.
// The browser then PUTs the photo bytes straight to Google, so the file
// never passes through Vercel (avoiding the 4.5MB body limit).

import { JWT } from "google-auth-library";
import { requireUser, requireCockpit } from "../lib/apiAuth.js";

const SIDE_A = {
    "Before Teardown Photos": "1yEyYGh0KzmQbOk_qSMPI5yZXY9HroS6G",
    "Demo": "1XJ73f5dfUlLnPwiSgEamtPPTKKacfm44",
    "Structural Repair": "1obTNQBdTNID2DDpGrJPrObHCoQCSLFbJ",
    "Framing": "1eV6HPBte0RDyaFH2dQ9qBkrWfzBCCJpx",
    "Wiring": "15T2k6r3q6KNjUNcnUtIXwuXfxh2jbTcf",
    "Mini Split Rough-In": "1fKOTyY_lMTu5871xMS28w4wuU9tdvNDi",
    "Insulation": "1mLe-1GH2OXw1Af1dNr__jIy-3A8FjWPY",
    "Drywall": "1yHcGHNNsfATkokC2Tb_xCZwd4R17iU76",
    "Paint (Interior)": "1uumBTDkOQP6grQb9Zg2rBEoFl4u-Gr9B",
    "Flooring": "17wfbFN_apfkwVmTRGv730clUaeaqzZIs",
    "Cabinets/Countertops": "1XXmnzwfOdydb8gfH475WTt8Ry8TLcNNO",
    "Bathrooms": "186R4wgNbzvab09YQefglrlyzMVEW68WL",
    "Baseboard/Trim": "1ta_Z4UQGQ-OhcLoGPU6sa0GSJ1Q7urYY",
    "Mini Split Set + Commission": "1X25W4afcNjUrM_t_-0SCdxaGrR8BP90u",
    "Finishing Fixtures": "1YXcPgqV8m30Q9G0La7-KWyygPg80OLTu",
    "Final Finished Pics": "1pgYVRn_dsYLVNbaT-ohtU1aIIQy07-Xq",
    "Siding": "106I_2iFBGF4oJzVQRrvP0O_yjPrVyw_s",
    "Skirting + Trim": "1VAJps3Wc02gWE4OtalJcDINq3z5xY6fp",
    "Deck + Steps": "1nEgL1_f9Zga5gVg-NgtH_rgc136kcOAp",
    "Paint (Exterior)": "1T77c7vsx5Bc327F3Fn6AucHB4EA6O0wt",
    "Curb Appeal/Landscape": "1NRuZkh6cSzLMGZ7C38iuC4ZV65vAZ2Ag",
};

const SIDE_B = {
    "Before Teardown Photos": "1sdVIwyfecjrEZTP8yPKe4p4q_QieUiRW",
    "Demo": "1d8Uhm1qV7Ox_Oz5qok9gx-nctXpghqhv",
    "Structural Repair": "1UOHnOM_VSaxTl3egkroIC4XhJ_HzYfL5",
    "Framing": "17R0dbFj24Fs5C0xCcyE3SLQC8PUVfCq0",
    "Wiring": "1tHJ61_QcyxNlgprgwmdfqGj2yvsNzeCV",
    "Mini Split Rough-In": "1xMYJDcKBtGYopSFjFIYBPg2bhL1ANq1A",
    "Insulation": "143YjHCG2hi0IIN367r1_wkQTCnuhdrKQ",
    "Drywall": "1RYwvERWYBNmP2q9rCBBiqU_-I6AuYNmv",
    "Paint (Interior)": "1CDbpyWlgW2pkKMhtVFPehAcn0Ip6lhJr",
    "Flooring": "1E46ESjsGH27SA2aox7OAotpL9I8xJact",
    "Cabinets/Countertops": "1nhiXMBExAA9LIXnKsG9Aw_sUOQs4oRs9",
    "Bathrooms": "1rf9sMsaeQpxnTzcyYudxA8nrGDrPsN5E",
    "Baseboard/Trim": "1iKsiLSDpMrdJe7MUcRS1tqSt0slWrM8j",
    "Mini Split Set + Commission": "1D21wuSMq4I93pdtir0LViI8g9LG1a4jZ",
    "Finishing Fixtures": "135LSQBUb1s5nKS61oPcNIIb0_yLXoORk",
    "Final Finished Pics": "1Avv2yox-PXBXQvARSTV84aisb_j0blMF",
    "Siding": "1K5Wc3qi8od8Uu_d3JWvE13Qocqc2vtYY",
    "Skirting + Trim": "1uSOxoVJ3PuUvGWV-YcsvSNbz5JNl1J2x",
    "Deck + Steps": "1R1To8DlLjtbIO_m-Q7duTgHJN9f1fjFH",
    "Paint (Exterior)": "12UvRbpAIxJ-LXQw_XB-Bwpx8bX7hNpoc",
    "Curb Appeal/Landscape": "10aLd6HafddCNwsVHvmRb3lU7DWWxT9bN",
};

function normalize(name) {
    return String(name)
        .toLowerCase()
        .replace(/[\u2010-\u2015]/g, "-")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function buildIndex(map) {
    const index = {};
    for (const [name, id] of Object.entries(map)) index[normalize(name)] = id;
    return index;
}

const INDEX_A = buildIndex(SIDE_A);
const INDEX_B = buildIndex(SIDE_B);

function getFolderId(side, stageName) {
    const key = String(side || "").trim().toUpperCase().replace("SIDE ", "");
    const index = key === "B" ? INDEX_B : key === "A" ? INDEX_A : null;
    if (!index) return null;
    return index[normalize(stageName)] || null;
}

let cachedClient = null;

function getJwtClient() {
    if (cachedClient) return cachedClient;

    const b64 = process.env.GOOGLE_SA_KEY_B64;
    if (!b64) throw new Error("GOOGLE_SA_KEY_B64 is not set");

    // Accept raw JSON or base64 - the value differs between deployments.
    const text = b64.trim().startsWith("{")
        ? b64
        : Buffer.from(b64, "base64").toString("utf8");
    const creds = JSON.parse(text);

    cachedClient = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ["https://www.googleapis.com/auth/drive"],
    });

    return cachedClient;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    let caller;
    try {
        caller = await requireUser(req);
        // Only the two crew leads upload stage photos.
        requireCockpit(caller.profile, ["colton", "zo"]);
    } catch (err) {
        return res
            .status(err?.status || 401)
            .json({ error: err?.message || "Not authorised" });
    }

    try {
        const { side, stageName, mimeType, ext } = req.body || {};

        // Colton can only write to Side A, Zo only to Side B.
        const ownSide = caller.profile.cockpit === "colton" ? "A" : "B";
        const requestedSide = String(side || "").trim().toUpperCase().replace("SIDE ", "");
        if (requestedSide !== ownSide) {
            return res.status(403).json({ error: "You can only upload to your own side" });
        }

        if (!side || !stageName) {
            return res.status(400).json({ error: "side and stageName are required" });
        }

        const folderId = getFolderId(side, stageName);
        if (!folderId) {
            return res
                .status(400)
                .json({ error: `No Drive folder mapped for side ${side} / "${stageName}"` });
        }

        const client = getJwtClient();
        const { token } = await client.getAccessToken();
        if (!token) throw new Error("Could not obtain a Google access token");

        const safeStage = String(stageName).replace(/[^a-zA-Z0-9]+/g, "-");
        const safeExt = /^[a-zA-Z0-9]{1,5}$/.test(ext || "") ? ext : "jpg";
        const fileName = `Side${String(side).toUpperCase().replace("SIDE ", "")}-${safeStage}-${Date.now()}.${safeExt}`;

        const origin = req.headers.origin || "http://localhost:3000";

        const initRes = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "X-Upload-Content-Type": mimeType || "image/jpeg",
                    // Google only enables CORS on the resumable session when the
                    // initiation request declares the origin that will PUT the bytes.
                    Origin: origin,
                },
                body: JSON.stringify({ name: fileName, parents: [folderId] }),
            },
        );

        if (!initRes.ok) {
            const detail = await initRes.text();
            console.error("Drive session init failed:", initRes.status, detail);
            return res.status(502).json({
                error: `Drive rejected the upload session (${initRes.status})`,
                detail: detail.slice(0, 400),
            });
        }

        const uploadUrl = initRes.headers.get("location");
        if (!uploadUrl) {
            return res.status(502).json({ error: "Drive did not return an upload URL" });
        }

        return res.status(200).json({
      uploadUrl,
      fileName,
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    });
    } catch (err) {
        console.error("drive-upload-url error:", err);
        return res.status(500).json({ error: err.message || "Unknown server error" });
    }
}

export { SIDE_A, SIDE_B, getFolderId };