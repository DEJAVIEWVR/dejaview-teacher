import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, query, where, getDocs, getDoc, setDoc, doc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { TERM_MONTHS, DESTS } from "./destinations.js";
import { CRIT, printReport, printHtml } from "./report.js";
import { toast, ask, choose, askText, busy, niceError } from "./toast.js";
import { changeMyPassword } from "./account.js";

let me = null, uid = "", sections = [];
let students = [], sessions = [], evals = {}, marks = {}, capOf = {};
let view = "active", dirty = false, evalFor = null;
let head = { headName: "", headTitle: "" };
const warned = new Set(), wasOpen = new Set();
const ALL = DESTS.map((_, i) => i + 1);
const empty = (n, m) => `<tr><td colspan="${n}">${m}</td></tr>`;

// ---------- helpers ----------
const newExpiry = () => { const d = new Date(); d.setMonth(d.getMonth() + TERM_MONTHS); return Timestamp.fromDate(d); };
const toDate = x => (x && x.toDate) ? x.toDate() : null;
const isExpired = s => { const d = toDate(s.expiresAt); return !!d && d < new Date(); };
const isOpen = s => s.status === "open" && toDate(s.closesAt) > new Date();
const daysAgo = d => d ? Math.floor((Date.now() - d) / 86400000) : 0;
const hhmm = d => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const sessId = (sec, lv, u) => `${sec}_L${lv}` + (u ? "_" + u : "");
const evalId = (u, lv) => `${u}_L${lv}`;
const markId = (u, lv) => `${u}_L${lv}`;
const clamp = (v, max) => Math.max(0, Math.min(max, isNaN(v) ? 0 : v));
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
const sortName = (a, b) => natural(a.fullname || "", b.fullname || "");
const sortedSections = () => sections.slice().sort(natural);
const live = () => students.filter(s => s.status !== "archived");
const MINUTES = [[30, "30 minutes"], [45, "45 minutes"], [60, "1 hour"], [90, "1.5 hours"], [120, "2 hours"], [180, "3 hours"]];
const minOpts = sel => MINUTES.map(([m, l]) => `<option value="${m}" ${m === sel ? "selected" : ""}>${l}</option>`).join("");
const mapOpts = `<option value="all">All 3 maps</option>${DESTS.map((d, i) => `<option value="${i + 1}">Map ${i + 1} only</option>`).join("")}`;
const levelsOf = v => v === "all" ? ALL : [+v];
const SAFE = async (btn, fn) => busy(btn, async () => { try { await fn(); } catch (err) { console.error(err); toast("Action failed. " + niceError(err), "err"); } });
const secRow = (n, sec, text) => `<tr class="sec-row"><td colspan="${n}">${esc(sec)} <small>${text}</small></td></tr>`;

// ---------- start ----------
onAuthStateChanged(auth, async user => {
    if (!user) return location.replace("login.html");
    let t;
    try {
        t = await getDoc(doc(db, "teachers", user.uid));
        if (!t.exists()) {
            const a = await getDoc(doc(db, "admins", user.uid));
            if (a.exists()) return location.replace("admin.html");
            await signOut(auth);
            return location.replace("login.html");
        }
    } catch (err) { console.error(err); return location.replace("login.html"); }
    uid = user.uid;
    me = t.data();
    sections = me.sections || [];
    $("who").textContent = `${me.name || "Instructor"} | Section(s): ${sortedSections().join(", ") || "none assigned"}`;
    document.body.style.visibility = "visible";
    $("playMaps").innerHTML = mapOpts;
    $("playMinutes").innerHTML = minOpts(45);
    const opts = sortedSections().map(s => `<option>${esc(s)}</option>`).join("") + (sections.length > 1 ? '<option value="">All my sections</option>' : "");
    $("sectionFilter").innerHTML = opts; $("recSection").innerHTML = opts;   // starts on the first section so long lists stay short
    await load(true);
    toast(`Welcome, ${me.name || "Instructor"}.`, "info");
    setInterval(() => load(false), 60000);   // refresh every minute: new registrations, finished maps, closing sessions
});

