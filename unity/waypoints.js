import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, getDocs, setDoc, doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { DESTS, MAX_EXTRA } from "./destinations.js";
import { toast, niceError } from "./toast.js";

let used = {};
onAuthStateChanged(auth, u => { if (u) load(); });

async function load() {
    const q = {};
    used = {};
    try {
        (await getDocs(collection(db, "levels"))).docs.forEach(d => q[d.data().name] = d.data().extraWaypoints ?? MAX_EXTRA);
        (await getDocs(collection(db, "Scenarios_tbl"))).docs.forEach(d => { const x = d.data(); if (x.isExtra) used[x.destinationID] = (used[x.destinationID] || 0) + 1; });
    } catch (e) { console.error(e); toast(niceError(e, "Could not load the extra stop settings."), "err"); }
    $("wpBody").innerHTML = DESTS.map(n => `<tr><td>${esc(n)}</td><td><select data-dest="${esc(n)}" data-prev="${q[n] ?? MAX_EXTRA}">` +
        Array.from({ length: MAX_EXTRA + 1 }, (_, i) => `<option ${(q[n] ?? MAX_EXTRA) === i ? "selected" : ""}>${i}</option>`).join("") +
        `</select> <span class="hint">${used[n] || 0} used by teachers</span></td></tr>`).join("");
}

document.addEventListener("change", async e => {
    const s = e.target.closest("select[data-dest]");
    if (!s) return;
    const name = s.dataset.dest, v = +s.value, prev = s.dataset.prev;
    // never allow fewer slots than the extra questions teachers already wrote
    if (v < (used[name] || 0)) {
        s.value = prev;
        return toast(`${name} already has ${used[name]} extra question(s) written by teachers. Delete some in the Question Bank before lowering the limit.`, "err");
    }
    try {
        await setDoc(doc(db, "levels", name.replace(/\W+/g, "_")), { name, extraWaypoints: v });
        s.dataset.prev = v;
        toast(`${name}: ${v} extra stop${v === 1 ? "" : "s"} allowed.`);
    } catch (err) { console.error(err); s.value = prev; toast("Could not save. " + niceError(err), "err"); }
});
