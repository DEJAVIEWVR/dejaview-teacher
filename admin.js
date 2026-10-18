import { config, auth, db, $, esc } from "./firebase.js";
import { toast, ask, pickMany, askFields, normName, cleanName, niceError, busy } from "./toast.js";
import { changeMyPassword, strongEnough } from "./account.js";
import { CRIT, DEFAULT_CRIT, applyCriteria, loadCriteria } from "./report.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Second app instance: creating a user signs that user in, so we do it on a throwaway instance
const auth2 = getAuth(initializeApp(config, "secondary"));
const STAFF_DOMAIN = "@staff.dejaview.app";      // teachers log in with their Employee ID
const DEFAULT_HEAD = { headName: "Dr. Nelidiza R. Arceta", headTitle: "Department Head · BSTM Program Head" };
let sections = [], teachers = [], students = [], head = { ...DEFAULT_HEAD };
let myUid = "";
const secNames = () => sections.map(s => s.name);
// who already handles this section (active teachers only), not counting the teacher with id "except"
const takenBy = (n, except) => (teachers.find(t => !t.archived && t.id !== except && (t.sections || []).includes(n)) || {}).name || "";
const capOf = n => (sections.find(s => s.name === n) || {}).capacity || 45;
const toDate = x => (x && x.toDate) ? x.toDate() : null;
const uniq = list => { const seen = new Set(); return list.filter(n => { const k = normName(n); if (seen.has(k)) return false; seen.add(k); return true; }); };

onAuthStateChanged(auth, async user => {
    if (!user) return location.replace("login.html");
    try {
        const a = await getDoc(doc(db, "admins", user.uid));
        if (!a.exists()) return location.replace("index.html");
    } catch (err) {
        console.error(err);
        return location.replace("login.html");
    }
    myUid = user.uid;
    document.body.style.visibility = "visible";   // only reached by a confirmed admin
    await loadCriteria();
    critFill(CRIT);
    loadAll();
});

