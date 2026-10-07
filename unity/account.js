// "Change my password" for the person who is logged in. Everything happens inside the site.
import { auth } from "./firebase.js";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { toast, askFields } from "./toast.js";

export const strongEnough = p => p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);

export async function changeMyPassword() {
    const user = auth.currentUser;
    if (!user) return toast("Please log in again.", "err");
    const v = await askFields({
        title: "Change password",
        fields: [
            { key: "old", label: "Current password", type: "password", min: 1, max: 60 },
            { key: "new", label: "New password", type: "password", min: 8, max: 60, help: "At least 8 characters, with at least one letter and one number." },
            { key: "again", label: "Type the new password again", type: "password", min: 8, max: 60 }
        ],
        ok: "Change password",
        validate: x => !strongEnough(x.new) ? "The new password needs at least 8 characters, with a letter and a number."
            : x.new !== x.again ? "The two new passwords do not match."
            : x.new === x.old ? "The new password must be different from the current one." : ""
    });
    if (!v) return;
    try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, v.old));
        await updatePassword(user, v.new);
        toast("Your password was changed.");
    } catch (err) {
        console.error(err);
        const c = err.code || "";
        toast(c.includes("wrong-password") || c.includes("invalid-credential") ? "The current password is not correct."
            : c.includes("too-many") ? "Too many attempts. Please wait a few minutes." : "Could not change the password. Try again.", "err");
    }
}
