// Free password reset (no Blaze plan needed). Run on YOUR computer.
//   One-time setup:
//     1) npm install firebase-admin
//     2) Firebase Console > Project settings > Service accounts > Generate new private key
//        Save it in this folder as serviceAccountKey.json (never upload it to GitHub)
//   Reset a STUDENT:   node reset-password.js 2023123456 NewPass123
//   Reset a TEACHER:   node reset-password.js 2023123456 NewPass123 staff
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require("./serviceAccountKey.json")) });
const [id, pass, kind] = process.argv.slice(2);
if (!/^\d{10}$/.test(id || "") || !pass || pass.length < 8) {
  console.log("Usage: node reset-password.js <10-digit ID> <new password, 8+ characters> [staff]");
  process.exit(1);
}
const email = id + (kind === "staff" ? "@staff.dejaview.app" : "@dejaview.app");
admin.auth().getUserByEmail(email)
  .then(u => admin.auth().updateUser(u.uid, { password: pass }))
  .then(() => { console.log("Done. They can now log in with the new password."); process.exit(0); })
  .catch(e => { console.log("Failed:", e.message); process.exit(1); });
