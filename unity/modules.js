import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { DESTS } from "./destinations.js";
import { toast, ask, niceError, busy } from "./toast.js";

let mods = [], editing = null, current = DESTS[0];
onAuthStateChanged(auth, u => { if (u) refresh(); });
render();

async function refresh() {
    try {
        mods = (await getDocs(collection(db, "modules"))).docs.map(d => ({ id: d.id, ...d.data() }));
        render();
    } catch (err) { console.error(err); $("modList").innerHTML = '<div class="mod-empty">Unable to load modules.</div>'; toast(niceError(err, "Unable to load the training modules."), "err"); }
}

const when = m => {
    const d = m.updatedAt && m.updatedAt.toDate ? m.updatedAt.toDate() : null;
    return d ? "Updated " + d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
};

function linkButton(link) {
    if (!/^https?:\/\//i.test(link || "")) return "";
    let host = "";
    try { host = new URL(link).hostname.replace(/^www\./, ""); } catch (e) { }
    let text = "Open link", icon = "&#128279;";
    if (/youtube\.com|youtu\.be/.test(host)) { text = "Watch video"; icon = "&#9654;"; }
    else if (/drive\.google|docs\.google/.test(host)) { text = "Open file"; icon = "&#128196;"; }
    return `<a class="mod-link" href="${esc(link)}" target="_blank" rel="noopener">${icon} ${text}</a>`;
}

function card(m) {
    const long = (m.content || "").length > 200 || (m.content || "").split("\n").length > 4;
    return `<article class="mod-card">
        <div class="mod-top"><span class="mod-chip">Module</span><span class="mod-date">${esc(when(m))}</span></div>
        <h3>${esc(m.title)}</h3>
        <p class="mod-text">${esc(m.content)}</p>
        ${long ? '<button class="mod-more" data-m="more">Read more</button>' : ""}
        <div class="mod-actions">${linkButton(m.link)}<span class="grow"></span>
            <button class="edit-button" data-m="edit" data-id="${m.id}">Edit</button>
            <button class="delete-button" data-m="del" data-id="${m.id}">Delete</button>
        </div></article>`;
}

function render() {
    $("modTabs").innerHTML = DESTS.map(d => {
        const n = mods.filter(m => m.destinationID === d).length;
        return `<button class="tab ${d === current ? "active" : ""}" data-tab="${esc(d)}">${esc(d)}<span class="count">${n}</span></button>`;
    }).join("");

    const list = mods.filter(m => m.destinationID === current).sort((a, b) => {
        const ta = a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis() : 0;
        const tb = b.updatedAt && b.updatedAt.toMillis ? b.updatedAt.toMillis() : 0;
        return tb - ta || (a.title || "").localeCompare(b.title || "");
    });

    $("modList").innerHTML = list.length
        ? `<div class="mgrid">${list.map(card).join("")}</div>`
        : `<div class="mod-empty"><strong>No modules yet for ${esc(current)}</strong>Click "+ Add Module" to create the first one.</div>`;
}

function openForm(m) {
    editing = m || null;
    $("mTitleHead").textContent = m ? "Edit module" : "Add module to " + current;
    $("mTitle").value = m?.title || ""; $("mContent").value = m?.content || ""; $("mLink").value = m?.link || "";
    $("mDialog").showModal();
}

$("mForm").addEventListener("submit", async e => {
    e.preventDefault();
    const title = $("mTitle").value.trim(), content = $("mContent").value.trim(), link = $("mLink").value.trim();
    const dest = editing ? editing.destinationID : current;
    if (title.length < 2) return toast("Give the module a title.", "warn");
    if (content.length < 3) return toast("Write the lesson notes first.", "warn");
    if (link && !/^https?:\/\/\S+\.\S+/i.test(link)) return toast("The link must start with http:// or https://", "err");
    if (mods.some(x => x.destinationID === dest && x.title.trim().toLowerCase() === title.toLowerCase() && (!editing || x.id !== editing.id)))
        return toast("This destination already has a module with that title.", "err");
    const data = { destinationID: dest, title, content, link, updatedAt: serverTimestamp() };
    await busy($("mSave"), async () => {
        try {
            if (editing) { await updateDoc(doc(db, "modules", editing.id), data); toast("Module updated."); }
            else { await addDoc(collection(db, "modules"), { ...data, createdBy: auth.currentUser.uid }); toast("Module added to " + dest + "."); }
            $("mDialog").close(); await refresh();
        } catch (err) { console.error(err); toast("Could not save the module. " + niceError(err), "err"); }
    });
});

document.addEventListener("click", async e => {
    const tab = e.target.closest("[data-tab]");
    if (tab) { current = tab.dataset.tab; render(); return; }

    const b = e.target.closest("[data-m]");
    if (!b) return;
    if (b.dataset.m === "more") {
        const card = b.closest(".mod-card");
        card.classList.toggle("open");
        b.textContent = card.classList.contains("open") ? "Show less" : "Read more";
        return;
    }
    const m = mods.find(x => x.id === b.dataset.id);
    if (!m) return toast("That module no longer exists. Refresh the page.", "err");
    if (b.dataset.m === "edit") openForm(m);
    else if (await ask(`Delete the module "${m.title}"? This cannot be undone.`, { title: "Delete module", ok: "Delete", danger: true })) {
        try { await deleteDoc(doc(db, "modules", m.id)); toast("Module deleted.", "warn"); await refresh(); } catch (err) { console.error(err); toast("Could not delete. " + niceError(err), "err"); }
    }
});
$("addMod").addEventListener("click", () => openForm(null));
$("mCancel").addEventListener("click", () => $("mDialog").close());