// ---------- loading ----------
async function load(first) {
    if (!sections.length) {
        $("pendingBody").innerHTML = empty(6, "No section assigned. Ask the admin.");
        $("studentTable").innerHTML = empty(7, "No section assigned. Ask the admin.");
        $("capGrid").innerHTML = '<p class="hint">No section assigned. Ask the admin to assign your sections.</p>';
        if (first) toast("No section is assigned to you yet. Ask the admin.", "warn");
        return;
    }
    try {
        // Queries MUST filter by section or the security rules reject them (Firestore 'in' allows up to 30)
        const q = c => getDocs(query(collection(db, c), where("section", "in", sections)));
        const [s, se, ev, sc, secs, cfg] = await Promise.all([q("students"), q("sessions"), q("evaluations"), q("scores"), getDocs(collection(db, "sections")), getDoc(doc(db, "settings", "app")).catch(() => null)]);
        if (cfg && cfg.exists()) head = { headName: cfg.data().headName || "", headTitle: cfg.data().headTitle || "" };
        const prevPending = new Set(students.filter(x => x.status === "pending").map(x => x.id));
        const prevMarks = new Set(Object.keys(marks));
        students = s.docs.map(d => ({ id: d.id, ...d.data() }));
        sessions = se.docs.map(d => ({ id: d.id, ...d.data() }));
        evals = {}; ev.docs.forEach(d => evals[d.id] = d.data());
        marks = {}; sc.docs.forEach(d => marks[d.id] = d.data());
        capOf = {}; secs.docs.forEach(d => capOf[d.data().name] = d.data().capacity || 45);
        if (!first) {
            students.filter(x => x.status === "pending" && !prevPending.has(x.id))
                .forEach(x => toast(`New registration: ${x.fullname} (${x.section})`, "info"));
            Object.entries(marks).filter(([k]) => !prevMarks.has(k)).forEach(([, m]) =>
                toast(`${m.fullname} finished Map ${m.level}. Ready for your evaluation.`, "ok"));
        }
        render();
        watchSessions();
        if (first) remind();
    } catch (err) {
        console.error(err);
        if (first) $("studentTable").innerHTML = empty(7, "Unable to load students.");
        toast(niceError(err, "Unable to refresh the data."), "err");
    }
}

// ---------- capacity + reminders ----------
function stats() {
    return sortedSections().map(sec => {
        const list = live().filter(s => s.section === sec);
        const cap = capOf[sec] || 45;
        return { sec, reg: list.length, cap, pending: list.filter(s => s.status === "pending").length, missing: Math.max(0, cap - list.length), over: Math.max(0, list.length - cap) };
    });
}

// Shown once each time the teacher logs in; the bell and banner keep it visible afterwards
function remind() {
    if (sessionStorage.getItem("dvRemind") === "1") return;
    const st = stats(), lack = st.filter(x => x.missing > 0);
    const pend = st.reduce((n, x) => n + x.pending, 0);
    const late = live().filter(s => s.status === "pending" && daysAgo(toDate(s.createdAt)) >= 2).length;
    const grade = needGrading().length;
    if (!lack.length && !pend && !grade) return;
    sessionStorage.setItem("dvRemind", "1");
    $("remindBody").innerHTML =
        (pend ? `<p><b>${pend}</b> student(s) are waiting for your approval${late ? ` (<b>${late}</b> for 2 days or more)` : ""}.</p>` : "") +
        (grade ? `<p><b>${grade}</b> finished map(s) are waiting for your evaluation.</p>` : "") +
        (lack.length ? `<p>Students who have not registered yet:</p><ul>${lack.map(x => `<li><b>${esc(x.sec)}</b>: ${x.missing} missing (${x.reg}/${x.cap} registered)</li>`).join("")}</ul>
          <p class="hint">Tell them to register in the DejaView VR app before the activity.</p>` : "");
    $("remindDialog").showModal();
}

function needGrading() {
    return Object.values(marks).filter(m => {
        const s = students.find(x => x.id === m.uid);
        const e = evals[evalId(m.uid, m.level)];
        return s && s.status === "active" && !(e && e.status === "submitted");
    });
}

function buildNotes() {
    const notes = [], st = stats();
    const pend = live().filter(s => s.status === "pending");
    const late = pend.filter(s => daysAgo(toDate(s.createdAt)) >= 2);
    if (pend.length) notes.push({ t: late.length ? "err" : "", h: `${pend.length} pending approval${pend.length > 1 ? "s" : ""}`, p: late.length ? `${late.length} waiting 2 days or more. Open Pending Approvals.` : "Open Pending Approvals to review them." });
    const grade = needGrading();
    if (grade.length) notes.push({ t: "", h: `${grade.length} map${grade.length > 1 ? "s" : ""} waiting for your evaluation`, p: grade.slice(0, 6).map(m => `${m.fullname} (Map ${m.level})`).join(", ") + (grade.length > 6 ? "..." : "") + ". Press Evaluate in the Student List." });
    const drafts = Object.values(evals).filter(e => e.status === "draft");
    if (drafts.length) notes.push({ t: "", h: `${drafts.length} draft evaluation${drafts.length > 1 ? "s" : ""} not released`, p: "Students cannot see drafts. Press Evaluate and then Submit & release." });
    st.filter(x => x.missing > 0).forEach(x => notes.push({ t: "", h: `${x.sec}: ${x.missing} student${x.missing > 1 ? "s" : ""} not registered yet`, p: `${x.reg} of ${x.cap} registered.` }));
    st.filter(x => x.over > 0).forEach(x => notes.push({ t: "err", h: `${x.sec} is over capacity`, p: `${x.reg} registered, capacity ${x.cap}. Check for wrong sections.` }));
    sessions.filter(isOpen).forEach(s => {
        const mins = Math.ceil((toDate(s.closesAt) - Date.now()) / 60000);
        const who = (students.find(x => x.id === s.studentUid) || {}).fullname || "A student";
        if (mins <= 10) notes.push({ t: "err", h: `Play time closing soon: ${who}, Map ${s.level}`, p: `${mins} minute(s) left.` });
    });
    live().filter(s => s.status === "active" && !isExpired(s)).forEach(s => {
        const d = toDate(s.expiresAt);
        if (d && d - Date.now() < 14 * 86400000) notes.push({ t: "", h: `${s.fullname}'s account expires soon`, p: `Valid until ${d.toLocaleDateString()}. Use More actions > Renew account.` });
    });
    live().filter(s => s.status === "active" && isExpired(s)).forEach(s => notes.push({ t: "err", h: `${s.fullname}'s account has expired`, p: "Renew it (More actions) so the student can log in." }));
    return notes;
}