async function loadAll() {
    try {
        const [s, t, st, cfg] = await Promise.all([getDocs(collection(db, "sections")), getDocs(collection(db, "teachers")), getDocs(collection(db, "students")), getDoc(doc(db, "settings", "app"))]);
        sections = s.docs.map(d => ({ name: d.data().name || d.id, capacity: d.data().capacity || 45 })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        teachers = t.docs.map(d => ({ id: d.id, ...d.data() }));
        students = st.docs.map(d => ({ id: d.id, ...d.data() }));
        head = cfg.exists() ? { ...DEFAULT_HEAD, ...cfg.data() } : { ...DEFAULT_HEAD };
        render();
    } catch (err) {
        console.error(err);
        toast(niceError(err, "Could not load the data."), "err");
    }
}

function initials(n) {
    const w = String(n || "").replace(/\b(dr|prof|engr|mr|mrs|ms|atty)\.?\s/gi, "").trim().split(/\s+/).filter(Boolean);
    return ((w[0] || "A")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}

function render() {
    $("headName").textContent = head.headName; $("headTitle").textContent = head.headTitle;
    $("headNameShort").textContent = head.headName;
    $("avatarTxt").textContent = $("avatarTxt2").textContent = initials(head.headName);
    renderStudents();
    $("sectionBody").innerHTML = sections.map(s => {
        const mine = students.filter(x => x.section === s.name && x.status !== "archived");
        const pend = mine.filter(x => x.status === "pending");
        const late = pend.filter(x => { const d = toDate(x.createdAt); return d && (Date.now() - d) > 2 * 86400000; }).length;
        const ts = teachers.filter(t => !t.archived && (t.sections || []).includes(s.name)).map(t => t.name);
        return `<tr><td><b>${esc(s.name)}</b></td>
            <td><input class="cap-in" type="number" min="1" max="200" value="${s.capacity}" data-cap="${esc(s.name)}" title="Press Enter or click away to save"></td>
            <td>${mine.length} / ${s.capacity}${mine.length > s.capacity ? ' <span class="tag">Over</span>' : ""}</td>
            <td>${pend.length}${late ? ` <span class="chip err">${late} waiting 2+ days</span>` : ""}</td>
            <td>${ts.length ? esc(ts.join(", ")) : '<span class="chip warn">No teacher</span>'}</td>
            <td><button class="delete-button" data-act="delSection" data-id="${esc(s.name)}">Delete</button></td></tr>`;
    }).join("") || '<tr><td colspan="6">No sections yet.</td></tr>';

    // Sections are tick boxes, so a teacher can never be given the same section twice
    $("tSections").innerHTML = secNames().map(n => { const o = takenBy(n); return `<label class="chk${o ? " taken" : ""}"><input type="checkbox" value="${esc(n)}"${o ? " disabled" : ""}> ${esc(n)}${o ? ` <small>(${esc(o)})</small>` : ""}</label>`; }).join("")
        || '<p class="hint">Add sections first.</p>';

    const byName = (x, y) => String(x.name || "").localeCompare(String(y.name || ""));
    const archivedView = $("teacherView").value === "archived";
    const list = teachers.filter(x => !!x.archived === archivedView).sort(byName);
    $("teacherCount").textContent = `${list.length} ${archivedView ? "archived" : "current"} teacher${list.length === 1 ? "" : "s"}`;
    const you = x => x.id === myUid ? ' <span class="chip ok">You</span>' : "";
    $("teacherBody").innerHTML = list.map(x => archivedView
        ? `<tr><td>${esc(x.name)}${you(x)}</td><td>${esc(x.employeeId)}</td><td>${esc((x.sections || []).join(", ")) || '<span class="chip">None</span>'}</td>
         <td><button class="edit-button" data-act="restoreTeacher" data-id="${x.id}">Restore</button></td></tr>`
        : `<tr><td>${esc(x.name)}${you(x)}</td><td>${esc(x.employeeId)}</td><td>${esc((x.sections || []).join(", ")) || '<span class="chip warn">None</span>'}</td>
         <td><button class="edit-button" data-act="editSec" data-id="${x.id}">Sections</button>
         <button class="delete-button" data-act="archTeacher" data-id="${x.id}">Archive</button></td></tr>`).join("")
        || `<tr><td colspan="4">${archivedView ? "No archived teachers. Teachers you archive appear here, and you can restore them." : "No active teachers."}</td></tr>`;
    renderHome();
    updateBell();
    paintTeacherBtn();
}
$("teacherView").addEventListener("change", render);

// ---------- home: quick numbers and one card per section ----------
const isNew = (s, days) => { const d = toDate(s.createdAt); return d && (Date.now() - d) > days * 86400000; };
function secStats() {
    return sections.map(s => {
        const mine = students.filter(x => x.section === s.name && x.status !== "archived");
        const pend = mine.filter(x => x.status === "pending");
        const ts = teachers.filter(t => !t.archived && (t.sections || []).includes(s.name)).map(t => t.name);
        return { name: s.name, cap: s.capacity, reg: mine.length, pend: pend.length, late: pend.filter(x => isNew(x, 2)).length, teachers: ts };
    });
}
function renderHome() {
    const st = secStats();
    const pend = st.reduce((n, x) => n + x.pend, 0), noT = st.filter(x => !x.teachers.length).length;
    const tile = (n, label, cls, go) => `<a class="stat ${cls}" href="#${go}"><b>${n}</b><span>${label}</span></a>`;
    $("statGrid").innerHTML =
        tile(sections.length, "Sections", "", "sections") +
        tile(teachers.filter(t => !t.archived).length, "Current teachers", "", "teachers") +
        tile(students.filter(s => s.status === "active").length, "Active students", "", "students") +
        tile(pend, "Waiting for approval", pend ? "hot" : "", "sections");
    $("capGrid").innerHTML = st.map(x => {
        const pct = Math.min(100, Math.round(x.reg / x.cap * 100));
        return `<div class="cap-card ${x.reg >= x.cap ? "full" : ""}">
          <h3>${esc(x.name)}</h3>
          <div class="cap-num">${x.reg}<small> / ${x.cap} registered</small></div>
          <div class="cap-bar"><i style="width:${pct}%"></i></div>
          <div class="hint">${x.pend} pending approval${x.late ? ` &middot; <b style="color:#b3261e">${x.late} waiting 2+ days</b>` : ""}${x.reg > x.cap ? ` &middot; <b style="color:#b3261e">over capacity</b>` : ""}</div>
          <div class="hint">${x.teachers.length ? "Teacher: " + esc(x.teachers.join(", ")) : '<span class="chip warn">No teacher yet</span>'}</div></div>`;
    }).join("") || '<p class="hint">No sections yet. Open <b>Sections</b> to add them.</p>';
}

// ---------- notifications (opening the bell marks them as read, like Facebook) ----------
function buildNotes() {
    const notes = [], st = secStats();
    st.filter(x => x.reg > x.cap).forEach(x => notes.push({ t: "err", h: `${x.name} is over capacity`, p: `${x.reg} registered, capacity ${x.cap}. Check for wrong sections or raise the capacity.` }));
    st.filter(x => x.late > 0).forEach(x => notes.push({ t: "err", h: `${x.name}: ${x.late} student${x.late > 1 ? "s" : ""} waiting 2 days or more`, p: "The teacher has not approved them yet. Remind the teacher." }));
    st.filter(x => !x.teachers.length).forEach(x => notes.push({ t: "", h: `${x.name} has no teacher`, p: `Open Teacher Accounts and press Sections on a teacher to assign ${x.name}.` }));
    teachers.filter(t => !t.archived && !(t.sections || []).length).forEach(t => notes.push({ t: "", h: `${t.name} has no section`, p: "This teacher sees no students. Press Sections on the teacher to assign one." }));
    return notes;
}
const seenKey = () => "dvSeenA_" + myUid;
const readSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(seenKey()) || "[]")); } catch (e) { return new Set(); } };
const saveSeen = notes => { try { localStorage.setItem(seenKey(), JSON.stringify(notes.map(n => n.h))); } catch (e) { /* storage blocked */ } };
function updateBell() {
    const seen = readSeen(), n = buildNotes().filter(x => !seen.has(x.h)).length;
    $("bellDot").textContent = n; $("bellDot").style.display = n ? "" : "none";
    document.title = (n ? `(${n}) ` : "") + "DejaView - Admin Portal";
}
const noteIcon = h => /capacity/i.test(h) ? '<i class="ico ico-alert"></i>' : /waiting/i.test(h) ? '<i class="ico ico-user"></i>' : /no teacher|no section/i.test(h) ? '<i class="ico ico-users"></i>' : '<i class="ico ico-bell"></i>';
$("bell").addEventListener("click", () => {
    const notes = buildNotes(), seen = readSeen();
    const fresh = notes.filter(n => !seen.has(n.h)).length;
    const row = n => { const nw = !seen.has(n.h);
        return `<div class="note ${n.t} ${nw ? "unread" : "read"}"><span class="ic">${noteIcon(n.h)}</span>
          <div class="nt"><b>${esc(n.h)}</b><span>${esc(n.p)}</span></div>
          <span class="nstate">${nw ? "NEW" : '<i class="ico ico-check"></i> Read'}</span></div>`; };
    $("noteSub").textContent = notes.length ? (fresh ? `${fresh} new, ${notes.length - fresh} already read.` : "You have read everything. Nothing new.") : "";
    $("noteBody").innerHTML = notes.length
        ? [...notes.filter(n => !seen.has(n.h)), ...notes.filter(n => seen.has(n.h))].map(row).join("")
        : '<div class="note ok read"><span class="ic"><i class="ico ico-checkc"></i></span><div class="nt"><b>All clear</b><span>Nothing needs your attention right now.</span></div></div>';
    $("noteDialog").showModal();
    saveSeen(notes); updateBell();
});
$("noteClose").addEventListener("click", () => $("noteDialog").close());
$("noteX").addEventListener("click", () => $("noteDialog").close());

