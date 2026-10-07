# DejaView VR: Handoff and Complete To-Do List

Paste this whole file into the new chat, and attach `DejaView_all_files.zip` plus the user's CURRENT Unity scripts.
IMPORTANT for the new assistant: the user's project may contain NEWER versions of some scripts than the ones in the zip
(they worked in another session). Always ask for the current file before editing it, and never overwrite blindly.
Nothing here was compiled or run by the assistant. Expect small errors and ask for the exact Console message.

User style: beginner, very time-pressured, wants VERY clear numbered steps, mixes English and Tagalog. Final defense is TOMORROW and
they are the FIRST group. Priority is a stable demo, not more features. Be honest about what is realistic.

---------------------------------------------------------------------
## 1. Project context

- Unity 2022.3.44 Android mobile VR tour-guide game (phone in Cardboard headset, Bluetooth controller, gaze + buttons).
- Bulacan State University (BulSU) Sarmiento Campus, Dept. of Hospitality and Tourism Management. Colors maroon #a50012, gold #f6a829.
- 3 levels: 1 Our Lady of Lourdes Grotto (scenes LEVEL1(GROTTO) then INSIDEGROTTO), 2 Mt. Balagbag (LEVEL2_MTBALAGBAG), 3 Padre Pio.
  Kaytitinga Falls was REMOVED. Map scene: START_SCENE. Login scene: StudentLoginScene.
- Firebase project: dejaview-vr-tour (Firestore + Auth, Email/Password enabled). Student ID becomes the Auth email <id>@dejaview.app.
- Website (teachers and admins only), GitHub Pages: https://dejaviewvr.github.io/dejaview-teachers/login.html
  (repo dejaview-teachers, user DEJAVIEWVR; that domain is in Firebase Authorized domains). GitHub is case-sensitive.
- Students use only the VR app. Teachers approve students on the website. Admin manages sections and teacher accounts.

### Firestore collections
- students/{uid}: fullname, studentIdNumber, username, section, status (pending|active), role "student", createdAt, approvedAt, expiresAt
- scores/{uid}_L{level}: uid, studentIdNumber, fullname, section, level, destination, knowledge, timeMgmt, navigation, problemSolving, completion, total, createdAt
- Scenarios_tbl: destinationID, speakerNPC, questionText, introLines[], options[{text, scoreWeight, reaction}], order, isExtra, createdBy, createdAt
- levels: name, extraWaypoints (default 3 reserve waypoints per destination)
- modules: destinationID, title, content, link
- sections: name   | teachers/{uid}: name, employeeId, email, sections[]   | admins/{uid}: any field
- Rules file: firestore.rules (in the zip). The user already published a version of it. Rules known facts: sections and Scenarios_tbl are
  publicly readable, scores can only be created by an ACTIVE, non-expired student and cannot be updated (one result per level).

### Decisions already made
- 5 criteria only: Knowledge 35, Time Management 20, Navigation 20, Problem-Solving 15, Completion 10 (= 100).
  Knowledge = avg answer weight x 35. Time = avg speed fraction x 20. Navigation = how fast the student starts each question
  (<=15 s full marks, >=60 s zero) x 20. Problem-solving = share of answers weighted >=50 x 15. Completion = answered / total x 10.
- Each level is a one-time TEST: finished levels cannot be replayed, score must save before continuing. Android Back/Home cannot be blocked
  (leaving mid-level means restarting that level, nothing saved).
- Account validity 6 months after approval (expiresAt). Teacher can Renew. Expired or pending accounts cannot log in.
- Reserve waypoints: 3 per destination for extra questions teachers add on the website.
- Voices and videos in every scene: skipped. Future work: voice-over, back-of-Grotto area, Mt. Balagbag path, Padre Pio stairs.

---------------------------------------------------------------------
## 2. Status (from the user's own summary, last night)

