using System;
using System.Collections;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using Firebase.Auth;
using Firebase.Firestore;
using Firebase.Extensions;

// Student register + login. Replaces LoginController and LoginManager.
public class StudentAuth : MonoBehaviour
{
    [Header("Panels")]
    public GameObject loginPanel;
    public GameObject registerPanel;

    [Header("Login fields")]
    public TMP_InputField loginIdInput;
    public TMP_InputField loginPasswordInput;
    public TMP_Text loginMessage;

    [Header("Register fields")]
    public TMP_InputField regIdInput;
    public TMP_InputField regNameInput;
    public TMP_InputField regUsernameInput;   // optional: leave empty to use the Student ID as the username
    public TMP_InputField regPasswordInput;
    public TMP_InputField regConfirmInput;
    public TMP_Dropdown sectionDropdown;
    public TMP_Text registerMessage;

    [Header("After login")]
    public string mapSceneName = "START_SCENE";
    public string emailDomain = "dejaview.app";   // Student ID becomes <id>@dejaview.app inside Firebase Auth

    FirebaseAuth auth;
    FirebaseFirestore db;
    bool busy;
    readonly List<string> sections = new List<string>();

    void Start()
    {
        ShowLogin();
        StartCoroutine(Init());
    }

    IEnumerator Init()
    {
        while (FirebaseManager.Instance == null || FirebaseManager.Instance.Db == null) yield return null;
        db = FirebaseManager.Instance.Db;
        auth = FirebaseAuth.DefaultInstance;
        auth.SignOut();              // always require a fresh login on this device
        StudentSession.Clear();
        LoadSections();
    }

    void LoadSections()
    {
        db.Collection("sections").GetSnapshotAsync().ContinueWithOnMainThread(t =>
        {
            sections.Clear();
            if (!t.IsFaulted && !t.IsCanceled)
            {
                foreach (var d in t.Result.Documents)
                {
                    var m = d.ToDictionary();
                    if (m.ContainsKey("name")) sections.Add(m["name"].ToString());
                }
            }
            sections.Sort();
            if (sectionDropdown != null)
            {
                sectionDropdown.ClearOptions();
                sectionDropdown.AddOptions(sections.Count > 0 ? sections : new List<string> { "No sections yet" });
            }
        });
    }

    // ---------- panel switching (hook to buttons) ----------
    public void ShowLogin()
    {
        if (loginPanel != null) loginPanel.SetActive(true);
        if (registerPanel != null) registerPanel.SetActive(false);
        Say(loginMessage, "");
    }

    public void ShowRegister()
    {
        if (loginPanel != null) loginPanel.SetActive(false);
        if (registerPanel != null) registerPanel.SetActive(true);
        Say(registerMessage, "");
    }

    // ---------- LOGIN (hook to Login button) ----------
    public void Login()
    {
        if (busy) return;
        if (auth == null) { Say(loginMessage, "Connecting... please try again in a moment."); return; }

        string id = loginIdInput.text.Trim();
        string pw = loginPasswordInput.text;
        if (!ValidId(id) || string.IsNullOrEmpty(pw)) { Say(loginMessage, "Enter your Student ID and password."); return; }

        busy = true;
        Say(loginMessage, "Logging in...");
        auth.SignInWithEmailAndPasswordAsync(Email(id), pw).ContinueWithOnMainThread(t =>
        {
            if (t.IsFaulted || t.IsCanceled)
            {
                var err = ErrorOf(t);
                LoginFail(err == AuthError.NetworkRequestFailed
                    ? "No internet connection."
                    : "Wrong Student ID or password.");
                return;
            }
            CheckAccount(auth.CurrentUser);
        });
    }

    void CheckAccount(FirebaseUser user)
    {
        db.Collection("students").Document(user.UserId).GetSnapshotAsync().ContinueWithOnMainThread(t =>
        {
            if (t.IsFaulted || t.IsCanceled) { LoginFail("Could not read your account. Check your internet."); return; }
            var snap = t.Result;
            if (!snap.Exists) { LoginFail("No registration found for this ID. Please create an account."); return; }

            var m = snap.ToDictionary();
            string status = m.ContainsKey("status") ? m["status"].ToString() : "";
            if (status == "pending") { LoginFail("Your account is waiting for instructor approval."); return; }
            if (status != "active") { LoginFail("This account is not active. See your instructor."); return; }

            DateTime? exp = null;
            if (m.ContainsKey("expiresAt") && m["expiresAt"] is Timestamp) exp = ((Timestamp)m["expiresAt"]).ToDateTime();
            if (exp.HasValue && exp.Value < DateTime.UtcNow) { LoginFail("Your account has expired. Ask your instructor to renew it."); return; }

            StudentSession.Uid = user.UserId;
            StudentSession.StudentId = Str(m, "studentIdNumber");
            StudentSession.FullName = Str(m, "fullname");
            StudentSession.Username = Str(m, "username");
            StudentSession.Section = Str(m, "section");
            StudentSession.ExpiresAt = exp;
            LoadProgress();
        });
    }

    void LoadProgress()
    {
        db.Collection("scores").WhereEqualTo("uid", StudentSession.Uid).GetSnapshotAsync().ContinueWithOnMainThread(t =>
        {
            if (t.IsFaulted || t.IsCanceled) { LoginFail("Could not load your progress. Check your internet."); return; }

            var keys = new List<string>();
            foreach (var d in t.Result.Documents)
            {
                var m = d.ToDictionary();
                if (m.ContainsKey("level")) keys.Add("Level" + Convert.ToInt32(m["level"]) + "_Completed");
            }
            StudentSession.SetCompleted(keys);
            PlayerProfile.PlayerName = StudentSession.FullName;
            MapGuide.welcomeShown = false;
            // Ask which levels the instructor has opened. The map scene shows the "inactive" popup if none.
            PlayAccess.Refresh(() =>
            {
                busy = false;
                SceneManager.LoadScene(mapSceneName);
            });
        });
    }