// ---------- the admin can also be a teacher ----------
const myTeacher = () => teachers.find(t => t.id === myUid);
function paintTeacherBtn() {
    const t = myTeacher();
    $("teacherBtn").innerHTML = !t ? '<i class="ico ico-teacher"></i> Also be a teacher' : t.archived ? '<i class="ico ico-teacher"></i> Restore my teacher access' : '<i class="ico ico-teacher"></i> Open my teacher dashboard';
}
$("teacherBtn").addEventListener("click", async () => {
    const t = myTeacher();
    if (t && !t.archived) return location.assign("index.html");
    try {
        if (t) {   // my teacher record was archived earlier
            if (!(await ask("Restore your teacher access? You can then open the teacher dashboard again.", { title: "Restore teacher access", ok: "Restore" }))) return;
            await updateDoc(doc(db, "teachers", t.id), { archived: false });
            toast("Your teacher access is back."); return loadAll();
        }
        const v = await askFields({
            title: "Also be a teacher",
            message: "This lets you open the teacher dashboard with this same account, to approve, activate and evaluate students of the sections you choose.",
            fields: [
                { key: "name", label: "Your full name", value: head.headName, min: 2, max: 80 },
                { key: "emp", label: "Your Employee ID (10 digits)", min: 10, max: 10, help: "Numbers only." }
            ],
            validate: x => !/^[0-9]{10}$/.test(x.emp) ? "The Employee ID must be exactly 10 digits." : teachers.some(o => o.employeeId === x.emp) ? "That Employee ID is already used by another teacher." : ""
        });
        if (!v) return;
        const chosen = await pickMany({ title: "Your sections", message: "Tick every section you will handle as a teacher.", options: secNames().map(n => { const o = takenBy(n, myUid); return { value: n, label: n, disabled: !!o, note: o }; }), selected: [] });
        if (chosen === null) return;
        if (!chosen.length) return toast("Tick at least one section.", "warn");
        await setDoc(doc(db, "teachers", myUid), { name: v.name.trim(), employeeId: v.emp, email: auth.currentUser.email || "", sections: uniq(chosen) });
        toast("Done. You are now also a teacher. Open the menu again and choose \"Open my teacher dashboard\".");
        await loadAll();
    } catch (err) { console.error(err); toast("Could not do that. " + niceError(err), "err"); }
});