function updateBell() {
    const n = buildNotes().length;
    $("bellDot").textContent = n; $("bellDot").style.display = n ? "" : "none";
    document.title = (n ? `(${n}) ` : "") + "DejaView - Instructor Dashboard";
}

// toasts for play time about to close or just ended
function watchSessions() {
    sessions.forEach(s => {
        const label = (students.find(x => x.id === s.studentUid) || {}).fullname || "A student";
        if (isOpen(s)) {
            wasOpen.add(s.id);
            const mins = Math.ceil((toDate(s.closesAt) - Date.now()) / 60000);
            if (mins <= 5 && !warned.has(s.id)) { warned.add(s.id); toast(`Play time for ${label} (Map ${s.level}) closes in ${mins} min.`, "warn"); }
        } else if (wasOpen.has(s.id)) { wasOpen.delete(s.id); toast(`Play time ended for ${label} (Map ${s.level}).`, "info"); }
    });
}

function renderCap() {
    const st = stats();
    const lack = st.filter(x => x.missing > 0);
    $("capBanner").innerHTML = lack.length
        ? `<div class="alert"><b>Reminder:</b> ${lack.map(x => `${esc(x.sec)} is short by ${x.missing} (${x.reg}/${x.cap})`).join(" &middot; ")}</div>`
        : '<div class="alert ok">All sections are complete. Every expected student has registered.</div>';
    $("capGrid").innerHTML = st.map(x => {
        const pct = Math.min(100, Math.round(x.reg / x.cap * 100));
        const playing = sessions.filter(s => isOpen(s) && s.section === x.sec && s.studentUid).map(s => s.studentUid);
        return `<div class="cap-card ${x.missing === 0 ? "full" : ""}">
          <h3>${esc(x.sec)}</h3>
          <div class="cap-num">${x.reg}<small> / ${x.cap} registered</small></div>
          <div class="cap-bar"><i style="width:${pct}%"></i></div>
          <div class="hint">${x.pending} pending approval &middot; ${x.missing} not yet registered${x.over ? ` &middot; <b style="color:#b3261e">${x.over} over capacity</b>` : ""}</div>
          <div class="hint">${new Set(playing).size ? `<span class="live-dot"></span>${new Set(playing).size} student(s) activated now` : "Nobody activated right now"}</div>
          <div class="cap-row"><button class="delete-button" data-act="endSem" data-sec="${esc(x.sec)}">End semester (archive)</button></div></div>`;
    }).join("");
}

// ---------- tables ----------
function render() { renderCap(); renderStudents(); renderRecords(); updateBell(); }

function waiting(s) {
    const n = daysAgo(toDate(s.createdAt));
    return n >= 2 ? `<span class="chip err">Waiting ${n} days</span>` : n === 1 ? '<span class="chip warn">1 day</span>' : '<span class="chip">Today</span>';
}

function mapsChips(s) {
    return `<div class="maps">${ALL.map(n => marks[markId(s.id, n)] ? `<span class="chip ok" title="${esc(DESTS[n - 1])}">Map ${n} &#10003;</span>` : `<span class="chip" title="${esc(DESTS[n - 1])}">Map ${n}</span>`).join("")}</div>`;
}

// Rows grouped by section: BSTM 1A first, then 1B, and so on
const doneCount = s => ALL.filter(n => marks[markId(s.id, n)]).length;
const hasPlay = s => sessions.some(x => isOpen(x) && x.studentUid === s.id);
const needsGrade = s => ALL.some(n => marks[markId(s.id, n)] && !(evals[evalId(s.id, n)] && evals[evalId(s.id, n)].status === "submitted"));
function sorter(by) {
    return by === "id" ? (a, b) => natural(a.studentIdNumber || "", b.studentIdNumber || "")
        : by === "maps" ? (a, b) => doneCount(b) - doneCount(a) || sortName(a, b)
        : sortName;
}
function grouped(list, cols, rowFn, emptyText, sortFn) {
    const only = $("sectionFilter").value;
    return sortedSections().filter(sec => !only || sec === only).map(sec => {
        const rows = list.filter(s => s.section === sec).sort(sortFn || sortName);
        return secRow(cols, sec, `${rows.length} student${rows.length === 1 ? "" : "s"}`) + (rows.map(rowFn).join("") || empty(cols, emptyText));
    }).join("") || empty(cols, "No section selected.");
}

