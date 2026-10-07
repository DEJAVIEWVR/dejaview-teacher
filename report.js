import { esc } from "./firebase.js";

// The 5 criteria and their maximum points (total 100)
export const CRIT = [
    ["knowledge", "Knowledge", 35],
    ["timeMgmt", "Time Management", 20],
    ["navigation", "Navigation", 20],
    ["problemSolving", "Problem-Solving", 15],
    ["completion", "Completion", 10]
];

// Opens the browser print window with a clean report. Choose "Save as PDF" as the destination.
export function printReport({ name, id, section, instructor, rows }) {
    let area = document.getElementById("printArea");
    if (!area) { area = document.createElement("div"); area.id = "printArea"; document.body.appendChild(area); }

    const sorted = rows.slice().sort((a, b) => (a.level || 0) - (b.level || 0));
    const avg = sorted.length ? sorted.reduce((n, r) => n + (+r.total || 0), 0) / sorted.length : 0;
    const fmt = v => (v == null || v === "") ? "-" : (+v).toFixed(1);
    const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

    area.innerHTML = `
      <div class="pr-head"><img src="images/htm-logo.png" onerror="this.onerror=null;this.src='images/bulsu-seal.png'" alt="">
        <div><strong>Bulacan State University &middot; Sarmiento Campus</strong><br>
        Department of Hospitality and Tourism Management<br>
        <span class="pr-title">DejaView VR &ndash; Student Performance Report</span></div></div>
      <table class="pr-info">
        <tr><td>Student</td><td>${esc(name)}</td><td>Student ID</td><td>${esc(id)}</td></tr>
        <tr><td>Section</td><td>${esc(section)}</td><td>Date printed</td><td>${esc(today)}</td></tr>
      </table>
      <table class="pr-table"><thead><tr><th>Destination</th>${CRIT.map(([, l, m]) => `<th>${l} (${m})</th>`).join("")}<th>Total</th></tr></thead><tbody>
      ${sorted.map(r => `<tr><td>${esc(r.destination)}</td>${CRIT.map(([k]) => `<td>${fmt(r[k])}</td>`).join("")}<td><b>${fmt(r.total)}</b></td></tr>
        ${r.remarks ? `<tr class="pr-rem"><td colspan="7">Remarks: ${esc(r.remarks)}</td></tr>` : ""}`).join("")}
      </tbody></table>
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
    window.print();
}
