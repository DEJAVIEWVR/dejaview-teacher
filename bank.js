import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { DESTS } from "./destinations.js";

let qs = [], quota = {}, editing = null;
const sel = $("bankDest");
sel.innerHTML = DESTS.map(d => `<option>${esc(d)}</option>`).join("");
$("qOpts").innerHTML = [0, 1, 2].map(i => `<div class="ogrp"><label>Choice ${"ABC"[i]}</label>
  <input id="o${i}t" placeholder="Answer text" required>
  <select id="o${i}s"><option value="100">100% (best answer)</option><option value="50">50% (partly right)</option><option value="0">0% (wrong)</option></select>
  <input id="o${i}r" placeholder="Tourist reaction after this answer"></div>`).join("");

onAuthStateChanged(auth, u => { if (u) refresh(); });

async function refresh() {
    try {
        const [q, l] = await Promise.all([getDocs(collection(db, "Scenarios_tbl")), getDocs(collection(db, "levels"))]);
        qs = q.docs.map(d => ({ id: d.id, ...d.data() }));
        quota = {};
        l.docs.forEach(d => quota[d.data().name] = d.data().extraWaypoints || 0);
        render();
    } catch (err) { console.error(err); $("bankList").innerHTML = "<p>Unable to load questions.</p>"; }
}

function render() {
    const d = sel.value, list = qs.filter(x => x.destinationID === d);
    const used = list.filter(x => x.isExtra).length, max = quota[d] || 0;
    $("bankQuota").textContent = `Extra questions: ${used} of ${max} used (the admin sets how many extra waypoints this destination has).`;
    $("addQ").disabled = used >= max;
    $("bankList").innerHTML = list.map(x => `<div class="qcard"><div class="qtop">
        <span class="chip">${esc(x.speakerNPC || "Tourist")}${x.isExtra ? " · Extra" : ""}</span>
        <span><button class="edit-button" data-q="edit" data-id="${x.id}">Edit</button>
        ${x.isExtra ? `<button class="delete-button" data-q="del" data-id="${x.id}">Delete</button>` : ""}</span></div>
        <p>${esc(x.questionText)}</p>
        ${(x.options || []).map((o, i) => `<div class="opt"><b>${"ABC"[i]} (${esc(o.scoreWeight)}%):</b> ${esc(o.text)}<small>${esc(o.reaction || "")}</small></div>`).join("")}
        </div>`).join("") || "<p>No questions for this destination yet.</p>";
}

function openForm(x) {
    editing = x || null;
    $("qTitle").textContent = x ? "Edit question" : "Add question";
    $("qSpeaker").value = x?.speakerNPC || "Tourist";
    $("qText").value = x?.questionText || "";
    [0, 1, 2].forEach(i => {
        const o = x?.options?.[i] || {};
        $("o" + i + "t").value = o.text || "";
        $("o" + i + "s").value = o.scoreWeight ?? [100, 50, 0][i];
        $("o" + i + "r").value = o.reaction || "";
    });
    $("qDialog").showModal();
}

$("qForm").addEventListener("submit", async e => {
    e.preventDefault();
    const data = {
        destinationID: sel.value, speakerNPC: $("qSpeaker").value.trim(), questionText: $("qText").value.trim(),
        options: [0, 1, 2].map(i => ({ text: $("o" + i + "t").value.trim(), scoreWeight: +$("o" + i + "s").value, reaction: $("o" + i + "r").value.trim() }))
    };
    try {
        if (editing) await updateDoc(doc(db, "Scenarios_tbl", editing.id), data);
        else {
            const used = qs.filter(x => x.destinationID === sel.value && x.isExtra).length;
            if (used >= (quota[sel.value] || 0)) { alert("No extra waypoint slots left."); return; }
            await addDoc(collection(db, "Scenarios_tbl"), { ...data, isExtra: true, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
        }
        $("qDialog").close();
        refresh();
    } catch (err) { console.error(err); alert("Could not save. Check your permissions."); }
});

document.addEventListener("click", async e => {
    const b = e.target.closest("[data-q]");
    if (!b) return;
    const x = qs.find(q => q.id === b.dataset.id);
    if (b.dataset.q === "edit") openForm(x);
    else if (confirm("Delete this extra question?")) {
        try { await deleteDoc(doc(db, "Scenarios_tbl", x.id)); refresh(); }
        catch (err) { console.error(err); alert("Could not delete."); }
    }
});
$("addQ").addEventListener("click", () => openForm(null));
$("qCancel").addEventListener("click", () => $("qDialog").close());
sel.addEventListener("change", render);