function renderStudents() {
    const q = $("searchStudent").value.toLowerCase().trim();
    const match = s => [s.studentIdNumber, s.fullname, s.username, s.section].join(" ").toLowerCase().includes(q);
    const pendAll = students.filter(s => s.status === "pending" && match(s));
    $("pendingCount").textContent = students.filter(s => s.status === "pending").length;
    $("approveAll").style.display = students.filter(s => s.status === "pending").length > 1 ? "" : "none";

    const only = $("sectionFilter").value;
    $("pendingBody").innerHTML = sortedSections().filter(sec => !only || sec === only).map(sec => {
        const rows = pendAll.filter(s => s.section === sec).sort(sortName);
        return rows.length ? secRow(5, sec, `${rows.length} waiting`) + rows.map(s =>
            `<tr><td>${esc(s.studentIdNumber)}</td><td>${esc(s.fullname)}<br><small class="hint">${esc(s.username || "")}</small></td><td>${waiting(s)}</td>
             <td colspan="2"><button class="approve-button" data-act="approve" data-id="${s.id}">Approve</button>
             <button class="delete-button" data-act="reject" data-id="${s.id}">Reject</button></td></tr>`).join("") : "";
    }).join("") || empty(5, "No pending registrations" + (only ? " in " + only : "") + ".");

    const sortFn = sorter($("sortBy").value), show = $("showFilter").value;
    const inScope = list => list.filter(s => !only || s.section === only);

    if (view === "archived") {
        const list = students.filter(s => s.status === "archived" && match(s));
        $("studentCount").textContent = `Showing ${inScope(list).length} archived student(s).`;
        $("studentHead").innerHTML = "<tr><th>Student ID</th><th>Full Name</th><th>Maps</th><th colspan='3'>Actions</th></tr>";
        $("studentTable").innerHTML = grouped(list, 6, s =>
            `<tr><td>${esc(s.studentIdNumber)}</td><td>${esc(s.fullname)}</td><td>${mapsChips(s)}</td><td colspan="3">
             <button class="approve-button" data-act="restore" data-id="${s.id}">Restore</button>
             <button class="delete-button" data-act="remove" data-id="${s.id}">Remove</button></td></tr>`, "No archived students.", sortFn);
        return;
    }

    let list = students.filter(s => s.status === "active" && match(s));
    if (show === "active") list = list.filter(hasPlay);
    else if (show === "inactive") list = list.filter(s => !hasPlay(s));
    else if (show === "grade") list = list.filter(needsGrade);
    const total = inScope(list).length, all = inScope(students.filter(s => s.status === "active")).length;
    $("studentCount").textContent = `Showing ${total} of ${all} student(s)${only ? " in " + only : ""}.`;

    $("studentHead").innerHTML = "<tr><th>Student</th><th>Maps finished</th><th>Account valid until</th><th>Play access</th><th>Actions</th></tr>";
    $("studentTable").innerHTML = grouped(list, 5, s => {
        const d = toDate(s.expiresAt), ex = isExpired(s);
        const mine = sessions.filter(x => isOpen(x) && x.studentUid === s.id);
        const lv = [...new Set(mine.map(x => x.level))].sort();
        const until = mine.length ? hhmm(new Date(Math.max(...mine.map(x => toDate(x.closesAt))))) : "";
        const access = ex ? '<span class="chip err">Expired</span>'
            : mine.length ? `<span class="chip ok"><span class="live-dot"></span>Map${lv.length > 1 ? "s" : ""} ${lv.join(", ")} until ${until}</span>`
            : '<span class="chip warn">Inactive</span>';
        const done = doneCount(s);
        const first = ex ? "" : mine.length
            ? `<button class="delete-button" data-act="deactivate" data-id="${s.id}">Deactivate</button>`
            : `<button class="approve-button" data-act="activate" data-id="${s.id}" ${done === ALL.length ? "disabled title='All maps are finished. Use More actions > Reset a finished map.'" : ""}>Activate</button>`;
        return `<tr class="${ex ? "expired" : ""}">
         <td><b>${esc(s.fullname)}</b><br><small class="hint">${esc(s.studentIdNumber)}</small></td>
         <td>${mapsChips(s)}</td>
         <td>${d ? d.toLocaleDateString() : "-"}</td>
         <td>${access}</td>
         <td class="acts">${first}
           <button class="add-button" data-act="evaluate" data-id="${s.id}">Evaluate</button>
           <select class="more" data-id="${s.id}"><option value="">More actions...</option>
             <option value="resetMap" ${done ? "" : "disabled"}>Reset a finished map</option>
             <option value="edit">Edit name</option><option value="renew">Renew account</option><option value="remove">Remove student</option></select></td></tr>`;
    }, "No students match this filter.", sortFn);
}