// ---------- department head name and title (shown in the header) ----------
$("editHead").addEventListener("click", async () => {
    const v = await askFields({
        title: "Name shown in the header", message: "This is the person and title shown at the top of the admin page.",
        fields: [
            { key: "headName", label: "Name", value: head.headName, min: 2, max: 80 },
            { key: "headTitle", label: "Position / title", value: head.headTitle, min: 2, max: 100 }
        ]
    });
    if (!v) return;
    try { await setDoc(doc(db, "settings", "app"), { headName: v.headName, headTitle: v.headTitle }); toast("Header updated."); await loadAll(); }
    catch (err) { console.error(err); toast("Could not save. " + niceError(err), "err"); }
});
$("pwBtn").addEventListener("click", changeMyPassword);
$("guideBtn").addEventListener("click", () => window.open("guide-admin.html", "_blank", "noopener"));

// ---------- add sections ----------
$("addSection").addEventListener("click", e => busy(e.currentTarget, async () => {
    // "BSTM" is fixed: the admin only types 1A, 2B ...
    const raw = [$("sectionName").value].map(x => x.trim().replace(/^bstm[\s\-_]*/i, "")).filter(Boolean)
        .map(x => cleanName("BSTM " + x));
    if (raw.some(n => !/^BSTM [A-Z0-9][A-Z0-9\-]{0,9}$/.test(n))) return toast("Type only the year and letter, like 1A or 2B.", "warn");
    const cap = parseInt($("sectionCap").value, 10);
    if (!raw.length) return toast("Type a section, like 1A or 2B.", "warn");
    if (!(cap >= 1 && cap <= 200)) return toast("Capacity must be a number from 1 to 200.", "warn");
    if (raw.some(n => n.length > 40)) return toast("A section name is too long (maximum 40 characters).", "warn");

    const have = new Set(secNames().map(normName));
    const added = [], skipped = [], seen = new Set();
    for (const n of raw) {
        const k = normName(n);
        if (have.has(k) || seen.has(k)) { skipped.push(n); continue; }
        seen.add(k);
        try { await setDoc(doc(db, "sections", n), { name: n, capacity: cap }); added.push(n); }
        catch (err) { console.error(err); toast(`Could not add ${n}. ${niceError(err)}`, "err"); }
    }
    $("sectionName").value = "";
    if (added.length) toast(`Added ${added.length} section${added.length > 1 ? "s" : ""}: ${added.join(", ")} (capacity ${cap}).`);
    if (skipped.length) toast(`Already exists, skipped: ${skipped.join(", ")}`, "warn");
    await loadAll();
}));

