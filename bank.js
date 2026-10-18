import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { DESTS, STOPS, MAX_SLOTS, STOP_NOS } from "./destinations.js";
import { printHtml } from "./report.js";
import { toast, ask, niceError, busy } from "./toast.js";

let qs = [], editing = null;
const MAX_PER_STOP = 10;   // most questions one person can add to one question number
const NPCS = ["Tourist", "Tour Guide", "Bernadette", "Couple", "Mother", "Child"];   // the characters in the game
const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const sel = $("bankDest");
sel.innerHTML = DESTS.map(d => `<option>${esc(d)}</option>`).join("");

const IS_ADMIN_PAGE = /admin/i.test(location.pathname);   // admin.html = admin view, index.html = instructor view
let myUid = "", mySecs = [], myName = "";

onAuthStateChanged(auth, async u => {
    if (!u) return;
    myUid = u.uid;
    try {
        if (IS_ADMIN_PAGE) {
            mySecs = (await getDocs(collection(db, "sections"))).docs.map(d => d.id).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            myName = "Admin";
        } else {
            const t = await getDoc(doc(db, "teachers", u.uid));
            mySecs = t.exists() ? (t.data().sections || []) : [];
            myName = t.exists() ? (t.data().name || "Instructor") : "Instructor";
        }
    } catch (err) { console.error(err); }
    refresh();
});

async function refresh() {
    try {
        qs = (await getDocs(collection(db, "Scenarios_tbl"))).docs.map(d => ({ id: d.id, ...d.data() }));
        render();
    } catch (err) { console.error(err); $("bankList").innerHTML = "<p>Unable to load questions.</p>"; toast(niceError(err, "Unable to load the question bank."), "err"); }
}

// Who may see / change a question
const secsOf = x => Array.isArray(x.sections) ? x.sections : [];          // empty = every section
const byTeacher = x => x.isExtra && x.byRole === "teacher";
const mine = x => x.isExtra && x.createdBy === myUid && (IS_ADMIN_PAGE ? x.byRole !== "teacher" : true);
const visible = x => {
    if (IS_ADMIN_PAGE) return true;                                          // admin sees everything
    if (!x.isExtra) return true;                                             // originals (read only for instructors)
    if (x.createdBy === myUid) return true;                                  // my own
    if (byTeacher(x)) return false;                                          // another instructor's question
    return !secsOf(x).length || secsOf(x).some(s => mySecs.includes(s));     // admin question that reaches my sections
};
const canEdit = x => IS_ADMIN_PAGE || (x.isExtra && x.createdBy === myUid);
const who = x => !x.isExtra ? "Original" : (byTeacher(x) ? (x.createdByName || "Instructor") : "Admin") + (x.createdBy === myUid ? " (you)" : "");
const reach = x => !x.isExtra ? "All sections" : (secsOf(x).length ? secsOf(x).join(", ") : "All sections");

const made = x => (x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : 0);

// One group per question number ("slot"): the original question + every added question for it
function groupsFor(d) {
    const all = qs.filter(x => x.destinationID === d && visible(x));
    const base = all.filter(x => !x.isExtra).sort((a, b) => (a.order || 0) - (b.order || 0));
    const names = STOPS[d] || [];
    let n = Math.max(base.length, names.length);
    if (MAX_SLOTS[d]) n = Math.min(n, MAX_SLOTS[d]);
    const groups = [];
    for (let i = 0; i < n; i++)
        groups.push({ no: i + 1, tag: STOP_NOS[d] ? "Stop " + (STOP_NOS[d][i] || i + 1) : "Question " + (i + 1), name: names[i] || "", items: base[i] ? [base[i]] : [] });
    const other = [];
    all.filter(x => x.isExtra).sort((a, b) => made(a) - made(b)).forEach(x => {
        let g = Number.isInteger(x.slot) ? groups.find(k => k.no === x.slot) : null;
        if (!g && x.stop) g = groups.find(k => k.name && norm(k.name) === norm(x.stop));
        (g ? g.items : other).push(x);
    });
    return { groups, other };
}