// ---------- records (read-only scores, grouped by section) ----------
const avgOf = s => { const got = ALL.map(n => evals[evalId(s.id, n)]).filter(Boolean); return got.length ? got.reduce((n, e) => n + (+e.total || 0), 0) / got.length : null; };
function renderRecords() {
    const only = $("recSection").value, show = $("recShow").value, by = $("recSort").value;
    const q = $("recSearch").value.toLowerCase().trim();
    const sortFn = by === "id" ? (a, b) => natural(a.studentIdNumber || "", b.studentIdNumber || "")
        : by === "avg" ? (a, b) => (avgOf(b) ?? -1) - (avgOf(a) ?? -1) || sortName(a, b) : sortName;
    const pass = s => {
        if (q && ![s.studentIdNumber, s.fullname].join(" ").toLowerCase().includes(q)) return false;
        const es = ALL.map(n => evals[evalId(s.id, n)]).filter(Boolean);
        if (show === "none") return !es.length;
        if (show === "draft") return es.some(e => e.status === "draft");
        if (show === "released") return es.length === ALL.length && es.every(e => e.status === "submitted");
        return true;
    };
    let shown = 0, total = 0;
    $("recBody").innerHTML = sortedSections().filter(sec => !only || sec === only).map(sec => {
        const all = students.filter(s => s.status === "active" && s.section === sec);
        const rows = all.filter(pass).sort(sortFn);
        shown += rows.length; total += all.length;
        return secRow(8, sec, `${rows.length} of ${all.length} student${all.length === 1 ? "" : "s"}`) + (rows.map(s => {
            const es = ALL.map(n => evals[evalId(s.id, n)]);
            const rel = es.filter(e => e && e.status === "submitted").length, avg = avgOf(s);
            return `<tr><td>${esc(s.studentIdNumber)}</td><td>${esc(s.fullname)}</td>
              ${es.map(e => `<td>${e ? `${(+e.total).toFixed(1)}${e.status === "draft" ? ' <span class="chip warn">draft</span>' : ""}` : "-"}</td>`).join("")}
              <td><b>${avg == null ? "-" : avg.toFixed(1)}</b></td><td>${rel} of ${ALL.length}</td>
              <td><button class="edit-button" data-act="viewRec" data-id="${s.id}">View</button></td></tr>`;
        }).join("") || empty(8, "No students match this filter."));
    }).join("") || empty(8, "No section selected.");
    $("recCount").textContent = `Showing ${shown} of ${total} student(s)${only ? " in " + only : ""}.`;
}

// ---------- evaluate (pop-up) ----------
const totalOf = r => CRIT.reduce((n, [k]) => n + (+r[k] || 0), 0);

function openEval(s) {
    evalFor = s; dirty = false;
    $("evalTitle").textContent = `Evaluate: ${s.fullname}`;
    $("evalSub").textContent = `${s.studentIdNumber} · ${s.section}`;
    $("evalHead").innerHTML = `<tr><th>Destination</th>${CRIT.map(([, l, m]) => `<th>${l} (${m})</th>`).join("")}<th>Total</th><th>Remarks</th><th>Status</th></tr>`;
    $("evalBody").innerHTML = DESTS.map((d, i) => {
        const e = evals[evalId(s.id, i + 1)] || {}, played = !!marks[markId(s.id, i + 1)];
        return `<tr data-lv="${i + 1}"><td>${esc(d)}<br>${played ? '<span class="chip ok">Finished the map</span>' : '<span class="chip">Not played yet</span>'}</td>
          ${CRIT.map(([k, , m]) => `<td><input class="eval-in" type="number" step="0.5" min="0" max="${m}" data-k="${k}" data-max="${m}" value="${e[k] ?? ""}"></td>`).join("")}
          <td><b class="evTotal">${e.total != null ? (+e.total).toFixed(1) : "-"}</b></td>
          <td><input class="rem" maxlength="200" placeholder="optional" value="${esc(e.remarks || "")}"></td>
          <td>${e.status === "submitted" ? '<span class="chip ok">Released</span>' : e.status === "draft" ? '<span class="chip warn">Draft</span>' : '<span class="chip">Not graded</span>'}</td></tr>`;
    }).join("");
    $("evalDialog").showModal();
}

$("evalBody").addEventListener("input", e => {
    const inp = e.target.closest(".eval-in,.rem"); if (!inp) return;
    dirty = true;
    const row = inp.closest("tr");
    if (inp.classList.contains("eval-in")) inp.classList.toggle("bad", +inp.value > +inp.dataset.max || +inp.value < 0);
    const ins = [...row.querySelectorAll(".eval-in")];
    row.querySelector(".evTotal").textContent = ins.some(i => i.value !== "") ? ins.reduce((n, i) => n + clamp(+i.value, +i.dataset.max), 0).toFixed(1) : "-";
});

async function closeEval() {
    if (dirty && !(await ask("You have unsaved scores. Close without saving?", { title: "Unsaved scores", ok: "Close anyway", danger: true }))) return;
    dirty = false; $("evalDialog").close();
}
$("evalCancel").addEventListener("click", closeEval);
$("evalDialog").addEventListener("cancel", ev => { ev.preventDefault(); closeEval(); });   // Esc key