// ---------- edit capacity (inline) ----------
document.addEventListener("change", async e => {
    const inp = e.target.closest("input[data-cap]");
    if (!inp) return;
    const name = inp.dataset.cap, v = parseInt(inp.value, 10), old = capOf(name);
    if (!(v >= 1 && v <= 200)) { inp.value = old; return toast("Capacity must be a number from 1 to 200.", "warn"); }
    if (v === old) return;
    const reg = students.filter(x => x.section === name && x.status !== "archived").length;
    if (v < reg && !(await ask(`${name} already has ${reg} registered students. Set the capacity to ${v} anyway?`, { title: "Capacity is lower than registered" }))) { inp.value = old; return; }
    try { await setDoc(doc(db, "sections", name), { name, capacity: v }); toast(`${name} capacity is now ${v}.`); await loadAll(); }
    catch (err) { console.error(err); inp.value = old; toast(niceError(err, "Could not change the capacity."), "err"); }
});

// ---------- Employee ID: digits only, with a live counter while typing ----------
function empHelp() {
    const n = $("tEmpId").value.length, el = $("empHelp");
    if (!n) { el.textContent = ""; el.style.color = ""; }
    else if (n < 10) { el.textContent = `${n} of 10 digits. Keep typing.`; el.style.color = "#b26a00"; }
    else { el.textContent = ""; el.style.color = ""; }
}
$("tEmpId").addEventListener("input", () => {
    const clean = $("tEmpId").value.replace(/[^0-9]/g, "").slice(0, 10);
    if (clean !== $("tEmpId").value) { $("tEmpId").value = clean; toast("Employee ID accepts numbers only (10 digits).", "warn"); }
    empHelp();
});

