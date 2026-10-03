import { config, auth, db, $, esc } from "./firebase.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Second app instance: creating a user signs that user in, so we do it on a throwaway instance
const auth2 = getAuth(initializeApp(config, "secondary"));
let sectionNames = [];

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
    const [s, t] = await Promise.all([getDocs(collection(db, "sections")), getDocs(collection(db, "teachers"))]);
    sectionNames = s.docs.map(d => d.data().name).sort();
    $("sectionBody").innerHTML = sectionNames.map(n =>
        `<tr><td>${esc(n)}</td><td><button class="delete-button" data-act="delSection" data-id="${esc(n)}">Delete</button></td></tr>`).join("")
        || '<tr><td colspan="2">No sections yet.</td></tr>';
    $("tSections").innerHTML = sectionNames.map(n => `<option>${esc(n)}</option>`).join("");
    $("teacherBody").innerHTML = t.docs.map(d => {
        const x = d.data();
        return `<tr><td>${esc(x.name)}</td><td>${esc(x.employeeId)}</td><td>${esc(x.email)}</td><td>${esc((x.sections || []).join(", "))}</td>
            <td><button class="edit-button" data-act="editSec" data-id="${d.id}" data-sec="${esc((x.sections || []).join(","))}">Sections</button>
            <button class="delete-button" data-act="delTeacher" data-id="${d.id}">Remove</button></td></tr>`;
    }).join("") || '<tr><td colspan="5">No teachers yet.</td></tr>';
}

$("addSection").addEventListener("click", async () => {
    const n = $("sectionName").value.trim().replace(/\//g, "-");
    if (!n) return;
    await setDoc(doc(db, "sections", n), { name: n });
    $("sectionName").value = "";
    loadAll();
});

$("teacherForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("msg").textContent = "";
    const secs = [...$("tSections").selectedOptions].map(o => o.value);
    if (!secs.length) { $("msg").textContent = "Select at least one section."; return; }
    try {
        const cred = await createUserWithEmailAndPassword(auth2, $("tEmail").value.trim(), $("tPass").value);
        await setDoc(doc(db, "teachers", cred.user.uid), {
            name: $("tName").value.trim(), employeeId: $("tEmpId").value.trim(),
            email: $("tEmail").value.trim(), sections: secs
        });
        await signOut(auth2);
        $("teacherForm").reset();
        loadAll();
    } catch (err) { console.error(err); $("msg").textContent = "Could not create teacher: " + err.code; }
});

document.addEventListener("click", async e => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    try {
        if (b.dataset.act === "delSection") {
            if (confirm("Delete this section?")) await deleteDoc(doc(db, "sections", b.dataset.id));
        } else if (b.dataset.act === "delTeacher") {
            if (confirm("Remove this teacher? Also delete their login in Firebase Console > Authentication.")) await deleteDoc(doc(db, "teachers", b.dataset.id));
        } else if (b.dataset.act === "editSec") {
            const v = prompt(`Sections, comma separated.\nAvailable: ${sectionNames.join(", ")}`, b.dataset.sec);
            if (v === null) return;
            const list = v.split(",").map(x => x.trim()).filter(x => sectionNames.includes(x));
            await updateDoc(doc(db, "teachers", b.dataset.id), { sections: list });
        }
        loadAll();
    } catch (err) { console.error(err); alert("Action failed."); }
});

$("logoutButton").addEventListener("click", async () => { await signOut(auth); location.replace("login.html"); });