async function saveEval(submit, btn) {
    const s = evalFor;
    if (!s) return;
    const rows = [...$("evalBody").querySelectorAll("tr[data-lv]")];
    if (rows.some(r => r.querySelector(".eval-in.bad"))) return toast("Some scores are above the maximum. Please fix the red boxes.", "err");
    const todo = rows.filter(r => [...r.querySelectorAll(".eval-in")].some(i => i.value !== ""));
    if (!todo.length) return toast("Enter at least one score first.", "warn");
    if (submit) {
        const blank = todo.some(r => [...r.querySelectorAll(".eval-in")].some(i => i.value === ""));
        const msg = `${blank ? "Some criteria are blank and will count as 0. " : ""}Release ${todo.length} result${todo.length > 1 ? "s" : ""} to ${s.fullname}? The student will see them right away.`;
        if (!(await ask(msg, { title: "Submit & release", ok: "Submit & release" }))) return;
    } else if (todo.some(r => (evals[evalId(s.id, +r.dataset.lv)] || {}).status === "submitted") &&
        !(await ask("Saving as draft hides an already released result from the student. Continue?", { title: "Hide released result" }))) return;
    await SAFE(btn, async () => {
        for (const r of todo) {
            const lv = +r.dataset.lv, data = {
                uid: s.id, studentIdNumber: s.studentIdNumber, fullname: s.fullname, section: s.section,
                level: lv, destination: DESTS[lv - 1], remarks: r.querySelector(".rem").value.trim(),
                status: submit ? "submitted" : "draft", evaluatorUid: uid, evaluatorName: me.name || "", updatedAt: Timestamp.now()
            };
            r.querySelectorAll(".eval-in").forEach(i => data[i.dataset.k] = clamp(+i.value, +i.dataset.max));
            data.total = Math.round(totalOf(data) * 10) / 10;
            if (submit) data.submittedAt = Timestamp.now();
            await setDoc(doc(db, "evaluations", evalId(s.id, lv)), data);
        }
        dirty = false; $("evalDialog").close();
        toast(submit ? `Evaluation submitted. ${s.fullname} can now see the result.` : "Draft saved. The student cannot see it yet.");
        await load(false);
    });
}
$("evalSave").addEventListener("click", e => saveEval(false, e.currentTarget));
$("evalSubmit").addEventListener("click", e => saveEval(true, e.currentTarget));

// ---------- record detail + printing ----------
let viewing = null;
function openView(s) {
    viewing = s;
    $("viewTitle").textContent = s.fullname;
    $("viewSub").textContent = `${s.studentIdNumber} · ${s.section}`;
    $("viewHead").innerHTML = `<tr><th>Destination</th>${CRIT.map(([, l, m]) => `<th>${l} (${m})</th>`).join("")}<th>Total</th><th>Status</th></tr>`;
    $("viewBody").innerHTML = DESTS.map((d, i) => {
        const e = evals[evalId(s.id, i + 1)];
        return e ? `<tr><td>${esc(d)}</td>${CRIT.map(([k]) => `<td>${(+e[k] || 0).toFixed(1)}</td>`).join("")}<td><b>${(+e.total || 0).toFixed(1)}</b></td>
                    <td>${e.status === "submitted" ? '<span class="chip ok">Released</span>' : '<span class="chip warn">Draft</span>'}</td></tr>
                    ${e.remarks ? `<tr><td colspan="8" class="hint">Remarks: ${esc(e.remarks)}</td></tr>` : ""}`
                 : `<tr><td>${esc(d)}</td><td colspan="7" class="hint">Not graded yet</td></tr>`;
    }).join("");
    $("viewDialog").showModal();
}
$("viewClose").addEventListener("click", () => $("viewDialog").close());
$("viewPrint").addEventListener("click", () => {
    const s = viewing, rows = ALL.map(n => evals[evalId(s.id, n)]).filter(Boolean);
    if (!rows.length) return toast("This student has no saved evaluation yet.", "warn");
    toast("Choose \"Save as PDF\" in the print window.", "info");
    printReport({ name: s.fullname, id: s.studentIdNumber, section: s.section, instructor: me.name || "", rows });
});

