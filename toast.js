// Shared helpers for popups. Nothing here uses the ugly browser alert/confirm/prompt boxes.
//   toast("Saved")                       small message in the corner ("ok" | "err" | "warn" | "info")
//   await ask("Delete this?", {...})     Yes/Cancel dialog, resolves true or false
//   await choose({...})                  dropdown dialog, resolves the chosen value or null
//   await pickMany({...})                checkbox list dialog, resolves an array or null
//   normName("BSTM-1b")                  "BSTM 1B"  (so duplicates can be detected)

export function toast(message, type = "ok") {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = message;
    t.addEventListener("click", () => t.remove());
    box.appendChild(t);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => { t.classList.add("hide"); setTimeout(() => t.remove(), 300); }, type === "err" ? 6000 : 4000);
}

// "BSTM-1b", "bstm  1B" and "BSTM 1B" are the same section
export const normName = s => String(s || "").trim().replace(/[\s\-_]+/g, " ").toUpperCase();
// What we actually store: clean spacing, upper case, no slashes
export const cleanName = s => String(s || "").trim().replace(/\//g, " ").replace(/[\s_]+/g, " ").replace(/\s*-\s*/g, "-").toUpperCase();

function makeDialog(html) {
    const d = document.createElement("dialog");
    d.className = "dv-dialog";
    d.innerHTML = html;
    document.body.appendChild(d);
    return d;
}
const e = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function run(d, read) {
    return new Promise(resolve => {
        let result = null;
        d.addEventListener("close", () => { d.remove(); resolve(result); });
        d.querySelector("[data-ok]").addEventListener("click", () => { result = read(); d.close(); });
        d.querySelector("[data-cancel]").addEventListener("click", () => { result = null; d.close(); });
        d.showModal();
        const first = d.querySelector("select,input,[data-ok]");
        if (first) first.focus();
    });
}

export async function ask(message, { title = "Please confirm", ok = "Yes", cancel = "Cancel", danger = false } = {}) {
    const d = makeDialog(`<h2>${e(title)}</h2><p>${e(message)}</p>
        <div class="row"><button type="button" class="edit-button" data-cancel>${e(cancel)}</button>
        <button type="button" class="${danger ? "delete-button" : "add-button"}" data-ok>${e(ok)}</button></div>`);
    return (await run(d, () => true)) === true;
}

// options: [{value,label}]  ->  the chosen value, or null if cancelled
export function choose({ title, message = "", options, value, ok = "OK" }) {
    const d = makeDialog(`<h2>${e(title)}</h2>${message ? `<p>${e(message)}</p>` : ""}
        <select data-sel>${options.map(o => `<option value="${e(o.value)}" ${String(o.value) === String(value) ? "selected" : ""}>${e(o.label)}</option>`).join("")}</select>
        <div class="row"><button type="button" class="edit-button" data-cancel>Cancel</button><button type="button" class="add-button" data-ok>${e(ok)}</button></div>`);
    return run(d, () => d.querySelector("[data-sel]").value);
}

// options: [{value,label}], selected: [values] -> array of ticked values, or null if cancelled
export function pickMany({ title, message = "", options, selected = [], ok = "Save" }) {
    const d = makeDialog(`<h2>${e(title)}</h2>${message ? `<p>${e(message)}</p>` : ""}
        <div class="checks">${options.map(o => `<label class="chk"><input type="checkbox" value="${e(o.value)}" ${selected.includes(o.value) ? "checked" : ""}> ${e(o.label)}</label>`).join("") || "<p class='hint'>Nothing to pick yet.</p>"}</div>
        <div class="row"><button type="button" class="edit-button" data-cancel>Cancel</button><button type="button" class="add-button" data-ok>${e(ok)}</button></div>`);
    return run(d, () => [...d.querySelectorAll("input:checked")].map(i => i.value));
}

// Asks for one line of text. Returns the text, or null if cancelled. Validates before closing.
export function askText({ title, label = "", value = "", min = 1, max = 100, ok = "Save", placeholder = "" }) {
    return new Promise(resolve => {
        const d = makeDialog(`<h2>${e(title)}</h2>${label ? `<p>${e(label)}</p>` : ""}
            <input data-in maxlength="${max}" value="${e(value)}" placeholder="${e(placeholder)}" style="width:100%">
            <p class="hint" data-err style="color:#b3261e;min-height:1.2em"></p>
            <div class="row"><button type="button" class="edit-button" data-cancel>Cancel</button><button type="button" class="add-button" data-ok>${e(ok)}</button></div>`);
        const inp = d.querySelector("[data-in]"), err = d.querySelector("[data-err]");
        let result = null;
        const submit = () => {
            const v = inp.value.trim();
            if (v.length < min) { err.textContent = `Please enter at least ${min} character${min > 1 ? "s" : ""}.`; return; }
            result = v; d.close();
        };
        d.addEventListener("close", () => { d.remove(); resolve(result); });
        d.querySelector("[data-ok]").addEventListener("click", submit);
        d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
        inp.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); submit(); } });
        d.showModal(); inp.focus(); inp.select();
    });
}

