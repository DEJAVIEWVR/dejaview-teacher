import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { DESTS, STOPS, ALL_STOPS } from "./destinations.js";
import { toast, ask, niceError, busy } from "./toast.js";

let mods = [], editing = null, current = DESTS[0];
const IS_ADMIN_PAGE = /admin/i.test(location.pathname);   // admin.html = the admin controls everything
let myUid = "", mySecs = [], myName = "";
onAuthStateChanged(auth, async u => {
    if (!u) return;
    myUid = u.uid;
    try {
        if (IS_ADMIN_PAGE) { mySecs = (await getDocs(collection(db, "sections"))).docs.map(d => d.id).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); myName = "Admin"; }
        else { const t = await getDoc(doc(db, "teachers", u.uid)); mySecs = t.exists() ? (t.data().sections || []) : []; myName = t.exists() ? (t.data().name || "") : ""; }
    }
    catch (err) { console.error(err); }
    refresh();
});
const secsOf = m => Array.isArray(m.sections) ? m.sections : [];          // empty = every section
const mineM = m => IS_ADMIN_PAGE || (!!myUid && m.createdBy === myUid);   // "mine" = I may change it (the admin may change all)
// I see my own modules, and others' only when they are not another instructor's private work and reach my sections
const visible = m => IS_ADMIN_PAGE || mineM(m) || (m.byRole !== "teacher" && (!secsOf(m).length || secsOf(m).some(s => mySecs.includes(s))));
const reachTxt = m => secsOf(m).length ? secsOf(m).join(", ") : "All sections";
render();

