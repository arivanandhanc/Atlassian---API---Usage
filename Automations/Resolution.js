// server.js
import express from "express";
import axios from "axios";
import crypto from "crypto";

const app = express();

// Capture raw body for HMAC verification
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

// ---- Config ----
const TARGET = new Set(["Resolved", "Declined", "Cancelled", "Completed & Deployed","Done"]);
const {
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  FIELD_ID,
  WEBHOOK_SECRET, // set this in Jira webhook/automation too
  PORT
} = process.env;
const fieldId = FIELD_ID || "customfield_10081";

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.warn("⚠️ Missing env: JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN");
}

// Jira client
const http = axios.create({
  baseURL: JIRA_BASE_URL,
  auth: { username: JIRA_EMAIL, password: JIRA_API_TOKEN },
  timeout: 15000
});

// ---- Security helpers ----
function timingSafeEqual(a, b) {
  try {
    const A = Buffer.from(a || "");
    const B = Buffer.from(b || "");
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
  } catch { return false; }
}
function computeSig(secret, raw) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
}
function verifySignature(req) {
  if (!WEBHOOK_SECRET) return true; // disabled if not set
  const raw = req.rawBody || Buffer.from("");
  const expected = computeSig(WEBHOOK_SECRET, raw);
  const headers = [
    req.get("x-hub-signature-256"),
    req.get("x-hub-signature"),
    req.get("x-atlassian-webhook-signature"),
    req.get("x-signature"),
    req.get("x-jira-signature")
  ].filter(Boolean);
  if (headers.length === 0) return false;
  return headers.some(h => timingSafeEqual(h, expected));
}

// ---- De-dupe (retry loop protection) ----
const seen = new Map(); // key -> expiresAt
function oncePerInterval(key, ms = 60_000) {
  const now = Date.now();
  const exp = seen.get(key) || 0;
  if (exp > now) return false;
  seen.set(key, now + ms);
  // occasional cleanup
  if (seen.size > 5000) for (const [k, v] of seen) if (v < now) seen.delete(k);
  return true;
}

// ---- Timestamp resolution ----
// Prefer Jira's own transition time; fallback to changelog; then issue.updated; then now.
async function getStatusChangeISO(key, currentStatus) {
  const { data } = await http.get(`/rest/api/3/issue/${key}?expand=changelog`);
  const histories = data?.changelog?.histories || [];
  for (let i = histories.length - 1; i >= 0; i--) {
    const h = histories[i];
    const item = (h.items || []).find(it => it.field === "status");
    if (item && item.toString === currentStatus) return h.created; // ISO from Jira
  }
  return data?.fields?.updated || new Date().toISOString();
}

// ---- Handler ----
const handler = async (req, res) => {
  // 1) Verify signature (if enabled)
  if (!verifySignature(req)) {
    console.warn("❌ Invalid or missing webhook signature");
    return res.status(401).send("Invalid signature");
  }

  // 2) Basic parsing
  const issue = req.body?.issue;
  const key = issue?.key;
  const status = issue?.fields?.status?.name;

  console.log(`➡️ Webhook: key=${key} status=${status}`);

  // If Jira sent changelog with webhook, ensure it's actually a status change
  const isStatusChange = req.body?.changelog?.items?.some(
    it => it.field === "status" && it.toString === status
  );
  // If changelog exists and it wasn't a status change, ignore early
  if (req.body?.changelog && !isStatusChange) {
    console.log("↩️ Ignored (no status change in changelog)");
    return res.status(200).send("Ignored");
  }

  if (!key || !TARGET.has(status)) {
    console.log("↩️ Ignored (no key or status not target)");
    return res.status(200).send("Ignored");
  }

  // 3) De-dupe to avoid retries / loops
  const sig = `${key}::${status}`;
  if (!oncePerInterval(sig, 60_000)) {
    console.log("⏳ Duplicate within 60s, ignoring", sig);
    return res.status(200).send("Ignored");
  }

  try {
    // 4) Get authoritative timestamp
    const when = issue?.fields?.statuscategorychangedate
      || (await getStatusChangeISO(key, status));

    // 5) Read current field
    const { data: cur } = await http.get(`/rest/api/3/issue/${key}?fields=${fieldId}`);
    const currentVal = cur?.fields?.[fieldId];

    if (currentVal === when) {
      console.log(`↩️ Already latest for ${key} (${when}), no change`);
      return res.status(200).send("No change");
    }

    // 6) Clear then set (overwrite). If clear not allowed, continue to set.
    try {
      await http.put(`/rest/api/3/issue/${key}`, { fields: { [fieldId]: null } });
      console.log(`🧹 Cleared ${fieldId} for ${key}`);
    } catch {
      console.warn(`⚠️ Clear not allowed for ${key}, will overwrite directly`);
    }

    await http.put(`/rest/api/3/issue/${key}`, { fields: { [fieldId]: when } });
    console.log(`✅ Updated ${key}: ${fieldId} = ${when}`);

    return res.status(200).send("Updated");
  } catch (e) {
    console.error("❌ Handler error:", e?.response?.data || e.message);
    return res.status(500).send("Error");
  }
};

// Routes
app.post(["/api/webhook", "/"], handler);
app.get("/", (_req, res) => {
  res.status(200).send(html);
});


// Local run
if (!process.env.VERCEL) {
  const p = PORT || 3000;
  app.listen(p, () => console.log(`🚀 Local server on http://localhost:${p}`));
}

// Export for Vercel
export default (req, res) => app(req, res);