Working: website questions load into the game (roaming tourist only), student register/login coded, 5-criteria QuizManager,
popup fixes, audio rewrite, LevelSettings per level key, login scene full screen.
Open: see the to-do list below. Known gaps: password check "Passw0rd!x" slipped through (Deleet() fix was given, verify),
6-month expiry not set by the website Approve button (fix in 4.9), teacher dashboard modules, score popup needs a full test,
Grotto popup shows too early, Console warning "DontDestroyOnLoad only works for root GameObjects" (FirebaseManager nested, see 4.1).

---------------------------------------------------------------------
## 3. REALISTIC PLAN (about 4 hours of work + rehearsal)

Hour 1: quick fixes 4.1 to 4.8.   Hour 2: ghost buttons 4.10, score percentages 4.11, Grotto fix 4.12.
Hour 3: build APK and play all 3 levels on a phone (4.20).   Hour 4: fix what broke, then STOP adding features and rehearse.
Only if time remains: settings 4.14, then video popup 4.15, then path guide 4.13.
Skip: voices, videos in every scene, building the Grotto back / Mt. Balagbag path / Padre Pio stairs (list as future work).

---------------------------------------------------------------------
## 4. TO-DO ITEMS WITH STEPS AND CODE

### 4.1 FirebaseManager (may be why progress is not saved)  [10 min]
Console showed "DontDestroyOnLoad only works for root GameObjects" and "Firestore read failed: Missing or insufficient permissions".
FireBaseManager was a child of LoginPanel, so it is destroyed on the next scene and scores cannot save.
Fix: use unity/FirebaseManager.cs from the zip (moves itself to the root, no test read), or drag the object to the top level of the Hierarchy.

### 4.2 App name and icon  [10 min]
Edit > Project Settings > Player: Product Name = DejaView VR. Icon > Default Icon = square PNG logo. Uninstall the old app, then rebuild.

### 4.3 Timer text hard to see  [10 min]
Select TimerText: Font Size 48, bright yellow/orange, black outline (material outline ~0.25), dark rounded Image behind it,
top right of the dialogue panel, Material Preset LiberationSans SDF - Overlay.

### 4.4 No popup after Level 3  [10 min]
QuizManager object > Final Completion Key = Level3_Completed (the Inspector keeps the old saved value, editing the script is not enough).
Padre Pio's LevelSettings completionKey = Level3_Completed. MessagePopup must exist under ReticleCanvas.

### 4.5 Colliders so the player cannot walk through things  [20-30 min]
Models: select in Project > Model tab > tick Generate Colliders > Apply. Scene objects: Box Collider on fences/walls/stones,
Capsule Collider on tree trunks. Avoid many Mesh Colliders on mobile. The player uses a CharacterController, so no Rigidbody is needed.

### 4.6 Camera turns but the body keeps going left  [15 min]
In VRPlayerController.HandleMovement replace
    Vector3 forward = transform.forward;
    Vector3 right = transform.right;
with
    Transform head = Camera.main != null ? Camera.main.transform : transform;
    Vector3 forward = head.forward;
    Vector3 right = head.right;
(the following lines already flatten y and normalize). Also in IsUIBusy() add:
    if (VideoPopup.Instance != null && VideoPopup.Instance.IsOpen) return true;   // only after VideoPopup exists (4.15)

### 4.7 Render distance  [10 min]
Camera far clip plane, e.g. in a small script on the player: Camera.main.farClipPlane = 150f; (Low 60, Medium 120, High 250).
Add light fog (Window > Rendering > Lighting > Environment > Fog) so the cut-off is not visible. Same values are used by Settings (4.14).

### 4.8 Finished levels stay locked + progress  [30 min]
Replace LevelLock.cs (also in the zip). Fill "Own Completion Key" on each map card (Level1_Completed, Level2_Completed, Level3_Completed).

    using UnityEngine;
    public class LevelLock : MonoBehaviour
    {
        public string requiredCompletionKey = "Level1_Completed";
        public string ownCompletionKey = "";   // once finished, this card stays locked
        public bool alwaysUnlocked = false;
        public bool IsUnlocked()
        {
            if (!string.IsNullOrEmpty(ownCompletionKey) && Done(ownCompletionKey)) return false;
            if (alwaysUnlocked) return true;
            return Done(requiredCompletionKey);
        }
        bool Done(string key)
        {
            if (StudentSession.LoggedIn) return StudentSession.IsCompleted(key);
    #if UNITY_EDITOR
            return PlayerPrefs.GetInt(key, 0) == 1;
    #else
            return false;
    #endif
        }
    }