const card = (x, n) => `<div class="qcard"><div class="qtop">
        <span class="chip">${n}. ${esc(x.speakerNPC || "Tourist")}</span>
        <span class="qright"><span class="chip by">${x.isExtra ? "Added by " + esc(who(x)) : "Original question"}</span>${canEdit(x) ? `<button class="edit-button" data-q="edit" data-id="${x.id}">Edit</button>` : '<small class="hint">Read only</small>'}
        ${x.isExtra && canEdit(x) ? `<button class="delete-button" data-q="del" data-id="${x.id}">Delete</button>` : ""}</span></div>
        <p>${esc(x.questionText)}</p>
        <small class="hint">Sections: ${esc(reach(x))}</small>
        ${x.keyPoints ? `<div class="key"><b>Key points:</b> ${esc(x.keyPoints)}</div>` : '<div class="hint">No key points yet.' + (canEdit(x) ? ' Click Edit to add what a good answer includes.' : '') + '</div>'}
        </div>`;

const label = g => g.name ? g.name : "Question " + g.no;
function render() {
    const d = sel.value, { groups, other } = groupsFor(d);
    const total = groups.reduce((n, g) => n + g.items.length, 0) + other.length;
    $("bankQuota").textContent = (IS_ADMIN_PAGE
        ? `${total} question(s) for this map. The original questions can only be changed here. Questions you add reach all sections or only the sections you choose.`
        : `${total} question(s) you can see for this map. Original questions are read only. Questions you add reach only your own sections (${mySecs.join(", ") || "none yet"}).`)
        + " The game gives each student one question per number, picked at random, so students do not get the same question.";
    $("addQ").disabled = !groups.length || (!IS_ADMIN_PAGE && !mySecs.length);
    $("addQ").title = $("addQ").disabled ? "Nothing to add to yet, or you have no sections assigned." : "";
    $("bankList").innerHTML = groups.map(g => {
        const added = g.items.filter(mine).length;
        const btn = added >= MAX_PER_STOP ? `<span class="hint">Limit reached (${MAX_PER_STOP} added by you).</span>`
            : (!IS_ADMIN_PAGE && !mySecs.length) ? ""
            : `<button class="add-button" data-q="add" data-slot="${g.no}">+ Add question</button>`;
        return `<section class="qstop"><div class="qstop-h"><div><h3>${g.tag}${g.name ? " · " + esc(g.name) : ""}</h3>
            <small class="hint">${g.items.length} question${g.items.length === 1 ? "" : "s"} you can see${g.items.length > 1 ? " · each student gets 1 at random" : ""}</small></div>${btn}</div>
            ${g.items.map((x, n) => card(x, n + 1)).join("") || '<p class="hint">No question here yet.</p>'}</section>`;
    }).join("") + (other.length ? `<section class="qstop"><div class="qstop-h"><div><h3>Other added questions</h3><small class="hint">Older extra questions that are not tied to a question number.</small></div></div>${other.map((x, n) => card(x, n + 1)).join("")}</section>` : "")
        || "<p>No questions for this destination yet.</p>";
}

function ensureSecBox() {
    if ($("qSecs")) return;
    $("qStopRow").insertAdjacentHTML("afterend", `<div id="qSecRow"><label>Which sections get this question?</label>
        <label class="inl" id="qAllWrap"><input type="checkbox" id="qAll"> All sections</label>
        <div class="checks" id="qSecs"></div></div>`);
    // the speaker is chosen automatically: it is the NPC who is at that stop (no dropdown to confuse the teacher)
    const spLabel = document.querySelector('label[for="qSpeaker"]');
    if (spLabel) spLabel.style.display = "none";
    $("qSpeaker").style.display = "none";
    $("qSpeaker").insertAdjacentHTML("afterend", '<div id="qWho" class="who-box"></div>');
    $("qStop").addEventListener("change", setWho);
    $("qAll").addEventListener("change", () => { document.querySelectorAll("#qSecs input").forEach(c => { c.checked = $("qAll").checked; c.disabled = $("qAll").checked; }); });
}