async function refresh() {
    try {
        mods = (await getDocs(collection(db, "modules"))).docs.map(d => ({ id: d.id, ...d.data() })).filter(visible);
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
    let text = "Open link", icon = '<i class="ico ico-link"></i>';
    if (/youtube\.com|youtu\.be/.test(host)) { text = "Watch video"; icon = '<i class="ico ico-play"></i>'; }
    else if (/drive\.google|docs\.google/.test(host)) { text = "Open file"; icon = '<i class="ico ico-file"></i>'; }
    return `<a class="mod-link" href="${esc(link)}" target="_blank" rel="noopener">${icon} ${text}</a>`;
}

// Google Drive share links become picture links; anything else is used as it is
function imgSrc(u) {
    u = (u || "").trim();
    const g = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
    return g ? `https://drive.google.com/thumbnail?id=${g[1]}&sz=w1000` : u;
}
function isStop(m) { return m.kind === "stop"; }
function pics(m) {
    const list = Array.isArray(m.images) ? m.images.filter(i => i && i.url) : [];
    return list.length ? `<div class="mod-imgs ${list.length === 1 ? "one" : ""}">${list.map(i => `<figure><button type="button" class="pic" data-zoom="${esc(imgSrc(i.url))}" data-cap="${esc(i.caption || "")}" title="Click to see the full picture"><img src="${esc(imgSrc(i.url))}" alt="${esc(i.caption || "")}" loading="lazy"></button>${i.caption ? `<figcaption>${esc(i.caption)}</figcaption>` : ""}</figure>`).join("")}</div>` : "";
}

// click a picture to see it whole, in a big window
const zoom = document.createElement("dialog");
zoom.className = "zoom-dlg";
zoom.innerHTML = '<button type="button" class="dlg-x zoom-x" aria-label="Close"><i class="ico ico-x"></i></button><img alt=""><p></p>';
document.body.appendChild(zoom);
zoom.addEventListener("click", e => { if (e.target !== zoom.querySelector("img") && e.target.tagName !== "P") zoom.close(); });

function card(m) {
    const long = (m.content || "").length > 200 || (m.content || "").split("\n").length > 4;
    return `<article class="mod-card">
        <div class="mod-top"><span class="mod-chip ${isStop(m) ? "story" : ""}">${isStop(m) ? "Game history: " + esc(m.stop || m.title) : "Lesson"}</span><span class="mod-date">${esc(when(m))}</span></div>
        <div class="mod-by">${m.createdBy === myUid ? "Made by you" : "Made by " + esc(m.createdByName || (m.byRole === "admin" ? "Admin" : "an instructor"))} &middot; Sections: ${esc(reachTxt(m))}</div>
        <h3>${esc(m.title)}</h3>
        <p class="mod-text">${esc(m.content)}</p>
        ${long ? '<button class="mod-more" data-m="more">Read more</button>' : ""}
        ${pics(m)}
        <div class="mod-actions">${linkButton(m.link)}<span class="grow"></span>
            ${mineM(m) ? `<button class="edit-button" data-m="edit" data-id="${m.id}">Edit</button>
            <button class="delete-button" data-m="del" data-id="${m.id}">Delete</button>` : '<small class="hint">Read only</small>'}
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

    const stories = list.filter(isStop), lessons = list.filter(x => !isStop(x));
    $("modList").innerHTML = list.length
        ? (stories.length ? `<h3 class="sub-title">Game histories (shown in the VR game)</h3><div class="mgrid">${stories.map(card).join("")}</div>` : "")
          + (lessons.length ? `<h3 class="sub-title">Lessons (read by students before playing)</h3><div class="mgrid">${lessons.map(card).join("")}</div>` : "")
        : `<div class="mod-empty"><strong>No modules yet for ${esc(current)}</strong>Click "+ Add Module" to add a lesson or a game history.</div>`;
}

// ---------- picture slots (drop a photo, or paste a link) ----------
const slots = ["", "", "", ""];

// shrink a photo in the browser: longest side 800 px, JPEG, so it stays small and loads fast in the game
function shrink(file) {
    return new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onerror = rej;
        fr.onload = () => {
            const im = new Image();
            im.onerror = rej;
            im.onload = () => {
                const k = Math.min(1, 800 / Math.max(im.width, im.height));
                const c = document.createElement("canvas");
                c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
                const g = c.getContext("2d");
                g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
                g.drawImage(im, 0, 0, c.width, c.height);
                res(c.toDataURL("image/jpeg", 0.72));
            };
            im.src = fr.result;
        };
        fr.readAsDataURL(file);
    });
}
function paintPrev(i) {
    const u = slots[i];
    $("mImgPrev" + i).innerHTML = u ? `<img src="${esc(imgSrc(u))}" alt="">` : "<span>Drop photo</span>";
}
function paintSlot(i) {
    const u = slots[i], isData = u.startsWith("data:"), inp = $("mImgUrl" + i);
    inp.value = isData ? "Photo added" : u;
    inp.readOnly = isData;
    inp.classList.toggle("locked", isData);
    inp.placeholder = "Or paste a photo link";
    paintPrev(i);
}
async function takeFile(i, file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast("Choose a JPG or PNG photo.", "warn");
    try { slots[i] = await shrink(file); paintSlot(i); }
    catch (err) { console.error(err); toast("Could not read that photo.", "err"); }
}
for (let i = 0; i < 4; i++) {
    $("mImgFile" + i).addEventListener("change", e => { takeFile(i, e.target.files && e.target.files[0]); e.target.value = ""; });
    $("mImgUrl" + i).addEventListener("input", () => { slots[i] = $("mImgUrl" + i).value.trim(); paintPrev(i); });
    const box = $("mSlot" + i);
    box.addEventListener("dragover", e => { e.preventDefault(); box.classList.add("drag"); });
    box.addEventListener("dragleave", () => box.classList.remove("drag"));
    box.addEventListener("drop", e => { e.preventDefault(); box.classList.remove("drag"); takeFile(i, e.dataTransfer && e.dataTransfer.files[0]); });
}

$("mStopSel").addEventListener("change", () => { $("mStop").hidden = $("mStopSel").value !== "__other"; });

function syncKind() {
    const stop = $("mKind").value === "stop";
    $("mTitleRow").hidden = stop;
    $("mStopRow").hidden = !stop;
    $("mImgBox").hidden = !stop;
    $("mLinkRow").hidden = stop;
    $("mContentHint").hidden = !stop;
    $("mContentLabel").textContent = stop ? "History" : "Lesson notes";
    document.querySelectorAll("#mKindSeg button").forEach(b => b.classList.toggle("on", b.dataset.kind === $("mKind").value));
}

function ensureSecBox() {
    if ($("mSecs")) return;
    $("mContentLabel").insertAdjacentHTML("beforebegin", `<div id="mSecRow"><label>Which sections can see this?</label>
        <label class="inl" id="mAllWrap"><input type="checkbox" id="mAll"> All sections</label><div class="checks" id="mSecs"></div></div>`);
    $("mAll").addEventListener("change", () => { document.querySelectorAll("#mSecs input").forEach(c => { c.checked = $("mAll").checked; c.disabled = $("mAll").checked; }); });
}

function openForm(m) {
    editing = m || null;
    ensureSecBox();
    const curSecs = m ? secsOf(m) : [];
    const everyone = IS_ADMIN_PAGE && (!m || !curSecs.length);
    $("mAllWrap").hidden = !IS_ADMIN_PAGE;
    $("mAll").checked = everyone;
    $("mSecs").innerHTML = mySecs.map(sn => `<label><input type="checkbox" value="${esc(sn)}" ${everyone || !m || !curSecs.length || curSecs.includes(sn) ? "checked" : ""} ${everyone ? "disabled" : ""}> ${esc(sn)}</label>`).join("") || '<span class="hint">No section is assigned to you yet. Ask the admin.</span>';
    const dest = m ? m.destinationID : current;
    $("mTitleHead").textContent = m ? "Edit" : "Add to " + dest;
    $("mKind").value = m && isStop(m) ? "stop" : "lesson";
    $("mTitle").value = m && !isStop(m) ? (m.title || "") : "";
    const list = (ALL_STOPS[dest] || STOPS[dest] || []).filter(Boolean), cur = m && isStop(m) ? (m.stop || m.title || "") : "";
    const known = list.some(s => s.toLowerCase() === cur.toLowerCase());
    $("mStopSel").innerHTML = `<option value="">Choose a stop</option>` + list.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("") + `<option value="__other">Other...</option>`;
    $("mStopSel").value = !cur ? "" : (known ? list.find(s => s.toLowerCase() === cur.toLowerCase()) : "__other");
    $("mStop").value = known ? "" : cur;
    $("mStop").hidden = $("mStopSel").value !== "__other";
    $("mContent").value = m?.content || ""; $("mLink").value = m?.link || "";
    const im = Array.isArray(m?.images) ? m.images : [];
    for (let i = 0; i < 4; i++) { slots[i] = im[i]?.url || ""; $("mImgCap" + i).value = im[i]?.caption || ""; paintSlot(i); }
    syncKind();
    $("mDialog").showModal();
}

$("mForm").addEventListener("submit", async e => {
    e.preventDefault();
    const kind = $("mKind").value, stop = kind === "stop";
    const sel = $("mStopSel").value;
    const stopName = (sel === "__other" ? $("mStop").value : sel).trim().replace(/\s+/g, " ");
    const title = stop ? stopName : $("mTitle").value.trim();
    const content = $("mContent").value.trim(), link = stop ? "" : $("mLink").value.trim();
    const dest = editing ? editing.destinationID : current;
    if (stop && stopName.length < 2) return toast("Choose a stop.", "warn");
    if (!stop && title.length < 2) return toast("Give the module a title.", "warn");
    if (content.length < 3) return toast(stop ? "Write the history first." : "Write the lesson notes first.", "warn");
    if (link && !/^https?:\/\/\S+\.\S+/i.test(link)) return toast("The link must start with http:// or https://", "err");
    const images = [];
    if (stop) {
        for (let i = 0; i < 4; i++) {
            const url = (slots[i] || "").trim(), caption = $("mImgCap" + i).value.trim();
            if (!url) continue;
            if (!/^data:image\//.test(url) && !/^https:\/\/\S+\.\S+/i.test(url)) return toast(`Photo ${i + 1}: add a photo or an https:// link.`, "err");
            images.push({ url, caption });
        }
        if (images.reduce((n, x) => n + x.url.length, 0) > 800000) return toast("The photos are too big together. Remove one.", "err");
    }
    let sections = [...document.querySelectorAll("#mSecs input:checked")].map(c => c.value);
    if (IS_ADMIN_PAGE && $("mAll").checked) sections = [];
    else if (!sections.length) return toast("Tick at least one section.", "warn");
    const same = x => (IS_ADMIN_PAGE ? x.byRole !== "teacher" : mineM(x)) && x.destinationID === dest && (isStop(x) === stop) && (x.title || "").trim().toLowerCase() === title.toLowerCase() && (!editing || x.id !== editing.id);
    if (mods.some(same)) return toast(stop ? "That stop already has a history. Edit it instead." : "This destination already has a lesson with that title.", "err");
    const data = { destinationID: dest, title, content, link, kind, stop: stop ? stopName : "", images, sections, byRole: editing ? (editing.byRole || (IS_ADMIN_PAGE ? "admin" : "teacher")) : (IS_ADMIN_PAGE ? "admin" : "teacher"), updatedAt: serverTimestamp() };
    await busy($("mSave"), async () => {
        try {
            if (editing) { await updateDoc(doc(db, "modules", editing.id), data); toast(stop ? "History updated." : "Module updated."); }
            else { await addDoc(collection(db, "modules"), { ...data, createdBy: auth.currentUser.uid, createdByName: myName }); toast((stop ? "History" : "Module") + " added to " + dest + "."); }
            $("mDialog").close(); await refresh();
        } catch (err) { console.error(err); toast("Could not save. " + niceError(err), "err"); }
    });
});