// ---------- create teacher ----------
$("teacherForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("tName").value.trim(), emp = $("tEmpId").value.trim(), pass = $("tPass").value, mail = $("tEmail").value.trim().toLowerCase();
    const secs = [...$("tSections").querySelectorAll("input:checked")].map(i => i.value);
    if (name.length < 2) return toast("Enter the teacher's full name.", "warn");
    if (!/^[0-9]{10}$/.test(emp)) return toast("Employee ID must be exactly 10 digits. Numbers only, no letters or symbols.", "err");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return toast("Type the teacher's own email address. It is used when they forget their password.", "err");
    if (!strongEnough(pass)) return toast("Password needs at least 8 characters, with at least one letter and one number.", "err");
    if (!secs.length) return toast("Tick at least one section for this teacher.", "warn");
    const dup = teachers.find(t => (t.employeeId || "") === emp);
    if (dup) return toast(dup.archived ? `That Employee ID belongs to ${dup.name}, who is archived. Press Restore in the table instead.` : "That Employee ID is already used by another teacher.", "err");

    await busy($("createTeacher"), async () => {
        const login = mail;   // the teacher's real email is the login. The Employee ID still works: it is looked up in loginIds.
        try {
            let cred;
            try { cred = await createUserWithEmailAndPassword(auth2, login, pass); }
            catch (err) {
                // The ID was used before (teacher removed earlier): re-use it if the password matches
                if ((err.code || "").includes("email-already-in-use")) {
                    try { cred = await signInWithEmailAndPassword(auth2, login, pass); }
                    catch (e2) { return toast("This Employee ID was used before. Type the same password it had, or ask the developer to reset it.", "err"); }
                } else throw err;
            }
            await setDoc(doc(db, "teachers", cred.user.uid), { name, employeeId: emp, email: login, sections: uniq(secs) });
            await setDoc(doc(db, "loginIds", emp), { email: login });
            await signOut(auth2);
            $("teacherForm").reset(); empHelp();
            toast(`Teacher account created for ${name}. They log in with Employee ID ${emp} (or their email).`);
            await loadAll();
        } catch (err) { console.error(err); toast("Could not create the teacher. " + niceError(err), "err"); }
    });
});

// ---------- table actions ----------
document.addEventListener("click", async e => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    try {
        if (act === "delSection") {
            const name = b.dataset.id;
            const kids = students.filter(x => x.section === name && x.status !== "archived").length;
            if (kids) return toast(`${name} still has ${kids} student(s). Ask the teacher to remove or archive them first.`, "err");
            const owners = teachers.filter(t => (t.sections || []).includes(name));
            const msg = owners.length ? `${name} is assigned to ${owners.map(t => t.name).join(", ")}. It will be removed from their list too. Delete it?` : `Delete section ${name}?`;
            if (!(await ask(msg, { title: "Delete section", ok: "Delete", danger: true }))) return;
            for (const t of owners) await updateDoc(doc(db, "teachers", t.id), { sections: (t.sections || []).filter(s => s !== name) });
            await deleteDoc(doc(db, "sections", name));
            toast(`Section ${name} deleted.`, "warn");
        } else if (act === "archTeacher") {
            const t = teachers.find(x => x.id === b.dataset.id);
            const others = teachers.filter(x => x.id !== t.id && !x.archived);
            const alone = (t.sections || []).filter(sn => !others.some(o => (o.sections || []).includes(sn)))
                .map(sn => ({ sn, n: students.filter(s => s.section === sn && s.status !== "archived").length }));
            const blocked = alone.filter(x => x.n > 0);
            if (blocked.length) {
                await ask(`${t.name} is the only teacher of ${blocked.map(x => `${x.sn} (${x.n} student${x.n > 1 ? "s" : ""})`).join(", ")}. Those students would have no instructor. First give those sections to another teacher (press "Sections" on that teacher), then archive ${t.name}.`, { title: "Cannot archive yet", ok: "OK, I will assign a teacher" });
                return;
            }
            const empty = alone.map(x => x.sn);
            const note = empty.length ? ` ${empty.join(", ")} has no students yet but will be left without a teacher.` : "";
            if (!(await ask(`Archive ${t.name}? They can no longer log in or open the dashboard. Their record is kept and you can restore them any time.${note}`, { title: "Archive teacher", ok: "Archive", danger: true }))) return;
            await updateDoc(doc(db, "teachers", t.id), { archived: true });
            toast(`${t.name} was archived.`, "warn");
        } else if (act === "restoreTeacher") {
            const t = teachers.find(x => x.id === b.dataset.id);
            if (!(await ask(`Restore ${t.name}? They can log in again with the same Employee ID and password.`, { title: "Restore teacher", ok: "Restore" }))) return;
            await updateDoc(doc(db, "teachers", t.id), { archived: false });
            toast(`${t.name} is active again.`);
        } else if (act === "editSec") {
            const t = teachers.find(x => x.id === b.dataset.id);
            const chosen = await pickMany({
                title: `Sections of ${t.name}`, message: "Tick every section this teacher handles.",
                options: secNames().map(n => { const o = takenBy(n, t.id); return { value: n, label: n, disabled: !!o, note: o }; }), selected: t.sections || []
            });
            if (chosen === null) return;
            if (!chosen.length && !(await ask("No section ticked. This teacher will see no students. Continue?"))) return;
            await updateDoc(doc(db, "teachers", t.id), { sections: uniq(chosen) });
            toast(`${t.name} now handles ${chosen.length} section${chosen.length === 1 ? "" : "s"}.`);
        }
        await loadAll();
    } catch (err) { console.error(err); toast("Action failed. " + niceError(err), "err"); }
});