    void LoginFail(string message)
    {
        if (auth != null) auth.SignOut();
        StudentSession.Clear();
        busy = false;
        Say(loginMessage, message);
    }

    // ---------- REGISTER (hook to Register button) ----------
    public void Register()
    {
        if (busy) return;
        if (auth == null) { Say(registerMessage, "Connecting... please try again in a moment."); return; }

        string id = regIdInput.text.Trim();
        string name = regNameInput.text.Trim();
        string username = regUsernameInput != null ? regUsernameInput.text.Trim() : id;   // no username field: use the Student ID
        string pw = regPasswordInput.text;
        string pw2 = regConfirmInput.text;

        if (!ValidId(id)) { Say(registerMessage, "Student ID: 5 to 20 letters, numbers or dashes."); return; }
        if (name.Length < 3) { Say(registerMessage, "Enter your full name."); return; }
        if (regUsernameInput != null && username.Length < 3) { Say(registerMessage, "Choose a username (at least 3 characters)."); return; }
        if (sections.Count == 0) { Say(registerMessage, "No sections available yet. Ask your instructor."); return; }
        if (pw.Length < 6) { Say(registerMessage, "Password must be at least 6 characters."); return; }
        if (pw != pw2) { Say(registerMessage, "Passwords do not match."); return; }

        string section = sections[Mathf.Clamp(sectionDropdown.value, 0, sections.Count - 1)];

        busy = true;
        Say(registerMessage, "Creating account...");
        auth.CreateUserWithEmailAndPasswordAsync(Email(id), pw).ContinueWithOnMainThread(t =>
        {
            if (!t.IsFaulted && !t.IsCanceled) { WriteStudent(auth.CurrentUser, id, name, username, section); return; }

            var err = ErrorOf(t);
            if (err == AuthError.EmailAlreadyInUse) { RecoverExisting(id, pw, name, username, section); return; }
            if (err == AuthError.WeakPassword) { RegFail("Password is too weak. Use at least 6 characters."); return; }
            if (err == AuthError.NetworkRequestFailed) { RegFail("No internet connection."); return; }
            RegFail("Could not create the account. Try again.");
        });
    }

    // The ID already has a login. If its student record was rejected or removed, let the student register again.
    void RecoverExisting(string id, string pw, string name, string username, string section)
    {
        auth.SignInWithEmailAndPasswordAsync(Email(id), pw).ContinueWithOnMainThread(t =>
        {
            if (t.IsFaulted || t.IsCanceled)
            {
                RegFail("This Student ID is already registered. Use your original password, or ask your instructor to remove the old record.");
                return;
            }
            var u = auth.CurrentUser;
            db.Collection("students").Document(u.UserId).GetSnapshotAsync().ContinueWithOnMainThread(t2 =>
            {
                if (!t2.IsFaulted && !t2.IsCanceled && t2.Result.Exists)
                {
                    RegFail("This Student ID is already registered. Go back and log in.");
                    return;
                }
                WriteStudent(u, id, name, username, section);
            });
        });
    }

    void WriteStudent(FirebaseUser u, string id, string name, string username, string section)
    {
        var data = new Dictionary<string, object>
        {
            { "fullname", name },
            { "studentIdNumber", id },
            { "username", username },
            { "section", section },
            { "status", "pending" },
            { "role", "student" },
            { "createdAt", FieldValue.ServerTimestamp }
        };
        db.Collection("students").Document(u.UserId).SetAsync(data).ContinueWithOnMainThread(t =>
        {
            if (t.IsFaulted || t.IsCanceled)
            {
                u.DeleteAsync();   // roll back so the Student ID is not locked by a half-made account
                RegFail("Could not send your registration. Check your internet and try again.");
                return;
            }
            auth.SignOut();
            busy = false;
            ClearRegisterFields();
            ShowLogin();
            Say(loginMessage, "Registration sent! Wait for your instructor to approve it, then log in.");
        });
    }

    void RegFail(string message)
    {
        if (auth != null) auth.SignOut();
        busy = false;
        Say(registerMessage, message);
    }

    void ClearRegisterFields()
    {
        regIdInput.text = ""; regNameInput.text = "";
        if (regUsernameInput != null) regUsernameInput.text = "";
        regPasswordInput.text = ""; regConfirmInput.text = "";
    }

    // ---------- helpers ----------
    string Email(string id) { return id.Trim().ToLowerInvariant() + "@" + emailDomain; }
    static bool ValidId(string id) { return Regex.IsMatch(id, @"^[A-Za-z0-9-]{5,20}$"); }
    static string Str(Dictionary<string, object> m, string k) { return m.ContainsKey(k) && m[k] != null ? m[k].ToString() : ""; }
    static void Say(TMP_Text t, string msg) { if (t != null) { t.text = msg; t.gameObject.SetActive(!string.IsNullOrEmpty(msg)); } }

    static AuthError ErrorOf(Task task)
    {
        if (task.Exception != null)
            foreach (var e in task.Exception.Flatten().InnerExceptions)
            {
                var fe = e as Firebase.FirebaseException;
                if (fe != null) return (AuthError)fe.ErrorCode;
            }
        return AuthError.None;
    }
}
