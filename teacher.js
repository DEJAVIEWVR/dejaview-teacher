import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, query, where, getDocs, getDoc, doc, updateDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { TERM_MONTHS } from "./destinations.js";

const CRIT = ["knowledge", "timeMgmt", "navigation", "problemSolving", "completion"];
let sections = [], students = [], scores = [];
const empty = (n, m) => `<tr><td colspan="${n}">${m}</td></tr>`;

// Account validity: TERM_MONTHS after approval or renewal
const newExpiry = () => { const d = new Date(); d.setMonth(d.getMonth() + TERM_MONTHS); return Timestamp.fromDate(d); };
const expDate = s => (s.expiresAt && s.expiresAt.toDate) ? s.expiresAt.toDate() : null;
const isExpired = s => { const d = expDate(s); return !!d && d < new Date(); };

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
    } catch (err) {
        console.error(err);
        return location.replace("login.html");
    }
    const d = t.data();
    sections = d.sections || [];
    $("who").textContent = `${d.name || "Instructor"} | Section(s): ${sections.join(", ") || "none assigned"}`;
    document.body.style.visibility = "visible";
    load();
});

async function load() {
    if (!sections.length) {
        $("pendingBody").innerHTML = empty(5, "No section assigned. Ask the admin.");
        $("studentTable").innerHTML = empty(6, "No section assigned. Ask the admin.");
        return;
    }
    try {
        // Queries MUST filter by section or the security rules reject them (Firestore 'in' allows up to 30)
        const [s, sc] = await Promise.all([
            getDocs(query(collection(db, "students"), where("section", "in", sections))),
            getDocs(query(collection(db, "scores"), where("section", "in", sections)))
        ]);
        students = s.docs.map(d => ({ id: d.id, ...d.data() }));
        scores = sc.docs.map(d => d.data());
        render();
    } catch (err) {
        console.error(err);
        $("studentTable").innerHTML = empty(6, "Unable to load students.");
    }
}

function render() {
    const q = $("searchStudent").value.toLowerCase().trim();
    const match = s => [s.studentIdNumber, s.fullname, s.username, s.section].join(" ").toLowerCase().includes(q);
    const cells = s => `<td>${esc(s.studentIdNumber)}</td><td>${esc(s.fullname)}</td><td>${esc(s.username)}</td><td>${esc(s.section)}</td>`;
    const pendAll = students.filter(s => s.status === "pending");
    const actAll = students.filter(s => s.status === "active");

    $("pendingCount").textContent = pendAll.length;
    $("pendingBody").innerHTML = pendAll.filter(match).map(s =>
        `<tr>${cells(s)}<td><button class="approve-button" data-act="approve" data-id="${s.id}">Approve</button>
         <button class="delete-button" data-act="remove" data-id="${s.id}">Reject</button></td></tr>`).join("")
        || empty(5, "No pending registrations.");

    $("studentTable").innerHTML = actAll.filter(match).map(s => {
        const d = expDate(s), ex = isExpired(s);
        return `<tr class="${ex ? "expired" : ""}">${cells(s)}
         <td>${d ? d.toLocaleDateString() : "-"}${ex ? '<span class="tag">Expired</span>' : ""}</td>
         <td><button class="edit-button" data-act="edit" data-id="${s.id}">Edit</button>
         <button class="approve-button" data-act="renew" data-id="${s.id}">Renew</button>
         <button class="delete-button" data-act="remove" data-id="${s.id}">Remove</button></td></tr>`;
    }).join("") || empty(6, "No active students found.");

    const keep = $("perfStudent").value;
    $("perfStudent").innerHTML = '<option value="">Select a student</option>' +
        actAll.map(s => `<option value="${s.id}">${esc(s.fullname)} (${esc(s.studentIdNumber)})</option>`).join("");
    $("perfStudent").value = keep;
    showPerf();
}

function showPerf() {
    const id = $("perfStudent").value;
    if (!id) { $("perfBody").innerHTML = empty(7, "Select a student."); $("perfSummary").textContent = ""; return; }
    const rows = scores.filter(r => r.uid === id).sort((a, b) => (a.level || 0) - (b.level || 0));
    $("perfBody").innerHTML = rows.map(r =>
        `<tr><td>${esc(r.destination || "Level " + r.level)}</td>${CRIT.map(k => `<td>${(+r[k] || 0).toFixed(1)}</td>`).join("")}
         <td><strong>${(+r.total || 0).toFixed(1)}</strong></td></tr>`).join("") || empty(7, "No records yet.");
    const avg = rows.length ? rows.reduce((a, r) => a + (+r.total || 0), 0) / rows.length : 0;
    $("perfSummary").textContent = rows.length ? `Levels completed: ${rows.length} | Average total: ${avg.toFixed(1)} / 100` : "";
}

document.addEventListener("click", async e => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const s = students.find(x => x.id === b.dataset.id);
    const ref = doc(db, "students", b.dataset.id);
    try {
        if (b.dataset.act === "approve") await updateDoc(ref, { status: "active", approvedAt: Timestamp.now(), expiresAt: newExpiry() });
        else if (b.dataset.act === "renew") {
            if (!confirm(`Extend ${s.fullname}'s account by ${TERM_MONTHS} months from today?`)) return;
            await updateDoc(ref, { status: "active", expiresAt: newExpiry() });
        } else if (b.dataset.act === "remove") {
            if (!confirm(`Remove ${s.fullname}?`)) return;
            await deleteDoc(ref);
        } else if (b.dataset.act === "edit") {
            const n = prompt("Full name:", s.fullname);
            if (!n || !n.trim()) return;
            await updateDoc(ref, { fullname: n.trim() });
        }
        await load();
    } catch (err) { console.error(err); alert("Action failed. Check your permissions."); }
});

$("searchStudent").addEventListener("input", render);
$("perfStudent").addEventListener("change", showPerf);
$("logoutButton").addEventListener("click", async () => {
    if (confirm("Log out?")) { await signOut(auth); location.replace("login.html"); }
});
