import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { DESTS } from "./destinations.js";

let mods = [], editing = null;
const sel = $("modDest");
sel.innerHTML = DESTS.map(d => `<option>${esc(d)}</option>`).join("");
onAuthStateChanged(auth, u => { if (u) refresh(); });

async function refresh() {
    try {
        mods = (await getDocs(collection(db, "modules"))).docs.map(d => ({ id: d.id, ...d.data() }));
        render();
    } catch (err) { console.error(err); $("modList").innerHTML = "<p>Unable to load modules.</p>"; }
}

function render() {
    const list = mods.filter(m => m.destinationID === sel.value).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    $("modList").innerHTML = list.map(m => `<div class="mcard"><div class="qtop"><h3>${esc(m.title)}</h3>
        <span><button class="edit-button" data-m="edit" data-id="${m.id}">Edit</button>
        <button class="delete-button" data-m="del" data-id="${m.id}">Delete</button></span></div>
        <p>${esc(m.content)}</p>${m.link ? `<a href="${esc(m.link)}" target="_blank" rel="noopener">Open link</a>` : ""}</div>`).join("")
        || "<p>No modules for this destination yet.</p>";
}

function openForm(m) {
    editing = m || null;
    $("mTitleHead").textContent = m ? "Edit module" : "Add module";
    $("mTitle").value = m?.title || ""; $("mContent").value = m?.content || ""; $("mLink").value = m?.link || "";
    $("mDialog").showModal();
}

$("mForm").addEventListener("submit", async e => {
    e.preventDefault();
    const data = { destinationID: sel.value, title: $("mTitle").value.trim(), content: $("mContent").value.trim(), link: $("mLink").value.trim(), updatedAt: serverTimestamp() };
    try {
        if (editing) await updateDoc(doc(db, "modules", editing.id), data);
        else await addDoc(collection(db, "modules"), { ...data, createdBy: auth.currentUser.uid });
        $("mDialog").close(); refresh();
    } catch (err) { console.error(err); alert("Could not save. Check your permissions."); }
});

document.addEventListener("click", async e => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    const m = mods.find(x => x.id === b.dataset.id);
    if (b.dataset.m === "edit") openForm(m);
    else if (confirm("Delete this module?")) {
        try { await deleteDoc(doc(db, "modules", m.id)); refresh(); } catch (err) { console.error(err); alert("Could not delete."); }
    }
});
$("addMod").addEventListener("click", () => openForm(null));
$("mCancel").addEventListener("click", () => $("mDialog").close());
sel.addEventListener("change", render);