LevelSettings (zip) also sends a student back to START_SCENE if that level is already completed.
"Same account loses progress" checklist: (a) Firebase shows scores/<uid>_L<level> after finishing; (b) Console says the score saved;
(c) StudentAuth.LoadProgress reads scores where uid == user and fills StudentSession; (d) FirebaseManager is a root object (4.1);
(e) a second save of the same level is denied by design (rules allow create only); (f) no leftover PlayerPrefs-based unlock logic
in MapGuide/LevelLock/old scripts (should use StudentSession.IsCompleted).

### 4.9 Website: set expiresAt when a teacher approves  [15 min]
The user's current teacher.js only sets status "active". Use teacher.js from the zip, or change Approve to:
    import { Timestamp } from ".../firebase-firestore.js";
    const d = new Date(); d.setMonth(d.getMonth() + 6);
    await updateDoc(ref, { status: "active", approvedAt: Timestamp.now(), expiresAt: Timestamp.fromDate(d) });
The zip also has Renew, an "Account expires" column, Training Modules, Question Bank, Import Questions (admin).
Upload to GitHub (Add file > Upload files, files not the folder): login.html, index.html, admin.html, teacher.js, bank.js, modules.js,
import.js, waypoints.js, destinations.js, dejaview.css (+ admin.js, firebase.js, images/bulsu-bg.jpg, images/bulsu-seal.png).
Then Firestore rules: paste firestore.rules and Publish. Test in a private tab.

### 4.10 Ghost buttons (controller overlay)  [45 min, IMPORTANT]
Use unity/ControllerGhostHUD.cs. Purpose: the player in the headset cannot see the controller, so a pressed button lights up in the view.
1. ReticleCanvas > create empty GhostHUD at bottom center, add ControllerGhostHUD.
2. One circle Image per button (A, X, ...) with a TMP letter, material AlwaysOnTopMap, Raycast Target OFF, about 60 px.
3. Buttons list: one entry per button, drag the circle into Image, set Key. Find key codes by ticking Log Pressed Keys, pressing Play with the
   controller on the PC and reading the Console. Known: jump = Joystick1Button3; VRInputModule has interactButton (A) and clickButton (X).
4. Optional stick rings: drag the small dots into Left Knob / Right Knob. Axes used: L3Horizontal, L3Vertical, R3Horizontal, R3Vertical.
5. Idle alpha 0 hides idle buttons; default is faint so the layout is visible.

### 4.11 Score screen shows percentages  [15 min]  (needs the user's CURRENT QuizManager.cs)
Spec: each criterion as a percentage of its maximum, total as "82 / 100". Example lines in ShowFinalScore:
    contentAccuracyText.text = "Tour Knowledge: " + Mathf.RoundToInt((float)(kn / 35.0 * 100.0)) + "%";
    deliveryText.text        = "Time Management: " + Mathf.RoundToInt((float)(tm / 20.0 * 100.0)) + "%";
    stagePresenceText.text   = "Tour Sequence & Navigation: " + Mathf.RoundToInt((float)(nav / 20.0 * 100.0)) + "%";
    creativityText.text      = "Problem-Solving: " + Mathf.RoundToInt((float)(ps / 15.0 * 100.0)) + "%";
    languageText.text        = "Task Completion: " + Mathf.RoundToInt((float)(comp / 10.0 * 100.0)) + "%";
    totalScoreText.text      = "TOTAL: " + Mathf.RoundToInt((float)total) + " / 100";
The Firestore score fields stay as points (the website Performance tab shows points).