// Locks a button while an action runs, so a double click can't save twice
export async function busy(btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } finally { if (btn) btn.disabled = false; }
}

// Friendly text for common errors
export function niceError(err, fallback = "Something went wrong.") {
    const c = (err && err.code) || "";
    if (c.includes("permission-denied")) return "You do not have permission to do that.";
    if (c.includes("unavailable") || c.includes("network")) return "No internet connection. Please try again.";
    if (c.includes("email-already-in-use")) return "That Employee ID already has an account.";
    if (c.includes("invalid-email")) return "That login ID is not valid.";
    if (c.includes("weak-password")) return "The password is too weak (minimum 6 characters).";
    if (c.includes("too-many-requests")) return "Too many attempts. Please wait a moment.";
    if (c.includes("not-found")) return "That record no longer exists. Refresh the page.";
    return fallback;
}

// Connection notices on every page that loads this file
window.addEventListener("offline", () => toast("You are offline. Changes will not be saved.", "err"));
window.addEventListener("online", () => toast("Back online.", "ok"));

// A small form in a dialog. fields: [{key,label,type,value,min,max,placeholder,help}]
// Returns {key: value} or null if cancelled. validate(values) may return an error text.
export function askFields({ title, message = "", fields, ok = "Save", validate }) {
    return new Promise(resolve => {
        const d = makeDialog(`<h2>${e(title)}</h2>${message ? `<p>${e(message)}</p>` : ""}
            ${fields.map(f => `<label class="fl">${e(f.label)}<input data-k="${e(f.key)}" type="${e(f.type || "text")}" value="${e(f.value || "")}"
                maxlength="${f.max || 100}" placeholder="${e(f.placeholder || "")}" autocomplete="${f.type === "password" ? "new-password" : "off"}"></label>${f.help ? `<span class="hint">${e(f.help)}</span>` : ""}`).join("")}
            <p class="hint" data-err style="color:#b3261e;min-height:1.2em"></p>
            <div class="row"><button type="button" class="edit-button" data-cancel>Cancel</button><button type="button" class="add-button" data-ok>${e(ok)}</button></div>`);
        const err = d.querySelector("[data-err]");
        let result = null;
        const submit = () => {
            const v = {};
            for (const f of fields) {
                v[f.key] = d.querySelector(`[data-k="${f.key}"]`).value.trim();
                if ((f.min || 0) > v[f.key].length) { err.textContent = `${f.label} needs at least ${f.min} character${f.min > 1 ? "s" : ""}.`; return; }
            }
            const problem = validate && validate(v);
            if (problem) { err.textContent = problem; return; }
            result = v; d.close();
        };
        d.addEventListener("close", () => { d.remove(); resolve(result); });
        d.querySelector("[data-ok]").addEventListener("click", submit);
        d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
        d.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); submit(); } });
        d.showModal(); d.querySelector("input").focus();
    });
}