function sheetFor(sec, today) {
    const list = students.filter(s => s.status === "active" && s.section === sec).sort(sortName);
    const rows = list.map((s, n) => {
        const es = ALL.map(i => evals[evalId(s.id, i)]), got = es.filter(Boolean);
        const avg = got.length ? got.reduce((a, e) => a + (+e.total || 0), 0) / got.length : null;
        return `<tr><td>${n + 1}</td><td>${esc(s.studentIdNumber)}</td><td style="text-align:left">${esc(s.fullname)}</td>${es.map(e => `<td>${e ? (+e.total).toFixed(1) : "-"}</td>`).join("")}<td><b>${avg == null ? "-" : avg.toFixed(1)}</b></td></tr>`;
    }).join("");
    return `<div class="pr-sec"><div class="pr-head"><img src="images/htm-logo.png" onerror="this.onerror=null;this.src='images/bulsu-seal.png'" alt=""><div><strong>Bulacan State University &middot; Sarmiento Campus</strong><br>
      Department of Hospitality and Tourism Management<br><span class="pr-title">DejaView VR &ndash; Class Score Sheet</span></div></div>
      <table class="pr-info"><tr><td>Section</td><td>${esc(sec)}</td><td>Instructor</td><td>${esc(me.name || "")}</td></tr><tr><td>Students</td><td>${list.length}</td><td>Date printed</td><td>${esc(today)}</td></tr></table>
      <table class="pr-table"><thead><tr><th>#</th><th>Student ID</th><th>Name</th>${DESTS.map(d => `<th>${esc(d)} (100)</th>`).join("")}<th>Average</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="pr-sign"><div><span></span>Instructor: ${esc(me.name || "")}</div><div><span></span>Noted by: ${esc(head.headName || "")}<br><small>${esc(head.headTitle || "")}</small></div></div></div>`;
}
$("printClass").addEventListener("click", () => {
    const only = $("recSection").value, list = only ? [only] : sortedSections();
    const withStudents = list.filter(sec => students.some(s => s.status === "active" && s.section === sec));
    if (!withStudents.length) return toast("There are no students to print.", "warn");
    const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    toast("Choose \"Save as PDF\" in the print window.", "info");
    printHtml(withStudents.map(sec => sheetFor(sec, today)).join(""), "DejaView Class Scores" + (only ? " - " + only : ""));
});

// ---------- sessions (play access, one student at a time) ----------
async function openSessions(sec, levels, minutes, studentUid) {
    const closes = new Date(Date.now() + minutes * 60000);
    await Promise.all(levels.map(lv => setDoc(doc(db, "sessions", sessId(sec, lv, studentUid)), {
        section: sec, level: lv, destination: DESTS[lv - 1], status: "open", studentUid: studentUid || "",
        opensAt: Timestamp.now(), closesAt: Timestamp.fromDate(closes), teacherUid: uid, teacherName: me.name || ""
    })));
    levels.forEach(lv => { warned.delete(sessId(sec, lv, studentUid)); });
    return closes;
}
const closeSessions = list => Promise.all(list.map(s => updateDoc(doc(db, "sessions", s.id), { status: "closed" })));

// ---------- actions ----------
async function runAction(act, s, btn) {
    await SAFE(btn, async () => {
        switch (act) {
            case "approve":
                await updateDoc(doc(db, "students", s.id), { status: "active", approvedAt: Timestamp.now(), expiresAt: newExpiry() });
                toast(`${s.fullname} approved. The account is valid for ${TERM_MONTHS} months.`); break;
            case "approveAll": {
                const list = students.filter(x => x.status === "pending");
                if (!list.length) return toast("There is nothing to approve.", "warn");
                if (!(await ask(`Approve all ${list.length} pending students? Only do this if you recognize every name.`, { title: "Approve all", ok: "Approve all" }))) return;
                for (const x of list) await updateDoc(doc(db, "students", x.id), { status: "active", approvedAt: Timestamp.now(), expiresAt: newExpiry() });
                toast(`${list.length} students approved.`); break;
            }
            case "reject":
                if (!(await ask(`Reject ${s.fullname}? The registration is deleted. If it was a mistake, the student can register again in the VR app.`, { title: "Reject registration", ok: "Reject", danger: true }))) return;
                await deleteDoc(doc(db, "students", s.id)); toast(`${s.fullname}'s registration was rejected.`, "warn"); break;
            case "renew":
                if (!(await ask(`Extend ${s.fullname}'s account by ${TERM_MONTHS} months from today?`, { title: "Renew account", ok: "Renew" }))) return;
                await updateDoc(doc(db, "students", s.id), { status: "active", expiresAt: newExpiry() });
                toast(`${s.fullname}'s account was renewed.`); break;
            case "restore":
                if (!(await ask(`Restore ${s.fullname} as an active student for ${TERM_MONTHS} months?`, { title: "Restore student", ok: "Restore" }))) return;
                await updateDoc(doc(db, "students", s.id), { status: "active", expiresAt: newExpiry() });
                toast(`${s.fullname} restored.`); break;
            case "remove": {
                if (!(await ask(`Remove ${s.fullname}? Their play records and evaluations are deleted too. This cannot be undone.`, { title: "Remove student", ok: "Remove", danger: true }))) return;
                const jobs = [];
                ALL.forEach(n => {
                    if (evals[evalId(s.id, n)]) jobs.push(deleteDoc(doc(db, "evaluations", evalId(s.id, n))));
                    if (marks[markId(s.id, n)]) jobs.push(deleteDoc(doc(db, "scores", markId(s.id, n))));
                });
                sessions.filter(x => x.studentUid === s.id).forEach(x => jobs.push(deleteDoc(doc(db, "sessions", x.id))));
                await Promise.all(jobs);
                await deleteDoc(doc(db, "students", s.id));
                toast(`${s.fullname} was removed.`, "warn"); break;
            }
            case "edit": {
                const n = await askText({ title: "Edit full name", label: `Student ID ${s.studentIdNumber}`, value: s.fullname, min: 2, max: 80 });
                if (n === null || n === s.fullname) return;
                await updateDoc(doc(db, "students", s.id), { fullname: n }); toast("Name updated."); break;
            }
            case "activate": {
                if (isExpired(s)) return toast("This account has expired. Renew it first.", "err");
                const levels = levelsOf($("playMaps").value).filter(n => !marks[markId(s.id, n)]);
                if (!levels.length) return toast(`${s.fullname} already finished ${$("playMaps").value === "all" ? "all the maps" : "that map"}. Use More actions > Reset a finished map to allow a retake.`, "warn");
                const c = await openSessions(s.section, levels, +$("playMinutes").value, s.id);
                const skipped = levelsOf($("playMaps").value).length - levels.length;
                toast(`${s.fullname} can play Map${levels.length > 1 ? "s" : ""} ${levels.join(", ")} until ${hhmm(c)}.${skipped ? ` (${skipped} finished map${skipped > 1 ? "s" : ""} skipped)` : ""}`); break;
            }
            case "deactivate":
                await closeSessions(sessions.filter(x => isOpen(x) && x.studentUid === s.id));
                toast(`${s.fullname} can no longer play.`, "warn"); break;
            case "resetMap": {
                const done = ALL.filter(n => marks[markId(s.id, n)]);
                if (!done.length) return toast("This student has not finished any map.", "warn");
                const lv = await choose({ title: "Reset a map", message: `Which finished map should ${s.fullname} be allowed to play again?`, options: done.map(n => ({ value: n, label: `Map ${n} - ${DESTS[n - 1]}` })), ok: "Reset" });
                if (lv === null) return;
                if (!(await ask(`Reset Map ${lv} for ${s.fullname}? The map unlocks again. Their saved evaluation stays until you change it. You still need to press Activate.`, { title: "Reset map", ok: "Reset map", danger: true }))) return;
                await deleteDoc(doc(db, "scores", markId(s.id, +lv)));
                toast(`Map ${lv} was reset for ${s.fullname}. Press Activate to let them play it again.`); break;
            }
        }
        await load(false);
    });
}