$("logoutButton").addEventListener("click", async () => {
    if (!(await ask("Log out of the admin portal?", { title: "Log out", ok: "Log out" }))) return;
    await signOut(auth); location.replace("login.html");
});

// ---------- one page per menu item ----------
const TABS = ["home", "sections", "teachers", "students", "modules", "bank", "criteria"];
function showTab() {
    const id = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
    TABS.forEach(t => { const s = $(t); if (s) s.classList.toggle("on", t === id); });
    document.querySelectorAll("nav a").forEach(a => a.classList.toggle("current", a.getAttribute("href") === "#" + id));
    window.scrollTo(0, 0);
}
window.addEventListener("hashchange", showTab);
showTab();

// ---------- profile circle menu ----------
const menu = $("profMenu"), avBtn = $("avatarBtn");
const setMenu = open => { menu.hidden = !open; avBtn.setAttribute("aria-expanded", String(open)); };
avBtn.addEventListener("click", e => { e.stopPropagation(); setMenu(menu.hidden); });
document.addEventListener("click", e => { if (!menu.hidden && !e.target.closest(".prof")) setMenu(false); });
document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });
menu.addEventListener("click", e => { if (e.target.closest("button")) setMenu(false); });

// ---------- student list (view only: search + section) ----------
const niceDate = x => { const d = toDate(x); return d ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "-"; };
const STATUS_CHIP = { active: "ok", pending: "warn", archived: "" };

function renderStudents() {
    const sel = $("stuSection"), keep = sel.value;
    sel.innerHTML = '<option value="">All sections</option>' + secNames().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    sel.value = secNames().includes(keep) ? keep : "";

    const q = $("stuSearch").value.trim().toLowerCase(), sec = sel.value;
    const list = students.filter(x =>
        x.status === "active" && (!sec || x.section === sec) &&
        (!q || [x.fullname, x.studentIdNumber, x.username].some(v => String(v || "").toLowerCase().includes(q)))
    ).sort((a, b) => String(a.section || "").localeCompare(String(b.section || ""), undefined, { numeric: true })
            || String(a.fullname || "").localeCompare(String(b.fullname || "")));

    $("stuCount").textContent = `${list.length} student${list.length === 1 ? "" : "s"}`;
    $("stuBody").innerHTML = list.map(x => `<tr>
        <td><b>${esc(x.fullname)}</b><br><span class="hint">${esc(x.username || "")}</span></td>
        <td>${esc(x.studentIdNumber)}</td><td>${esc(x.section)}</td>
        <td>${niceDate(x.createdAt)}</td>
    </tr>`).join("")
        || '<tr><td colspan="4">No official students match.</td></tr>';
}
["stuSearch", "stuSection"].forEach(id => $(id).addEventListener("input", renderStudents));

