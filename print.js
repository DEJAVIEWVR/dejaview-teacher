// Print / Save as PDF for the Performance Monitoring section
(function () {
    const $ = id => document.getElementById(id);
    const btn = $("printBtn");
    if (!btn) return;
    const oldTitle = document.title;

    btn.addEventListener("click", () => {
        const sel = $("perfStudent");
        if (!sel.value) { alert("Select a student first."); return; }

        const rows = document.querySelectorAll("#perfBody tr");
        if (!rows.length || rows[0].children.length === 1) { alert("This student has no records yet."); return; }

        // "Name (StudentID)" from the dropdown
        const text = sel.options[sel.selectedIndex].text;
        const m = text.match(/^(.*)\s\((.*)\)$/);
        const name = m ? m[1] : text;
        const id = m ? m[2] : "";

        // find the section in the Student List table
        let section = "";
        document.querySelectorAll("#studentTable tr").forEach(tr => {
            const c = tr.children;
            if (c[0] && c[0].textContent.trim() === id && c[3]) section = c[3].textContent.trim();
        });

        $("phName").textContent = name;
        $("phId").textContent = id;
        $("phSection").textContent = section;
        $("phTeacher").textContent = ($("who").textContent || "").split("|")[0].trim();
        $("phDate").textContent = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

        document.title = "DejaView Report - " + name;   // suggested PDF file name
        document.body.classList.add("print-perf");
        window.print();
    });

    window.addEventListener("afterprint", () => {
        document.body.classList.remove("print-perf");
        document.title = oldTitle;
    });
})();