document.addEventListener("click", async e => {
    const tab = e.target.closest("[data-tab]");
    if (tab) { current = tab.dataset.tab; render(); return; }

    const kb = e.target.closest("[data-kind]");
    if (kb) { $("mKind").value = kb.dataset.kind; syncKind(); return; }
    const clr = e.target.closest("[data-clear]");
    if (clr) { const i = +clr.dataset.clear; slots[i] = ""; $("mImgCap" + i).value = ""; paintSlot(i); return; }

    const z = e.target.closest("[data-zoom]");
    if (z) { zoom.querySelector("img").src = z.dataset.zoom; zoom.querySelector("p").textContent = z.dataset.cap; zoom.showModal(); return; }

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
    if (!mineM(m)) return toast("You can change only your own modules.", "warn");
    if (b.dataset.m === "edit") openForm(m);
    else if (await ask(`Delete the module "${m.title}"? This cannot be undone.`, { title: "Delete module", ok: "Delete", danger: true })) {
        try { await deleteDoc(doc(db, "modules", m.id)); toast("Module deleted.", "warn"); await refresh(); } catch (err) { console.error(err); toast("Could not delete. " + niceError(err), "err"); }
    }
});
$("addMod").addEventListener("click", () => openForm(null));
$("mCancel").addEventListener("click", () => $("mDialog").close());