document.addEventListener("click", e => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act, s = students.find(x => x.id === b.dataset.id);
    if (act === "evaluate") return openEval(s);
    if (act === "viewRec") return openView(s);
    if (act === "endSem") {
        // endSem needs the section name instead of a student
        return (async () => {
            const sec = b.dataset.sec, list = students.filter(x => x.section === sec && x.status !== "archived");
            if (!list.length) return toast(`${sec} has no students to archive.`, "warn");
            if (!(await ask(`End the semester for ${sec}? ${list.length} student(s) are archived: they can no longer log in or play, and they disappear from the active lists and the capacity count. Their records are kept. Use this before a new batch registers.`, { title: "End semester", ok: "Archive them", danger: true }))) return;
            await SAFE(b, async () => {
                await closeSessions(sessions.filter(x => isOpen(x) && x.section === sec));
                for (const x of list) await updateDoc(doc(db, "students", x.id), { status: "archived" });
                toast(`${sec}: ${list.length} student(s) archived.`, "warn");
                await load(false);
            });
        })();
    }
    runAction(act, s, b);
});

// The "More actions" dropdown on every student row
document.addEventListener("change", e => {
    const sel = e.target.closest("select.more");
    if (!sel) return;
    const act = sel.value, s = students.find(x => x.id === sel.dataset.id);
    sel.value = "";
    if (act && s) runAction(act, s, null);
});

$("studentView").addEventListener("change", () => { view = $("studentView").value; renderStudents(); });
["sectionFilter", "showFilter", "sortBy"].forEach(id => $(id).addEventListener("change", renderStudents));
["recSection", "recShow", "recSort"].forEach(id => $(id).addEventListener("change", renderRecords));
$("recSearch").addEventListener("input", renderRecords);
$("searchStudent").addEventListener("input", renderStudents);
$("remindOk").addEventListener("click", () => $("remindDialog").close());
window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

// ---------- bell, password, hash toasts, logout ----------
$("bell").addEventListener("click", () => {
    const notes = buildNotes();
    $("noteBody").innerHTML = notes.length
        ? notes.map(n => `<div class="note ${n.t}"><b>${esc(n.h)}</b>${esc(n.p)}</div>`).join("")
        : '<div class="note ok"><b>All clear</b>Nothing needs your attention right now.</div>';
    $("noteDialog").showModal();
});
$("noteClose").addEventListener("click", () => $("noteDialog").close());

$("pwBtn").addEventListener("click", changeMyPassword);

window.addEventListener("hashchange", () => {
    if (location.hash !== "#students") return;
    const lack = stats().filter(x => x.missing > 0);
    if (lack.length) toast("Not yet registered: " + lack.map(x => `${x.sec} (${x.missing})`).join(", "), "warn");
});

$("logoutButton").addEventListener("click", async () => {
    if (!(await ask("Log out of the instructor dashboard?", { title: "Log out", ok: "Log out" }))) return;
    sessionStorage.removeItem("dvRemind"); dirty = false;
    await signOut(auth); location.replace("login.html");
});