### 4.12 Grotto: popup appears after question 4, and the beacon  [30 min]  (needs the current TouristSequenceManager.cs)
Cause: TouristSequenceManager sets QuizManager.totalQuestions to its own question count (4), so the score popup fires before the
INSIDEGROTTO question. Fix:
1. Add  public int questionsOutsideThisManager = 0;  and set it to 1 on the Grotto scene only.
2. Where it sets totalQuestions use:  QuizManager.Instance.totalQuestions = active.Count + questionsOutsideThisManager;
3. Do NOT put a LevelSettings on INSIDEGROTTO (it would reset the quiz). Level 1's key is set on the first Grotto scene.
Beacon missing: TouristSequenceManager Inspector showed Beacon = None. Drag interactionbeacon into it. NPCSequenceManager also logs
"Beacon is not assigned!" until its Beacon slot is filled. Make the beacon taller and brighter.

### 4.13 Path guide to the gate after question 4 (Grotto)  [30 min, optional]
In TouristSequenceManager add  public GameObject[] showWhenFinished;  and in the "past the last question" branch of ApplyQuestion add
    foreach (var g in showWhenFinished) if (g != null) g.SetActive(true);
Place inactive beacon/arrow objects along the path to the gate and drag them into the array.

### 4.14 Settings menu  [1.5-2 h, only if time remains]  (needs AudioManager.cs, VRInputModule.cs)
Design agreed: gaze-friendly + / - buttons (no sliders). Settings: BGM volume, SFX volume, look sensitivity (scales lookHorizontalSpeed and
lookVerticalSpeed in VRPlayerController), render distance preset (Low 60 / Medium 120 / High 250 far clip), FPS counter on/off, Log out
(FirebaseAuth.SignOut, StudentSession.Clear, load StudentLoginScene, destroy persistent Player/QuizManager like QuizManager.ExitToLogin does),
Exit (Application.Quit, only on the map scene because levels are tests). Store values in PlayerPrefs and apply them at startup.

### 4.15 Video popup after the tour guide  [1 h, optional, only with finished clips]
Use unity/VideoPopup.cs. Clips: MP4 H.264, 720p, under ~45 s and ~10 MB each. Test one on the phone early.
1. ReticleCanvas > VideoPopupRoot with VideoPopup (keep active). Child Panel (dark, AlwaysOnTopMap) containing a RawImage and a TMP hint.
   Drag Panel, RawImage, hint into the slots; optionally the music AudioSource into Music To Duck.
2. NPCInteractable: add  public UnityEngine.Video.VideoClip videoAfterDialogue;  and in Interact(), after callback is built:
       System.Action inner = callback;
       if (videoAfterDialogue != null && VideoPopup.Instance != null)
           callback = () => VideoPopup.Instance.Play(videoAfterDialogue, inner);
3. VRInputModule.Process(), above the popupOpen check:
       bool videoOpen = VideoPopup.Instance != null && VideoPopup.Instance.IsOpen;
       if (reticleImage != null && videoOpen) reticleImage.enabled = false;
       if (videoOpen) { HideLabel(); if (Input.GetKeyDown(interactButton)) VideoPopup.Instance.Close(); return; }
4. Drag a clip into Video After Dialogue on each Tour Guide NPC.

### 4.16 NPC sound is bad  [5 min]
No voices. Lower the blip volume in AudioManager (about 0.2) and keep max blip length short.

### 4.17 Unity login/register screen (check it is finished)
StudentLoginScene: StudentAuth on an AuthController object. Login fields: Student ID + password. Register fields: Student ID, Full Name,
Section dropdown (from the sections collection), Password, Confirm Password (username is optional, empty = Student ID).
Buttons: Login > Login(), Create Account > ShowRegister(), Register > Register(), Back to Login > ShowLogin().
Remove old LoginController and LoginManager. Do NOT delete the FireBaseManager object. The user's StudentAuth may include stricter rules
(10-digit ID, strong password) than the zip version; keep the user's version.
Requires Firebase.Auth.dll (import FirebaseAuth.unitypackage from the same SDK version, then Android Resolver > Force Resolve).

