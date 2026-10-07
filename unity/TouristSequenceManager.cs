using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using Firebase.Firestore;
using Firebase.Extensions;

public class TouristSequenceManager : MonoBehaviour
{
    public static TouristSequenceManager Instance;

    [System.Serializable]
    public class TouristQuestion
    {
        public string questionNpcName = "Bernadette";
        public Transform waypoint;
        public DialogueLine[] lines;
        public DialogueChoice[] choices;
        public bool useTimer = true;
        public float timeLimitSeconds = 120f;
    }

    public NPCInteractable touristNPC;
    public Transform beacon;
    public TouristQuestion[] questions;          // the built-in questions (also the offline fallback)
    public float beaconHeightOffset = 2.8f;

    [Header("Website questions (Firestore)")]
    [Tooltip("Must match the destination name on the website exactly")]
    public string destinationName = "Mt. Balagbag";
    [Tooltip("The 3 spare waypoints. Extra questions added on the website use them in order.")]
    public Transform[] reserveWaypoints;
    public bool loadFromWebsite = true;
    public float loadTimeoutSeconds = 8f;

    [Header("Fade + player teleport")]
    public bool useFadeBetweenQuestions = true;
    public string standPointName = "PlayerStandPoint";

    private List<TouristQuestion> active = new List<TouristQuestion>();
    private int currentIndex = 0;

    void Awake() { Instance = this; }
    void Start() { StartCoroutine(Boot()); }

    IEnumerator Boot()
    {
        active = new List<TouristQuestion>();
        if (questions != null) foreach (var q in questions) active.Add(Clone(q));

        if (loadFromWebsite)
        {
            float t = 0f;
            while ((FirebaseManager.Instance == null || FirebaseManager.Instance.Db == null) && t < loadTimeoutSeconds)
            { t += Time.deltaTime; yield return null; }

            if (FirebaseManager.Instance != null && FirebaseManager.Instance.Db != null)
            {
                bool done = false;
                QuerySnapshot snap = null;
                FirebaseManager.Instance.Db.Collection("Scenarios_tbl")
                    .WhereEqualTo("destinationID", destinationName)
                    .GetSnapshotAsync().ContinueWithOnMainThread(task =>
                    {
                        if (!task.IsFaulted && !task.IsCanceled) snap = task.Result;
                        done = true;
                    });
                while (!done && t < loadTimeoutSeconds) { t += Time.deltaTime; yield return null; }

                if (snap != null && snap.Count > 0) BuildFromWebsite(snap);
                else Debug.LogWarning("Website questions not loaded for '" + destinationName + "'. Using the built-in questions.");
            }
        }

        yield return null;   // let LevelSettings run first, then set the real question count
        if (QuizManager.Instance != null) QuizManager.Instance.totalQuestions = active.Count;
        ApplyQuestion(0);
    }

    // ---------- website questions ----------
    void BuildFromWebsite(QuerySnapshot snap)
    {
        var baseDocs = new List<DocumentSnapshot>();
        var extraDocs = new List<DocumentSnapshot>();
        foreach (DocumentSnapshot d in snap.Documents)
        {
            var m = d.ToDictionary();
            bool extra = m.ContainsKey("isExtra") && m["isExtra"] is bool && (bool)m["isExtra"];
            if (extra) extraDocs.Add(d); else baseDocs.Add(d);
        }
        baseDocs.Sort((a, b) => OrderOf(a).CompareTo(OrderOf(b)));
        extraDocs.Sort((a, b) => CreatedOf(a).CompareTo(CreatedOf(b)));

        // Edited text for the built-in questions (matched by order)
        for (int i = 0; i < active.Count && i < baseDocs.Count; i++) ApplyDoc(active[i], baseDocs[i], true);

        // Extra questions go to the reserve waypoints
        if (reserveWaypoints != null && active.Count > 0)
        {
            TouristQuestion tpl = active[active.Count - 1];
            for (int k = 0; k < extraDocs.Count && k < reserveWaypoints.Length; k++)
            {
                var q = Clone(tpl);
                q.waypoint = reserveWaypoints[k];
                q.lines = null;
                q.choices = null;
                ApplyDoc(q, extraDocs[k], false);
                active.Add(q);
            }
        }
    }

