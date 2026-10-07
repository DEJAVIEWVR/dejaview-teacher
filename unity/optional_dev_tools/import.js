import { auth, db, $ } from "./firebase.js";
import { collection, getDocs, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { toast, ask, niceError, busy } from "./toast.js";

$("importFile").addEventListener("change", () => {
    const n = $("importFile").files.length;
    if (n) toast(`${n} file${n > 1 ? "s" : ""} selected. Press Import.`, "info");
});

$("importBtn").addEventListener("click", e => busy(e.currentTarget, async () => {
    const files = [...$("importFile").files];
    if (!files.length) return toast("Choose one or more JSON files first.", "warn");
    const notJson = files.find(f => !/\.json$/i.test(f.name));
    if (notJson) return toast(`${notJson.name} is not a .json file.`, "err");
    const huge = files.find(f => f.size > 2 * 1024 * 1024);
    if (huge) return toast(`${huge.name} is too large (maximum 2 MB).`, "err");

    try {
        const have = new Set((await getDocs(collection(db, "Scenarios_tbl"))).docs.map(d => d.data().destinationID + "|" + d.data().questionText));
        const fresh = [];
        let total = 0, invalid = 0;
        for (const f of files) {
            let parsed;
            try { parsed = JSON.parse(await f.text()); } catch (er) { return toast(`${f.name} is not valid JSON.`, "err"); }
            const items = Array.isArray(parsed) ? parsed : parsed.questions;
            if (!Array.isArray(items)) return toast(`${f.name} has no questions list.`, "err");
            total += items.length;
            items.forEach((q, i) => {
                if (!q.destinationID || !q.questionText || !Array.isArray(q.options)) { invalid++; return; }
                const key = q.destinationID + "|" + q.questionText;
                if (have.has(key)) return;
                have.add(key);
                fresh.push({
                    destinationID: String(q.destinationID), speakerNPC: q.speakerNPC || "Tourist", questionText: String(q.questionText).slice(0, 400),
                    introLines: (q.introLines || []).map(l => ({ isPlayerSpeaking: !!l.isPlayerSpeaking, text: l.text || "" })),
                    options: q.options.map(o => ({ text: o.text || "", scoreWeight: +o.scoreWeight || 0, reaction: o.reaction || "" })),
                    keyPoints: q.keyPoints || "", order: q.order ?? i + 1, isExtra: false
                });
            });
        }
        const skipped = total - fresh.length - invalid;
        if (!fresh.length) return toast(`Nothing new to import. ${skipped} already in the bank${invalid ? `, ${invalid} invalid` : ""}.`, "warn");
        if (!(await ask(`Import ${fresh.length} new question(s)? ${skipped} duplicate(s)${invalid ? ` and ${invalid} invalid item(s)` : ""} will be skipped.`, { title: "Import questions", ok: "Import" }))) return;

        for (let i = 0; i < fresh.length; i += 400) {   // a batch holds up to 500 writes
            const batch = writeBatch(db);
            fresh.slice(i, i + 400).forEach(q => batch.set(doc(collection(db, "Scenarios_tbl")), { ...q, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }));
            await batch.commit();
        }
        $("importFile").value = "";
        $("importMsg").textContent = `Imported ${fresh.length} question(s). ${skipped} skipped.`;
        toast(`Imported ${fresh.length} question(s). ${skipped} skipped.`);
    } catch (err) { console.error(err); toast("Import failed. " + niceError(err, err.message), "err"); }
}));