### 4.18 Other Unity edits already specified earlier (verify they are present)
DialogueUI.StartDialogue first line:  if (npc != null && npc.isRoamingTourist) QuizManager.Instance?.NavEnd();
DialogueUI.OnTimeExpired:             QuizManager.Instance?.RecordAnswer(0, 0f, true);
TouristSequenceManager: destinationName must match the website exactly ("Our Lady of Lourdes Grotto", "Mt. Balagbag", "Padre Pio"),
3 Reserve Waypoints each with a child named PlayerStandPoint. LevelSettings on each level: Level1/2/3_Completed.
QuestionExporter (menu DejaView > Export Questions) + website Admin > Import Questions fills the question bank from the scenes.

### 4.19 Website checks
Admin: sections exist (register dropdown needs them), teacher accounts created with sections, import done. Teacher: approve a test student,
Question Bank shows questions, Performance shows a finished level. Delete old plain-text-password docs in students.

### 4.20 Build and test on the phone  [1 h]
1. Build Settings: StudentLoginScene first, then START_SCENE and the 3 levels (+ INSIDEGROTTO). File > Build Settings > Android.
2. Uninstall the old APK, install the new one, check name and icon.
3. Test: register > teacher approves on the website > login > welcome popup > Level 1 including INSIDEGROTTO > score popup (percentages) >
   scores document in Firestore > Level 2 unlocks > Level 1 card now locked > Level 3 > "Training Complete!" popup > back to login.
4. Test an extra question added on the website appears at a reserve waypoint. Test an expired account (set expiresAt in the past) is refused.
5. Use hotspot internet in case venue Wi-Fi fails.

### 4.21 Defense preparation
- Create approved demo accounts beforehand; play one level so the Performance tab has data. Record a full backup video of the run.
- Slide "Limitations and future work": voice-over, videos in every scene, extra map areas, scores computed on the phone (could be tampered
  with), registration relies on instructor approval, no password reset screen, client-side password rules.
- The paper said 6 criteria but lists 5 (35+20+20+15+10); the system uses 5.

---------------------------------------------------------------------
## 5. Files the new assistant should ask the user for
QuizManager.cs, TouristSequenceManager.cs, StudentAuth.cs, DialogueUI.cs, AudioManager.cs, VRInputModule.cs, NPCInteractable.cs,
MapGuide.cs, LevelLock.cs, StudentSession.cs; screenshot of the Grotto Hierarchy and the NPCSequenceManager Inspector; the exact Console
error for anything that fails.

## 6. Files in DejaView_all_files.zip
Website: login.html, index.html, admin.html, teacher.js, bank.js, modules.js, import.js, waypoints.js, destinations.js, dejaview.css,
admin.js, images/, firestore.rules. Unity: unity/StudentSession.cs, StudentAuth.cs, QuizManager.cs, TouristSequenceManager.cs,
LevelSettings.cs, LevelLock.cs, MapGuide.cs, FirebaseManager.cs, ControllerGhostHUD.cs, VideoPopup.cs, Editor/QuestionExporter.cs.


---
## UPDATE (Oct 7): Class sessions, capacity, teacher-entered grading

**New flow:** register -> teacher approves (valid for the semester) -> teacher ACTIVATES (whole class or one student, level + hours) -> student plays, teacher watches -> teacher enters 5 criteria in Evaluation -> "Submit & release" -> student sees result in student.html (and PDF).

**Firestore:** `sections/{name}` {name, capacity}; `sessions/{section}_L{level}[_{uid}]` {section, level, destination, status open|closed, studentUid, opensAt, closesAt, teacherUid}; `evaluations/{uid}_L{level}` {uid, section, level, 5 criteria, total, remarks, status draft|submitted, evaluatorName, submittedAt}. `scores` is now only a progress marker, and can only be created while a session is open (rules `canPlay`).

**Website files changed:** firestore.rules (publish!), admin.html/js (multi-add sections + capacity + toasts), index.html, teacher.js (capacity cards, reminder popup, activation, evaluation, class score sheet), report.js (printHtml), student.html/js, toast.js, dejaview.css. print.js was deleted.

**Unity files changed/new:** PlayAccess.cs (new), InactivePopup.cs (new), StudentSession.cs, StudentAuth.cs, LevelLock.cs, QuizManager.cs (showAutoScores = false by default).
**Unity setup:** in the map scene add an empty object with InactivePopup, drag a panel + TMP text (message is filled in automatically).

