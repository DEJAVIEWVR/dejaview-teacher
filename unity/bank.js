import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { DESTS, MAX_EXTRA } from "./destinations.js";
import { printHtml } from "./report.js";
import { toast, ask, niceError, busy } from "./toast.js";

let qs = [], quota = {}, editing = null;
const sel = $("bankDest");
sel.innerHTML = DESTS.map(d => `<option>${esc(d)}</option>`).join("");

onAuthStateChanged(auth, u => { if (u) refresh(); });

async function refresh() {
    try {
        const [q, l] = await Promise.all([getDocs(collection(db, "Scenarios_tbl")), getDocs(collection(db, "levels"))]);
        qs = q.docs.map(d => ({ id: d.id, ...d.data() }));
        quota = {};
        l.docs.forEach(d => quota[d.data().name] = d.data().extraWaypoints ?? MAX_EXTRA);
        render();
    } catch (err) { console.error(err); $("bankList").innerHTML = "<p>Unable to load questions.</p>"; toast(niceError(err, "Unable to load the question bank."), "err"); }
}

const listFor = d => qs.filter(x => x.destinationID === d).sort((a, b) => (a.isExtra ? 1 : 0) - (b.isExtra ? 1 : 0) || (a.order || 0) - (b.order || 0));

function render() {
    const d = sel.value, list = listFor(d);
    const used = list.filter(x => x.isExtra).length, max = quota[d] ?? MAX_EXTRA;
    $("bankQuota").textContent = `${list.length} question(s) for this destination. Your extra questions: ${used} of ${max} allowed (extra stops where you can add your own question).`;
    $("addQ").disabled = used >= max;
    $("addQ").title = used >= max ? "No extra stops left. Ask the admin for more." : "";
    $("bankList").innerHTML = list.map((x, n) => `<div class="qcard"><div class="qtop">
        <span class="chip">${n + 1}. ${esc(x.speakerNPC || "Tourist")}${x.isExtra ? " · Extra" : ""}</span>
        <span><button class="edit-button" data-q="edit" data-id="${x.id}">Edit</button>
        ${x.isExtra ? `<button class="delete-button" data-q="del" data-id="${x.id}">Delete</button>` : ""}</span></div>
        <p>${esc(x.questionText)}</p>
        ${x.keyPoints ? `<div class="key"><b>Key points:</b> ${esc(x.keyPoints)}</div>` : '<div class="hint">No key points yet. Click Edit to add what a good answer includes.</div>'}
        </div>`).join("") || "<p>No questions for this destination yet.</p>";
}

function openForm(x) {
    editing = x || null;
    $("qTitle").textContent = x ? "Edit question" : "Add question to " + sel.value;
    $("qSpeaker").value = x?.speakerNPC || "Tourist";
    $("qText").value = x?.questionText || "";
    $("qKey").value = x?.keyPoints || "";
    $("qDialog").showModal();
}

$("qForm").addEventListener("submit", async e => {
    e.preventDefault();
    const text = $("qText").value.trim(), speaker = $("qSpeaker").value.trim(), key = $("qKey").value.trim();
    if (text.length < 3) return toast("Type the question first.", "warn");
    if (!speaker) return toast("Type the speaker's name.", "warn");
    const dest = editing ? editing.destinationID : sel.value;
    const dup = qs.find(x => x.destinationID === dest && (x.questionText || "").trim().toLowerCase() === text.toLowerCase() && (!editing || x.id !== editing.id));
    if (dup) return toast("This destination already has that exact question.", "err");

    const data = { speakerNPC: speaker, questionText: text, keyPoints: key };
    await busy($("qSave"), async () => {
        try {
            if (editing) { await updateDoc(doc(db, "Scenarios_tbl", editing.id), data); toast("Question updated."); }
            else {
                const used = qs.filter(x => x.destinationID === sel.value && x.isExtra).length;
                if (used >= (quota[sel.value] ?? MAX_EXTRA)) return toast("No extra stops left for this destination.", "err");
                await addDoc(collection(db, "Scenarios_tbl"), { ...data, options: [], destinationID: sel.value, isExtra: true, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
                toast("Extra question added.");
            }
            $("qDialog").close();
            await refresh();
        } catch (err) { console.error(err); toast("Could not save the question. " + niceError(err), "err"); }
    });
});

document.addEventListener("click", async e => {
    const b = e.target.closest("[data-q]");
    if (!b) return;
    const x = qs.find(q => q.id === b.dataset.id);
    if (!x) return toast("That question no longer exists. Refresh the page.", "err");
    if (b.dataset.q === "edit") openForm(x);
    else if (await ask("Delete this extra question? This cannot be undone.", { title: "Delete question", ok: "Delete", danger: true })) {
        try { await deleteDoc(doc(db, "Scenarios_tbl", x.id)); toast("Question deleted.", "warn"); await refresh(); }
        catch (err) { console.error(err); toast("Could not delete. " + niceError(err), "err"); }
    }
});

// Printable sheet for the instructor (also the backup when there is no wifi)
$("printQ").addEventListener("click", () => {
    if (!qs.length) return toast("The question bank is still loading or empty.", "warn");
    const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const body = DESTS.map((d, i) => {
        const list = listFor(d);
        return `<h3 style="margin:18px 0 6px;color:#a50012">Map ${i + 1}: ${esc(d)}</h3>` +
            (list.map((x, n) => `<div style="margin:6px 0;break-inside:avoid"><b>${n + 1}. ${esc(x.questionText)}</b> <small>(${esc(x.speakerNPC || "Tourist")})</small><br>
              <span>Key points: ${x.keyPoints ? esc(x.keyPoints) : "<i>none written yet</i>"}</span></div>`).join("") || "<p>No questions.</p>");
    }).join("");
    toast("Choose \"Save as PDF\" in the print window.", "info");
    printHtml(`<div class="pr-head"><img src="images/htm-logo.png" onerror="this.onerror=null;this.src='images/bulsu-seal.png'" alt=""><div><strong>Bulacan State University &middot; Sarmiento Campus</strong><br>
        Department of Hospitality and Tourism Management<br><span class="pr-title">DejaView VR &ndash; Instructor Question Sheet</span></div></div>
        <p>Date printed: ${esc(today)}. Each question is answered out loud in 30 seconds. Score Knowledge against the key points.</p>${body}`, "DejaView Question Sheet");
});

$("addQ").addEventListener("click", () => openForm(null));
$("qCancel").addEventListener("click", () => $("qDialog").close());
sel.addEventListener("change", render);
