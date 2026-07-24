// One-time script: sets the { admin: true } custom claim on a Firebase Auth user.
// Run locally only. Never commit serviceAccountKey.json.
//
// Usage:
//   node scripts/set-admin-claim.mjs <FIREBASE_AUTH_UID>

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const uid = process.argv[2];

if (!uid) {
  console.error("Usage: node scripts/set-admin-claim.mjs <FIREBASE_AUTH_UID>");
  process.exit(1);
}

const keyPath = join(__dirname, "serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));

initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();

const user = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, { admin: true });

console.log(`Done. ${user.email ?? uid} now has the admin custom claim.`);
console.log("They must sign out and sign back in (or refresh their ID token) for it to take effect.");
