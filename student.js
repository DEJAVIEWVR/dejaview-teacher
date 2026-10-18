import { auth, db, $, esc } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { collection, query, where, onSnapshot, getDoc, getDocs, doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { DESTS } from "./destinations.js";
import { printReport, loadCriteria, rubricOf, scoreRaw, CRIT, overallOf } from "./report.js";
import { toast, ask, niceError } from "./toast.js";

let me = null, evals = [], first = true, mods = [], curDest = DESTS[0];
const toDate = x => (x && x.toDate) ? x.toDate() : null;
const fmtDate = d => d ? d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "-";

onAuthStateChanged(auth, async user => {
    if (!user) return location.replace("login.html");
    try {
        const s = await getDoc(doc(db, "students", user.uid));
        if (!s.exists()) { await signOut(auth); return location.replace("login.html"); }
        me = { uid: user.uid, ...s.data() };
    } catch (err) { console.error(err); return location.replace("login.html"); }

    $("who").textContent = me.fullname || "Student";
    await loadCriteria();
    renderProfile();
    renderCriteria();
    document.body.style.visibility = "visible";

    if (me.status === "pending") toast("Your account is still waiting for your instructor's approval.", "warn");
    else if (toDate(me.expiresAt) && toDate(me.expiresAt) < new Date()) toast("Your account has expired. Ask your instructor to renew it.", "err");

    loadModules();
    if (me.status === "active" || me.status === "archived") {
        if (me.status === "active" && !(toDate(me.expiresAt) && toDate(me.expiresAt) < new Date())) { loadSession(); setInterval(loadSession, 60000); }
        else $("liveBody").innerHTML = `<p class="hint">${me.status === "archived" ? "This account is from a past semester. You can still read your results below." : "Your account has expired. Ask your instructor to renew it."}</p>`;
        onSnapshot(query(collection(db, "evaluations"), where("uid", "==", me.uid), where("status", "==", "submitted")),
            snap => {
                if (first) first = false;
                else snap.docChanges().filter(c => c.type === "added").forEach(c => toast(`New result released: ${c.doc.data().destination}.`, "info"));
                evals = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderResults();
            },
            err => { console.error(err); $("resultList").innerHTML = '<p class="hint">Unable to load results.</p>'; toast(niceError(err, "Unable to load your results."), "err"); });
    } else {
        $("liveBody").innerHTML = '<p class="hint">Available after your instructor approves your account.</p>';
        $("resultList").innerHTML = '<p class="hint">No results yet.</p>';
    }
});

function renderCriteria() {
    $("critBody").innerHTML = `<div class="crit-list">${CRIT.map(([k, l, m, d]) => `<div class="crit-item"><div class="crit-item-top"><b>${esc(l)}</b><span class="max-pill">${m} pts</span></div>${d ? `<p>${esc(d)}</p>` : ""}</div>`).join("")}</div>`;
}

function renderProfile() {
    const exp = toDate(me.expiresAt), expired = exp && exp < new Date();
    let status = '<span class="chip warn">Waiting for instructor approval</span>';
    if (me.status === "archived") status = '<span class="chip">Past semester</span>';
    else if (me.status === "active") status = expired ? '<span class="chip err">Expired</span>' : '<span class="chip ok">Active</span>';
    $("profileBody").innerHTML = `<table class="pr-info plain">
        <tr><td>Name</td><td>${esc(me.fullname)}</td></tr>
        <tr><td>Student ID</td><td>${esc(me.studentIdNumber)}</td></tr>
        <tr><td>Section</td><td>${esc(me.section)}</td></tr>
        <tr><td>Account</td><td>${status}</td></tr>
        ${exp ? `<tr><td>Valid until</td><td>${fmtDate(exp)}</td></tr>` : ""}</table>`;
}

async function loadSession() {
    try {
        const snap = await getDocs(query(collection(db, "sessions"), where("section", "==", me.section), where("status", "==", "open")));
        const open = snap.docs.map(d => d.data()).filter(s => toDate(s.closesAt) > new Date() && (!s.studentUid || s.studentUid === me.uid));
        const levels = [...new Set(open.map(s => s.level))].sort();
        const until = open.length ? new Date(Math.max(...open.map(s => toDate(s.closesAt)))) : null;
        $("liveBody").innerHTML = open.length
            ? `<div class="alert ok"><b>Assessment open: Map${levels.length > 1 ? "s" : ""} ${levels.join(", ")}</b><br>
                Open the DejaView VR app, log in and pick a map. Access closes at ${until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</div>`
            : '<p class="hint">No assessment is open for you right now. Your instructor will activate you when it is your turn.</p>';
    } catch (err) { console.error(err); $("liveBody").innerHTML = '<p class="hint">Unable to check the assessment status.</p>'; }
}

function renderResults() {
    const sorted = evals.slice().sort((a, b) => (a.level || 0) - (b.level || 0));
    $("pdfBtn").style.display = sorted.length ? "" : "none";
    if (!sorted.length) { $("resultList").innerHTML = '<p class="hint">No results yet. They appear here after your instructor submits the evaluation.</p>'; return; }

    const avg = overallOf(sorted) || 0;
    $("resultList").innerHTML = `<p class="perf-summary">Levels evaluated: ${sorted.length} of ${DESTS.length} &middot; Overall grade (score ÷ total × 100): <b>${avg.toFixed(1)} / 100</b></p>
      <div class="mgrid">${sorted.map(r => `<article class="mod-card">
        <div class="mod-top"><span class="mod-chip">Level ${r.level}</span><span class="mod-date">${fmtDate(toDate(r.submittedAt))}</span></div>
        <h3>${esc(r.destination)}</h3>
        <div class="big-score">${(+r.total || 0).toFixed(1)}<small> / 100</small></div>
        ${rubricOf(r).map(([k, l, m]) => { const v = +scoreRaw(r, k) || 0; return `<div class="crit"><span>${esc(l)}</span><b>${v.toFixed(1)} / ${m}</b>
            <div class="bar"><i style="width:${Math.min(100, v / m * 100)}%"></i></div></div>`; }).join("")}
        ${r.remarks ? `<p class="mod-text">Remarks: ${esc(r.remarks)}</p>` : ""}
        <p class="mod-date">Evaluated by ${esc(r.evaluatorName || "your instructor")}</p></article>`).join("")}</div>`;
}

$("pdfBtn").addEventListener("click", () => {
    toast("Choose \"Save as PDF\" in the print window.", "info");
    printReport({ name: me.fullname, id: me.studentIdNumber, section: me.section, instructor: "", rows: evals });
});
$("logoutButton").addEventListener("click", async () => {
    if (!(await ask("Log out?", { title: "Log out", ok: "Log out" }))) return;
    await signOut(auth); location.replace("login.html");
});

// ---------- training modules (written by instructors, read-only here) ----------
async function loadModules() {
    try {
        // only the modules written for my section (or for every section)
        mods = (await getDocs(collection(db, "modules"))).docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(m => !Array.isArray(m.sections) || !m.sections.length || m.sections.includes(me.section));
        renderModules();
    } catch (err) { console.error(err); $("modList").innerHTML = '<p class="hint">Unable to load the training modules.</p>'; toast(niceError(err, "Unable to load the training modules."), "err"); }
}

function linkButton(link) {
    if (!/^https?:\/\//i.test(link || "")) return "";
    let host = "";
    try { host = new URL(link).hostname.replace(/^www\./, ""); } catch (e) { }
    let text = "Open link", icon = '<i class="ico ico-link"></i>';
    if (/youtube\.com|youtu\.be/.test(host)) { text = "Watch video"; icon = '<i class="ico ico-play"></i>'; }
    else if (/drive\.google|docs\.google/.test(host)) { text = "Open file"; icon = '<i class="ico ico-file"></i>'; }
    return `<a class="mod-link" href="${esc(link)}" target="_blank" rel="noopener">${icon} ${text}</a>`;
}

function imgSrc(u) {
    u = (u || "").trim();
    const g = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
    return g ? `https://drive.google.com/thumbnail?id=${g[1]}&sz=w1000` : u;
}
function pics(m) {
    const list = Array.isArray(m.images) ? m.images.filter(i => i && i.url) : [];
    return list.length ? `<div class="mod-imgs">${list.map(i => `<figure><a href="${esc(imgSrc(i.url))}" target="_blank" rel="noopener"><img src="${esc(imgSrc(i.url))}" alt="${esc(i.caption || "")}" loading="lazy"></a>${i.caption ? `<figcaption>${esc(i.caption)}</figcaption>` : ""}</figure>`).join("")}</div>` : "";
}

function renderModules() {
    $("modTabs").innerHTML = DESTS.map(d => `<button class="tab ${d === curDest ? "active" : ""}" data-tab="${esc(d)}">${esc(d)}<span class="count">${mods.filter(m => m.destinationID === d).length}</span></button>`).join("");
    const list = mods.filter(m => m.destinationID === curDest).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    $("modList").innerHTML = list.length
        ? `<div class="mgrid">${list.map(m => {
            const long = (m.content || "").length > 200 || (m.content || "").split("\n").length > 4;
            const story = m.kind === "stop";
            return `<article class="mod-card"><div class="mod-top"><span class="mod-chip ${story ? "story" : ""}">${story ? "History at: " + esc(m.stop || m.title) : "Lesson"}</span></div>
              <h3>${esc(m.title)}</h3><p class="mod-text">${esc(m.content)}</p>
              ${long ? '<button class="mod-more" data-more>Read more</button>' : ""}
              ${pics(m)}
              <div class="mod-actions">${linkButton(m.link)}</div></article>`;
        }).join("")}</div>`
        : `<div class="mod-empty"><strong>No lessons yet for ${esc(curDest)}</strong>Your instructor has not added one yet.</div>`;
}

document.addEventListener("click", e => {
    const tab = e.target.closest("[data-tab]");
    if (tab) { curDest = tab.dataset.tab; renderModules(); return; }
    const more = e.target.closest("[data-more]");
    if (more) {
        const card = more.closest(".mod-card");
        card.classList.toggle("open");
        more.textContent = card.classList.contains("open") ? "Show less" : "Read more";
    }
});
