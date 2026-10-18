import { esc, db } from "./firebase.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// The grading criteria: [key, label, max points]. The admin can rename, add and remove them (saved in settings/criteria).
// The list always adds up to 100 points. CRIT is updated in place, so every page that reads it sees the new rubric.
export const DEFAULT_CRIT = [
    ["content", "Content Accuracy", 25, "The facts about the place, its history, and your answers are correct and complete."],
    ["delivery", "Delivery & Communication", 20, "You speak clearly and confidently, with a good voice, pace, and tone."],
    ["navigation", "Tour Sequence & Navigation", 15, "You visit the stops in the right order and lead the tourist along the path."],
    ["timeMgmt", "Time Management", 15, "You finish each stop and each answer within the time limit."],
    ["problemSolving", "Problem-Solving & Tourist Handling", 15, "You answer the tourist's questions politely and handle unexpected situations calmly."],
    ["language", "Language Proficiency", 10, "Your grammar and word choice are correct and easy to understand."]
];
// The short explanation of a default criterion (used when the admin has not written one yet)
const defaultDesc = key => { const r = DEFAULT_CRIT.find(c => c[0] === key); return r ? r[3] : ""; };
export const CRIT = DEFAULT_CRIT.map(r => r.slice());
// Older evaluations were saved with these five fixed criteria
const LEGACY = [["knowledge", "Knowledge", 35], ["timeMgmt", "Time Management", 20], ["navigation", "Navigation", 20], ["problemSolving", "Problem-Solving", 15], ["completion", "Completion", 10]];

export function applyCriteria(d) {
    const items = d && Array.isArray(d.items) && d.items.length ? d.items.map(i => [i.key, i.label, i.max, (typeof i.desc === "string" && i.desc.trim()) ? i.desc : defaultDesc(i.key)]) : DEFAULT_CRIT;
    CRIT.length = 0;
    items.forEach(r => CRIT.push(r.slice()));
}
export async function loadCriteria() {
    try { const s = await getDoc(doc(db, "settings", "criteria")); applyCriteria(s.exists() ? s.data() : null); }
    catch (err) { console.warn("Using the default criteria.", err); }
}
// The score of one criterion in an evaluation ("" when it was not entered)
export const scoreRaw = (e, k) => { const v = e && ((e.scores && e.scores[k] != null) ? e.scores[k] : e[k]); return v == null ? "" : v; };
// Each evaluation remembers the rubric it was graded with, so old results always show the right maximums
export function rubricOf(e) {
    if (e && Array.isArray(e.rubric) && e.rubric.length) return e.rubric.map(i => [i.key, i.label, i.max]);
    if (e && e.knowledge !== undefined) return LEGACY;
    return CRIT;
}
export const rubricFor = list => rubricOf((list || []).find(Boolean));

// Opens the browser print window with a clean report. Choose "Save as PDF" as the destination.
export function printReport({ name, id, section, instructor, rows, asked }) {
    let area = document.getElementById("printArea");
    if (!area) { area = document.createElement("div"); area.id = "printArea"; document.body.appendChild(area); }

    const sorted = rows.slice().sort((a, b) => (a.level || 0) - (b.level || 0));
    const avg = sorted.length ? sorted.reduce((n, r) => n + (+r.total || 0), 0) / sorted.length : 0;
    const rub = rubricFor(sorted);
    const fmt = v => (v == null || v === "") ? "-" : (+v).toFixed(1);
    const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

    area.innerHTML = `
      <div class="pr-head"><img class="pr-logo" src="images/bulsu-seal.png" alt="BulSU seal"><img class="pr-logo" src="images/htm-logo.png" alt="HTM logo" onerror="this.style.display='none'">
        <div><strong>Bulacan State University &middot; Sarmiento Campus</strong><br>
        Department of Tourism Management<br>
        <span class="pr-title">DejaView VR &ndash; Student Performance Report</span></div></div>
      <table class="pr-info">
        <tr><td>Student</td><td>${esc(name)}</td><td>Student ID</td><td>${esc(id)}</td></tr>
        <tr><td>Section</td><td>${esc(section)}</td><td>Date printed</td><td>${esc(today)}</td></tr>
      </table>
      <table class="pr-table pr-crit"><thead><tr><th>Criteria</th>${sorted.map(r => `<th>${esc(r.destination)}</th>`).join("")}</tr></thead><tbody>
      ${rub.map(([k, l, m]) => `<tr><td>${esc(l)} <small>(max ${m})</small></td>${sorted.map(r => `<td>${fmt(scoreRaw(r, k))}</td>`).join("")}</tr>`).join("")}
      <tr class="pr-total"><td>Total <small>(of 100)</small></td>${sorted.map(r => `<td><b>${fmt(r.total)}</b></td>`).join("")}</tr>
      </tbody></table>
      ${sorted.some(r => r.remarks) ? `<div class="pr-remarks"><b>Remarks</b>${sorted.filter(r => r.remarks).map(r => `<div class="pr-rem-item"><strong>${esc(r.destination)}</strong><p>${esc(r.remarks)}</p></div>`).join("")}</div>` : ""}
      ${asked && asked.length ? `<div class="pr-remarks"><b>Questions asked</b>${asked.map(a => `<div class="pr-rem-item"><strong>Map ${a.level} &ndash; ${esc(a.destination)}</strong>${a.list.map(x => `<p>${esc(x.no)}. ${esc(x.text || "")} <small>(${esc(x.stop ? x.stop + ", " : "")}${esc(x.speaker || "")})</small></p>`).join("")}</div>`).join("")}</div>` : ""}
      <p class="pr-sum">Levels evaluated: ${sorted.length} &middot; Average total: ${avg.toFixed(1)} / 100</p>
      <div class="pr-sign"><div><span></span>Instructor: ${esc(instructor || "")}</div><div><span></span>Date</div></div>`;

    openPrint("DejaView Report - " + name);
}

// Prints whatever is inside #printArea (choose "Save as PDF" as the destination)
export function printHtml(html, title) {
    let area = document.getElementById("printArea");
    if (!area) { area = document.createElement("div"); area.id = "printArea"; document.body.appendChild(area); }
    area.innerHTML = html;
    openPrint(title);
}

function openPrint(title) {
    const oldTitle = document.title;
    document.title = title;
    document.body.classList.add("print-report");
    const done = () => {
        document.body.classList.remove("print-report");
        document.title = oldTitle;
        window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    // Wait until the logos are loaded, or they print as empty boxes
    const imgs = [...document.querySelectorAll("#printArea img")].filter(i => !i.complete);
    const ready = Promise.all(imgs.map(i => new Promise(res => { i.addEventListener("load", res); i.addEventListener("error", res); })));
    Promise.race([ready, new Promise(res => setTimeout(res, 2000))]).then(() => setTimeout(() => window.print(), 60));
}
