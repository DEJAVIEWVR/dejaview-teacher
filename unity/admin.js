import { config, auth, db, $, esc } from "./firebase.js";
import { toast, ask, pickMany, askFields, normName, cleanName, niceError, busy } from "./toast.js";
import { changeMyPassword, strongEnough } from "./account.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Second app instance: creating a user signs that user in, so we do it on a throwaway instance
const auth2 = getAuth(initializeApp(config, "secondary"));
const STAFF_DOMAIN = "@staff.dejaview.app";      // teachers log in with their Employee ID
const DEFAULT_HEAD = { headName: "Dr. Nelidiza R. Arceta", headTitle: "Department Head · BSTM Program Head" };
let sections = [], teachers = [], students = [], head = { ...DEFAULT_HEAD };
const secNames = () => sections.map(s => s.name);
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
    document.body.style.visibility = "visible";   // only reached by a confirmed admin
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

function render() {
    $("headName").textContent = head.headName; $("headTitle").textContent = head.headTitle;
    $("sectionBody").innerHTML = sections.map(s => {
        const mine = students.filter(x => x.section === s.name && x.status !== "archived");
        const pend = mine.filter(x => x.status === "pending");
        const late = pend.filter(x => { const d = toDate(x.createdAt); return d && (Date.now() - d) > 2 * 86400000; }).length;
        const ts = teachers.filter(t => (t.sections || []).includes(s.name)).map(t => t.name);
        return `<tr><td><b>${esc(s.name)}</b></td>
            <td><input class="cap-in" type="number" min="1" max="200" value="${s.capacity}" data-cap="${esc(s.name)}" title="Press Enter or click away to save"></td>
            <td>${mine.length} / ${s.capacity}${mine.length > s.capacity ? ' <span class="tag">Over</span>' : ""}</td>
            <td>${pend.length}${late ? ` <span class="chip err">${late} waiting 2+ days</span>` : ""}</td>
            <td>${ts.length ? esc(ts.join(", ")) : '<span class="chip warn">No teacher</span>'}</td>
            <td><button class="delete-button" data-act="delSection" data-id="${esc(s.name)}">Delete</button></td></tr>`;
    }).join("") || '<tr><td colspan="6">No sections yet.</td></tr>';

    // Sections are tick boxes, so a teacher can never be given the same section twice
    $("tSections").innerHTML = secNames().map(n => `<label class="chk"><input type="checkbox" value="${esc(n)}"> ${esc(n)}</label>`).join("")
        || '<p class="hint">Add sections first.</p>';

    $("teacherBody").innerHTML = teachers.map(x =>
        `<tr><td>${esc(x.name)}</td><td>${esc(x.employeeId)}</td><td>${esc((x.sections || []).join(", ")) || '<span class="chip warn">None</span>'}</td>
         <td><button class="edit-button" data-act="editSec" data-id="${x.id}">Sections</button>
         <button class="delete-button" data-act="delTeacher" data-id="${x.id}">Remove</button></td></tr>`).join("")
        || '<tr><td colspan="4">No teachers yet.</td></tr>';
}

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

// ---------- add sections ----------
$("addSection").addEventListener("click", e => busy(e.currentTarget, async () => {
    const raw = $("sectionName").value.split(/[,\n]/).map(cleanName).filter(Boolean);
    const cap = parseInt($("sectionCap").value, 10);
    if (!raw.length) return toast("Type at least one section name.", "warn");
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
    if (!n) { el.textContent = "The teacher logs in with this Employee ID."; el.style.color = ""; }
    else if (n < 10) { el.textContent = `${n} of 10 digits. Keep typing.`; el.style.color = "#b26a00"; }
    else { el.textContent = "10 digits. Looks good."; el.style.color = "#1f7a3a"; }
}
$("tEmpId").addEventListener("input", () => {
    const clean = $("tEmpId").value.replace(/[^0-9]/g, "").slice(0, 10);
    if (clean !== $("tEmpId").value) { $("tEmpId").value = clean; toast("Employee ID accepts numbers only (10 digits).", "warn"); }
    empHelp();
});

// ---------- create teacher ----------
$("teacherForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("tName").value.trim(), emp = $("tEmpId").value.trim(), pass = $("tPass").value;
    const secs = [...$("tSections").querySelectorAll("input:checked")].map(i => i.value);
    if (name.length < 2) return toast("Enter the teacher's full name.", "warn");
    if (!/^[0-9]{10}$/.test(emp)) return toast("Employee ID must be exactly 10 digits. Numbers only, no letters or symbols.", "err");
    if (!strongEnough(pass)) return toast("Password needs at least 8 characters, with at least one letter and one number.", "err");
    if (!secs.length) return toast("Tick at least one section for this teacher.", "warn");
    if (teachers.some(t => (t.employeeId || "") === emp)) return toast("That Employee ID is already used by another teacher.", "err");

    await busy($("createTeacher"), async () => {
        const login = emp + STAFF_DOMAIN;
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
            await signOut(auth2);
            $("teacherForm").reset(); empHelp();
            toast(`Teacher account created for ${name}. They log in with Employee ID ${emp}.`);
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
        } else if (act === "delTeacher") {
            const t = teachers.find(x => x.id === b.dataset.id);
            if (!(await ask(`Remove ${t.name}? They can no longer open the dashboard, and their students will have no instructor until you assign the sections to another teacher.`, { title: "Remove teacher", ok: "Remove", danger: true }))) return;
            await deleteDoc(doc(db, "teachers", t.id));
            toast(`${t.name} was removed.`, "warn");
        } else if (act === "editSec") {
            const t = teachers.find(x => x.id === b.dataset.id);
            const chosen = await pickMany({
                title: `Sections of ${t.name}`, message: "Tick every section this teacher handles.",
                options: secNames().map(n => ({ value: n, label: n })), selected: t.sections || []
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
