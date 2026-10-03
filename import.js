import { auth, db, $ } from "./firebase.js";
import { collection, getDocs, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

$("importBtn").addEventListener("click", async () => {
    const files = [...$("importFile").files];
    if (!files.length) { $("importMsg").textContent = "Choose one or more JSON files first."; return; }
    try {
        const have = new Set((await getDocs(collection(db, "Scenarios_tbl"))).docs.map(d => d.data().destinationID + "|" + d.data().questionText));
        const batch = writeBatch(db);
        let n = 0, total = 0;
        for (const f of files) {
            const parsed = JSON.parse(await f.text());
            const items = Array.isArray(parsed) ? parsed : parsed.questions;
            if (!Array.isArray(items)) throw new Error(f.name + " has no questions list.");
            total += items.length;
            items.forEach((q, i) => {
                if (!q.destinationID || !q.questionText || !Array.isArray(q.options)) return;
                const key = q.destinationID + "|" + q.questionText;
                if (have.has(key)) return;
                have.add(key);
                batch.set(doc(collection(db, "Scenarios_tbl")), {
                    destinationID: q.destinationID, speakerNPC: q.speakerNPC || "Tourist", questionText: q.questionText,
                    introLines: (q.introLines || []).map(l => ({ isPlayerSpeaking: !!l.isPlayerSpeaking, text: l.text || "" })),
                    options: q.options.map(o => ({ text: o.text || "", scoreWeight: +o.scoreWeight || 0, reaction: o.reaction || "" })),
                    order: q.order ?? i + 1, isExtra: false, createdBy: auth.currentUser.uid, createdAt: serverTimestamp()
                });
                n++;
            });
        }
        if (n) await batch.commit();
        $("importMsg").textContent = `Imported ${n} question(s). ${total - n} skipped.`;
    } catch (err) { console.error(err); $("importMsg").textContent = "Import failed: " + err.message; }
});