    void ApplyDoc(TouristQuestion q, DocumentSnapshot doc, bool isBase)
    {
        var m = doc.ToDictionary();

        string speaker = Str(m, "speakerNPC");
        if (!string.IsNullOrEmpty(speaker)) q.questionNpcName = speaker;

        var lines = new List<DialogueLine>();
        if (m.ContainsKey("introLines") && m["introLines"] is List<object>)
        {
            foreach (object o in (List<object>)m["introLines"])
            {
                var lm = o as Dictionary<string, object>;
                if (lm == null) continue;
                lines.Add(new DialogueLine { isPlayerSpeaking = lm.ContainsKey("isPlayerSpeaking") && lm["isPlayerSpeaking"] is bool && (bool)lm["isPlayerSpeaking"], text = Str(lm, "text") });
            }
        }
        else if (isBase && q.lines != null)
        {
            for (int i = 0; i < q.lines.Length - 1; i++) lines.Add(q.lines[i]);   // keep the built-in intro lines
        }
        lines.Add(new DialogueLine { isPlayerSpeaking = false, text = Str(m, "questionText") });
        q.lines = lines.ToArray();

        var choices = new List<DialogueChoice>();
        if (m.ContainsKey("options") && m["options"] is List<object>)
        {
            foreach (object o in (List<object>)m["options"])
            {
                var om = o as Dictionary<string, object>;
                if (om == null) continue;
                string reaction = Str(om, "reaction");
                choices.Add(new DialogueChoice
                {
                    choiceText = Str(om, "text"),
                    scoreValue = om.ContainsKey("scoreWeight") ? System.Convert.ToInt32(om["scoreWeight"]) : 0,
                    responseLines = string.IsNullOrEmpty(reaction) ? new string[0] : new[] { reaction }
                });
            }
        }
        if (choices.Count > 0) q.choices = choices.ToArray();
    }

    static string Str(Dictionary<string, object> m, string k) { return m.ContainsKey(k) && m[k] != null ? m[k].ToString() : ""; }
    static double OrderOf(DocumentSnapshot d) { var m = d.ToDictionary(); return m.ContainsKey("order") ? System.Convert.ToDouble(m["order"]) : 0; }
    static System.DateTime CreatedOf(DocumentSnapshot d)
    {
        var m = d.ToDictionary();
        return (m.ContainsKey("createdAt") && m["createdAt"] is Timestamp) ? ((Timestamp)m["createdAt"]).ToDateTime() : System.DateTime.MinValue;
    }

    static TouristQuestion Clone(TouristQuestion o)
    {
        return new TouristQuestion
        {
            questionNpcName = o.questionNpcName, waypoint = o.waypoint, lines = o.lines, choices = o.choices,
            useTimer = o.useTimer, timeLimitSeconds = o.timeLimitSeconds
        };
    }

    // ---------- sequence ----------
    void LoadQuestion(int index)
    {
        if (touristNPC == null) return;

        bool canFade = useFadeBetweenQuestions && ScreenFader.Instance != null && index < active.Count;
        if (!canFade) { ApplyQuestion(index); return; }

        Transform standPoint = null;
        Transform wp = active[index].waypoint;
        if (wp != null) standPoint = wp.Find(standPointName);

        ScreenFader.Instance.Transition(() => ApplyQuestion(index), standPoint);
    }

    void ApplyQuestion(int index)
    {
        if (touristNPC == null) return;

        if (index >= active.Count)
        {
            touristNPC.gameObject.SetActive(false);
            if (beacon != null) beacon.gameObject.SetActive(false);
            NPCSequenceManager.Instance?.NotifyDialogueFinished(touristNPC);
            return;
        }

        TouristQuestion q = active[index];

        if (q.waypoint != null)
        {
            touristNPC.transform.position = q.waypoint.position;
            touristNPC.transform.rotation = q.waypoint.rotation;
        }

        touristNPC.npcName = q.questionNpcName;
        touristNPC.dialogueLines = q.lines;
        touristNPC.choices = q.choices;
        touristNPC.useTimer = q.useTimer;
        touristNPC.timeLimitSeconds = q.timeLimitSeconds;

        if (beacon != null && q.waypoint != null)
        {
            InteractionBeacon beaconScript = beacon.GetComponent<InteractionBeacon>();
            Vector3 pos = q.waypoint.position + Vector3.up * beaconHeightOffset;
            if (beaconScript != null) beaconScript.SetBasePosition(pos);
            else beacon.position = pos;
            beacon.gameObject.SetActive(true);
        }

        QuizManager.Instance?.NavStart();   // starts timing how long the student takes to begin this question
    }

    public void NotifyQuestionAnswered()
    {
        currentIndex++;
        LoadQuestion(currentIndex);
    }
}
