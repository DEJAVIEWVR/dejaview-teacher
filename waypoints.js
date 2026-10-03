import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, setDoc, doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { DESTS, MAX_EXTRA } from "./destinations.js";

onAuthStateChanged(auth, u => { if (u) load(); });

async function load() {
    const q = {};
    try { (await getDocs(collection(db, "levels"))).docs.forEach(d => q[d.data().name] = d.data().extraWaypoints ?? MAX_EXTRA); } catch (e) { console.error(e); }
    $("wpBody").innerHTML = DESTS.map(n => `<tr><td>${esc(n)}</td><td><select data-dest="${esc(n)}">` +
        Array.from({ length: MAX_EXTRA + 1 }, (_, i) => `<option ${(q[n] ?? MAX_EXTRA) === i ? "selected" : ""}>${i}</option>`).join("") + "</select></td></tr>").join("");
}

document.addEventListener("change", async e => {
    const s = e.target.closest("select[data-dest]");
    if (!s) return;
    try {
        await setDoc(doc(db, "levels", s.dataset.dest.replace(/\W+/g, "_")), { name: s.dataset.dest, extraWaypoints: +s.value });
        $("wpMsg").textContent = "Saved.";
    } catch (err) { console.error(err); $("wpMsg").textContent = "Save failed."; }
});