// the character who asks the question at this stop = the character of that stop's original question
function placeNpc(dest, slotNo) {
    const originals = qs.filter(x => x.destinationID === dest && !x.isExtra).sort((a, b) => (a.order || 0) - (b.order || 0));
    const own = originals[slotNo - 1];
    if (own && (own.speakerNPC || "").trim()) return own.speakerNPC.trim();
    const count = {};
    originals.forEach(x => { const n = (x.speakerNPC || "").trim(); if (n) count[n] = (count[n] || 0) + 1; });
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : "Tourist";
}
function setWho() {
    const dest = editing ? editing.destinationID : sel.value;
    const slot = editing ? (Number.isInteger(editing.slot) ? editing.slot : 1) : Number($("qStop").value) || 1;
    const npc = (editing && (editing.speakerNPC || "").trim()) || placeNpc(dest, slot);
    $("qSpeaker").value = npc;
    $("qWho").innerHTML = `<b>Asked by:</b> ${esc(npc)} <span>(the character at this stop, chosen automatically)</span>`;
}

function openForm(x, slot) {
    editing = x || null;
    ensureSecBox();
    const gs = groupsFor(sel.value).groups;
    $("qStop").innerHTML = gs.map(g => `<option value="${g.no}">${g.tag}${g.name ? " · " + esc(g.name) : ""}</option>`).join("");
    if (slot) $("qStop").value = String(slot);
    $("qStopRow").hidden = !!x;
    $("qStopRow").querySelector("label").textContent = "Which question number is this for?";
    $("qTitle").textContent = x ? "Edit question" : "Add a question";
    setWho();
    $("qText").value = x?.questionText || "";
    $("qKey").value = x?.keyPoints || "";
    // sections
    const curSecs = x ? secsOf(x) : [];
    const everyone = IS_ADMIN_PAGE && (!x || !curSecs.length);
    $("qAllWrap").hidden = !IS_ADMIN_PAGE;
    $("qAll").checked = everyone;
    $("qSecs").innerHTML = mySecs.map(sn => `<label><input type="checkbox" value="${esc(sn)}" ${everyone || (x ? curSecs.includes(sn) : true) ? "checked" : ""} ${everyone ? "disabled" : ""}> ${esc(sn)}</label>`).join("");
    $("qSecRow").hidden = !!(x && !x.isExtra);   // original questions always reach every section
    $("qDialog").showModal();
}

$("qForm").addEventListener("submit", async e => {
    e.preventDefault();
    const text = $("qText").value.trim(), speaker = $("qSpeaker").value.trim(), key = $("qKey").value.trim();
    if (text.length < 3) return toast("Type the question first.", "warn");
    if (!speaker) return toast("Type the speaker's name.", "warn");
    const dest = editing ? editing.destinationID : sel.value;
    const slot = editing ? (Number.isInteger(editing.slot) ? editing.slot : 0) : Number($("qStop").value);
    if (!editing && !slot) return toast("Choose the question number first.", "warn");
    const keepAll = editing && !editing.isExtra;
    let sections = [...document.querySelectorAll("#qSecs input:checked")].map(c => c.value);
    if (keepAll || (IS_ADMIN_PAGE && $("qAll").checked)) sections = [];
    else if (!sections.length) return toast("Tick at least one section.", "warn");
    const dup = qs.find(x => x.destinationID === dest && (x.questionText || "").trim().toLowerCase() === text.toLowerCase() && (!editing || x.id !== editing.id) && visible(x));
    if (dup) return toast("This destination already has that exact question.", "err");

    const data = { speakerNPC: speaker, questionText: text, keyPoints: key };
    if (!keepAll) data.sections = sections;
    await busy($("qSave"), async () => {
        try {
            if (editing) { await updateDoc(doc(db, "Scenarios_tbl", editing.id), data); toast("Question updated."); }
            else {
                const used = qs.filter(x => x.destinationID === dest && x.slot === slot && mine(x)).length;
                if (used >= MAX_PER_STOP) return toast(`You already added ${MAX_PER_STOP} questions here.`, "err");
                const g = groupsFor(dest).groups.find(k => k.no === slot);
                await addDoc(collection(db, "Scenarios_tbl"), { ...data, options: [], destinationID: dest, slot, stop: g?.name || "", isExtra: true,
                    byRole: IS_ADMIN_PAGE ? "admin" : "teacher", createdBy: auth.currentUser.uid, createdByName: myName, createdAt: serverTimestamp() });
                toast("Question added. Students in the chosen sections may now get it.");
            }
            $("qDialog").close();
            await refresh();
        } catch (err) { console.error(err); toast("Could not save the question. " + niceError(err), "err"); }
    });
});