---
## UPDATE 2 (Oct 7, later): web redesign pass (all popups, validation, rules)

**Flow decisions:** the teacher trains ONE student at a time. One activation covers all 3 maps (3 session docs with the same closing time). A map locks after it is finished (or after 5 minutes). Teacher can Reset map (deletes the `scores` marker). Students answer OUT LOUD (30 s per question, 5 questions per map); no choice buttons in the new game version.

**Web (done, untested in a browser):**
- `toast.js`: toast, ask (confirm), choose (dropdown), pickMany (checkboxes), askText, normName/cleanName, niceError, busy. No browser alert/confirm/prompt anywhere.
- `firestore.rules`: field whitelists, number bounds, id checks, 6-hour max session, teacher can delete scores (Reset), students can only create their own pending record in a real section, teachers can only change status/fullname/approvedAt/expiresAt.
- `admin.js/html`: multi-add sections (duplicates blocked, case/dash/space insensitive), inline capacity, per-section registered/pending/teacher table, checkbox teacher form, Sections picker dialog, Reset password email, delete guards.
- `teacher.js/index.html`: Activate student (all 3 maps, minutes dropdown), Maps chips, Reset map, End semester (archive), archived view + Restore, Approve all, notification bell (pending, needs grading, drafts, capacity, closing sessions, expiring accounts), auto refresh every minute with toasts, change-password email, unsaved-score guard, Evaluation with validation.
- `bank.js`: Question Bank now has key points; old 3 choices are optional inside a collapsed section; Print question sheet (offline backup).
- `modules.js`, `waypoints.js`, `import.js`, `login.html`, `student.html/js`: validation + toasts.

**Still to do (Unity / decisions):** question screen without choices + 30 s timer, 5 questions per map, lock the map when it STARTS (not only when finished), smart register (existing Auth account, missing student doc), forgot password (collect real email?), roster upload, Now Playing panel, spectator camera test (USB-C to HDMI), clickable objects/NPC, consent line, scene setup for InactivePopup + LevelTimer, old open items (Grotto count, beacon, colliders, icon, Level 3 popup, settings wiring).

---
## UPDATE 3 (Oct 7, noon): requested fixes
- Admin: Employee ID = exactly 10 digits (rules + form). Password: 8+ chars with a letter and a number. Header shows Dr. Nelidiza R. Arceta, Department Head / BSTM Program Head.
- Import Questions removed from the admin page (file kept in `optional_dev_tools/import.js` for developers only).
- "Waypoint" explained in plain words; section renamed "Extra Questions".
- Teacher: no class-wide activation (one student at a time). Student List grouped by section, with Activate/Deactivate, Evaluate and a "More actions" dropdown. Evaluate opens a pop-up. "Student Records" is read-only, grouped by section, with View and Print class score sheet.
- Question Bank: no A/B/C choices (new questions save `options: []`; the Unity game still needs the spoken-answer update).
- Training Modules now also appear on the student page (read-only).

---
## UPDATE 4 (Oct 7, afternoon)
- The website is for ADMIN and TEACHERS only. `student.html/student.js` were deleted. Students see their released results (collection `evaluations`, own uid, status "submitted") and the Training Modules (collection `modules`, public read) INSIDE THE VR APP -> new Unity tasks: "My Results" panel + modules viewer.
- Staff log in with Email or 10-digit Employee ID. New teachers are created with the login `<employeeId>@staff.dejaview.app` (no real email needed). Older teachers made with a real email still log in with that email.
- No emails and no "Firebase" wording anywhere in the UI. "Change password" works inside the site (current password + new one). A forgotten password must be reset by the developer in the Firebase Console.
- Department head name/title is stored in `settings/app` and editable in the admin header; it is printed as "Noted by" on the class score sheet.
- Logo: put the department logo at `images/htm-logo.png`; the pages fall back to the BulSU seal if the file is missing.
- Teacher lists: Student List and Student Records start on the first section, have filters (Show), Sort by and Search, a scrolling table with sticky headers, and a "Showing X of Y" counter.