// ---------- grading criteria (add, remove, rename; maximums add up to 100) ----------
const MAX_CRIT = 10;
const critCount = () => $("critRows").querySelectorAll(".crit-row").length;
function critTotal() { return [...$("critRows").querySelectorAll(".crit-max")].reduce((n, i) => n + (parseInt(i.value, 10) || 0), 0); }
function critUpdate() {
    const n = critTotal(), ok = n === 100;
    $("critTotal").textContent = ok ? "Total: 100 / 100" : `Total: ${n} / 100. The maximums must add up to exactly 100.`;
    $("critTotal").className = "crit-total " + (ok ? "ok" : "bad");
    $("critSave").disabled = !ok;
    $("critAdd").disabled = critCount() >= MAX_CRIT;
    $("critRows").querySelectorAll(".crit-del").forEach(b => b.disabled = critCount() <= 1);
}
function critRow(k, l, m, d) {
    return `<div class="crit-row" data-k="${esc(k)}">
        <input class="crit-name" maxlength="60" value="${esc(l)}" placeholder="Criterion name" aria-label="Criterion name">
        <input class="crit-max" type="number" min="1" max="100" step="1" value="${m}" aria-label="Maximum points"><span>pts</span>
        <button type="button" class="crit-del" title="Remove this criterion" aria-label="Remove this criterion"><i class="ico ico-x"></i></button>
        <input class="crit-desc" maxlength="140" value="${esc(d || "")}" placeholder="Explanation: what is the student judged on?" aria-label="Explanation"></div>`;
}
function critFill(rows) { $("critRows").innerHTML = rows.map(([k, l, m, d]) => critRow(k, l, m, d)).join(""); critUpdate(); }
$("critRows").addEventListener("input", critUpdate);
$("critRows").addEventListener("click", e => {
    const b = e.target.closest(".crit-del");
    if (!b || critCount() <= 1) return;
    b.closest(".crit-row").remove(); critUpdate();
});
$("critAdd").addEventListener("click", () => {
    if (critCount() >= MAX_CRIT) return toast(`You can have at most ${MAX_CRIT} criteria.`, "warn");
    $("critRows").insertAdjacentHTML("beforeend", critRow("c" + Date.now().toString(36) + critCount(), "", 0, ""));
    critUpdate();
    const last = $("critRows").querySelector(".crit-row:last-child .crit-name"); if (last) last.focus();
    toast("Type the name, the points and a short explanation of the new criterion. If the total is over 100, lower another criterion.", "info");
});
$("critReset").addEventListener("click", () => { critFill(DEFAULT_CRIT); toast("Defaults restored. Press Save criteria to keep them.", "info"); });
$("critSave").addEventListener("click", e => busy(e.currentTarget, async () => {
    const items = [], seen = new Set();
    for (const row of $("critRows").querySelectorAll(".crit-row")) {
        const label = row.querySelector(".crit-name").value.trim();
        const max = Number(row.querySelector(".crit-max").value);
        const desc = row.querySelector(".crit-desc").value.trim();
        if (label.length < 2) return toast("Every criterion needs a name (at least 2 letters).", "warn");
        if (seen.has(label.toLowerCase())) return toast(`"${label}" is used twice. Give each criterion its own name.`, "warn");
        if (!Number.isInteger(max) || max < 1 || max > 100) return toast(`"${label}": the maximum must be a whole number from 1 to 100.`, "warn");
        if (desc.length < 5) return toast(`Write a short explanation for "${label}" (at least 5 letters).`, "warn");
        seen.add(label.toLowerCase());
        items.push({ key: row.dataset.k, label, max, desc });
    }
    if (!items.length || items.length > MAX_CRIT) return toast(`Keep between 1 and ${MAX_CRIT} criteria.`, "warn");
    if (items.reduce((n, c) => n + c.max, 0) !== 100) return toast("The maximums must add up to exactly 100.", "warn");
    try {
        await setDoc(doc(db, "settings", "criteria"), { items });
        applyCriteria({ items });
        toast("Grading criteria saved. They apply to every section and to the student page.");
    } catch (err) { console.error(err); toast("Could not save. " + niceError(err), "err"); }
}));