document.addEventListener("click", async e => {
    const b = e.target.closest("[data-q]");
    if (!b) return;
    if (b.dataset.q === "add") return openForm(null, Number(b.dataset.slot));
    const x = qs.find(q => q.id === b.dataset.id);
    if (!x) return toast("That question no longer exists. Refresh the page.", "err");
    if (!canEdit(x)) return toast("Only the admin can change this question.", "warn");
    if (b.dataset.q === "edit") openForm(x);
    else if (await ask("Delete this question? This cannot be undone.", { title: "Delete question", ok: "Delete", danger: true })) {
        try { await deleteDoc(doc(db, "Scenarios_tbl", x.id)); toast("Question deleted.", "warn"); await refresh(); }
        catch (err) { console.error(err); toast("Could not delete. " + niceError(err), "err"); }
    }
});

// Printable sheet for the instructor (also the backup when there is no wifi)
$("printQ").addEventListener("click", () => {
    if (!qs.length) return toast("The question bank is still loading or empty.", "warn");
    const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const row = (x, n) => `<div style="margin:6px 0;break-inside:avoid"><b>${n}. ${esc(x.questionText)}</b> <small>(${esc(x.speakerNPC || "Tourist")}, ${esc(who(x))} &middot; ${esc(reach(x))})</small><br>
              <span>Key points: ${x.keyPoints ? esc(x.keyPoints) : "<i>none written yet</i>"}</span></div>`;
    const body = DESTS.map((d, i) => {
        const { groups, other } = groupsFor(d);
        return `<h3 style="margin:18px 0 6px;color:#a50012">Map ${i + 1}: ${esc(d)}</h3>` +
            (groups.map(g => `<h4 style="margin:10px 0 2px">${g.tag}${g.name ? " &ndash; " + esc(g.name) : ""}</h4>` + (g.items.map((x, n) => row(x, n + 1)).join("") || "<p><i>No question.</i></p>")).join("")
            + (other.length ? `<h4 style="margin:10px 0 2px">Other added questions</h4>` + other.map((x, n) => row(x, n + 1)).join("") : "") || "<p>No questions.</p>");
    }).join("");
    toast("Choose \"Save as PDF\" in the print window.", "info");
    printHtml(`<div class="pr-head"><img src="images/htm-logo.png" onerror="this.onerror=null;this.src='images/bulsu-seal.png'" alt=""><div><strong>Bulacan State University &middot; Sarmiento Campus</strong><br>
        Department of Tourism Management<br><span class="pr-title">DejaView VR &ndash; Instructor Question Sheet</span></div></div>
        <p>Date printed: ${esc(today)}. Each question is answered out loud in 30 seconds. Each student gets one random question for every question number. Score Knowledge against the key points.</p>${body}`, "DejaView Question Sheet");
});

$("addQ").addEventListener("click", () => openForm(null));
$("qCancel").addEventListener("click", () => $("qDialog").close());
$("qX").addEventListener("click", () => $("qDialog").close());
sel.addEventListener("change", render);
