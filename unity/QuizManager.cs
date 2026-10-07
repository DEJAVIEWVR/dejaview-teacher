using System.Collections.Generic;
using System.Text.RegularExpressions;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using Firebase.Firestore;
using Firebase.Extensions;

public class QuizManager : MonoBehaviour
{
    public static QuizManager Instance;

    [Header("Quiz Settings")]
    public int totalQuestions = 5;

    [Header("Level key (set by LevelSettings)")]
    public string completionKey = "Level1_Completed";

    [Header("Ending (last level)")]
    public string finalCompletionKey = "Level3_Completed";
    public string loginSceneName = "StudentLoginScene";

    [Header("Navigation scoring: seconds to start the next question")]
    public float navFullMarksSeconds = 15f;   // started within this time = full marks
    public float navZeroSeconds = 60f;        // took this long or more = zero

    [Header("Scoreboard UI (same slots as before)")]
    public GameObject scorePopupPanel;
    public TMP_Text contentAccuracyText;   // shows Tour Knowledge (35)
    public TMP_Text deliveryText;          // shows Time Management (20)
    public TMP_Text stagePresenceText;     // shows Tour Sequence & Navigation (20)
    public TMP_Text creativityText;        // shows Problem-Solving (15)
    public TMP_Text languageText;          // shows Task Completion (10)
    public TMP_Text audienceText;          // not used any more (hidden)
    public TMP_Text totalScoreText;
    public TMP_Text continuePromptText;

    private int totalScore;            // sum of answer weights (0-100 each)
    private float totalSpeedFraction;
    private int questionsAnswered;     // includes timeouts
    private int choicesMade;           // real answers only
    private int goodAnswers;           // answers worth 50% or more
    private float navAccum;
    private float navStartTime = -1f;
    private bool pendingFinish;
    private bool scoreSaved;
    private bool saving;
    private double kn, tm, nav, ps, comp, total;

    public bool IsPopupOpen { get; private set; }

    void Awake()
    {
        if (Instance != null && Instance != this) { Destroy(gameObject); return; }
        Instance = this;
        DontDestroyOnLoad(gameObject);
        if (scorePopupPanel != null) scorePopupPanel.SetActive(false);
    }

    // ---- navigation timing (TouristSequenceManager starts it, DialogueUI ends it) ----
    public void NavStart() { navStartTime = Time.time; }

    public void NavEnd()
    {
        if (navStartTime < 0f) return;
        float s = Time.time - navStartTime;
        navStartTime = -1f;
        float span = Mathf.Max(1f, navZeroSeconds - navFullMarksSeconds);
        navAccum += Mathf.Clamp01(1f - (s - navFullMarksSeconds) / span);
    }

    public void RecordAnswer(int scoreValue, float speedFraction, bool timedOut = false)
    {
        int w = Mathf.Clamp(scoreValue, 0, 100);
        totalScore += w;
        totalSpeedFraction += Mathf.Clamp01(speedFraction);
        questionsAnswered++;
        if (!timedOut)
        {
            choicesMade++;
            if (w >= 50) goodAnswers++;
        }
        if (questionsAnswered >= totalQuestions) pendingFinish = true;   // wait until the dialogue closes
    }

    // Called by DialogueUI right after its panel closes
    public void NotifyDialogueClosed()
    {
        if (pendingFinish)
        {
            pendingFinish = false;
            FinishQuiz();
        }
    }

    bool finishedOnce;

    // Called by LevelTimer when the play time runs out: ends the level with the answers given so far
    public void ForceFinish()
    {
        if (finishedOnce) return;
        FinishQuiz();
    }

    void FinishQuiz()
    {
        if (finishedOnce) return;
        finishedOnce = true;
        float n = Mathf.Max(1, totalQuestions);
        kn   = (totalScore / (n * 100f)) * 35f;
        tm   = (totalSpeedFraction / n) * 20f;
        nav  = (navAccum / n) * 20f;
        ps   = (goodAnswers / n) * 15f;
        comp = (choicesMade / n) * 10f;
        total = kn + tm + nav + ps + comp;

        ShowFinalScore();
        SaveScore();
    }

    [Header("Grading")]
    [Tooltip("OFF = the instructor grades on the website. The game only shows the criteria names and a message.")]
    public bool showAutoScores = false;

    void ShowFinalScore()
    {
        if (scorePopupPanel == null) return;
        scorePopupPanel.SetActive(true);

        if (!showAutoScores)
        {
            if (contentAccuracyText != null) contentAccuracyText.text = "Tour Knowledge & Content Accuracy (35)";
            if (deliveryText != null) deliveryText.text = "Time Management & Response (20)";
            if (stagePresenceText != null) stagePresenceText.text = "Tour Sequence & Navigation (20)";
            if (creativityText != null) creativityText.text = "Problem-Solving & Scenarios (15)";
            if (languageText != null) languageText.text = "Task Completion Rate (10)";
            if (audienceText != null) audienceText.gameObject.SetActive(false);
            if (totalScoreText != null) totalScoreText.text = "Your instructor will evaluate you.";
            if (continuePromptText != null) continuePromptText.text = "Saving your progress...";
            return;
        }

        if (contentAccuracyText != null) contentAccuracyText.text = "Tour Knowledge & Content Accuracy: " + kn.ToString("F1") + " / 35";
        if (deliveryText != null) deliveryText.text = "Time Management & Response: " + tm.ToString("F1") + " / 20";
        if (stagePresenceText != null) stagePresenceText.text = "Tour Sequence & Navigation: " + nav.ToString("F1") + " / 20";
        if (creativityText != null) creativityText.text = "Problem-Solving & Scenarios: " + ps.ToString("F1") + " / 15";
        if (languageText != null) languageText.text = "Task Completion Rate: " + comp.ToString("F1") + " / 10";
        if (audienceText != null) audienceText.gameObject.SetActive(false);
        if (totalScoreText != null) totalScoreText.text = "TOTAL: " + total.ToString("F1") + " / 100";
        if (continuePromptText != null) continuePromptText.text = "Saving your results...";
    }

    // ---- progress marker: scores/<uid>_L<level>. Grades are entered by the instructor on the website (evaluations) ----
    void SaveScore()
    {
        if (!StudentSession.LoggedIn || FirebaseManager.Instance == null || FirebaseManager.Instance.Db == null)
        {
            Debug.LogWarning("Score not saved: no logged-in student (normal when testing a level directly).");
            MarkSaved();
            return;
        }

        saving = true;
        Match lv = Regex.Match(completionKey, @"\d+");
        int level = lv.Success ? int.Parse(lv.Value) : 0;
        string destination = TouristSequenceManager.Instance != null ? TouristSequenceManager.Instance.destinationName : completionKey;

        var data = new Dictionary<string, object>
        {
            { "uid", StudentSession.Uid },
            { "studentIdNumber", StudentSession.StudentId },
            { "fullname", StudentSession.FullName },
            { "section", StudentSession.Section },
            { "level", level },
            { "destination", destination },
            { "createdAt", FieldValue.ServerTimestamp }
        };

        DocumentReference docRef = FirebaseManager.Instance.Db.Collection("scores").Document(StudentSession.Uid + "_L" + level);
        docRef.SetAsync(data).ContinueWithOnMainThread(t =>
        {
            if (t.IsFaulted || t.IsCanceled) { OnSaveFailed(docRef); return; }
            MarkSaved();
        });
    }

    void OnSaveFailed(DocumentReference docRef)
    {
        // The write may have reached the server even though the app saw an error: check before asking to retry
        docRef.GetSnapshotAsync().ContinueWithOnMainThread(t =>
        {
            if (!t.IsFaulted && !t.IsCanceled && t.Result.Exists) { MarkSaved(); return; }
            saving = false;
            if (continuePromptText != null) continuePromptText.text = "Could not save. Check your internet and make sure your instructor has not closed the activity, then press A to retry.";
        });
    }

    void MarkSaved()
    {
        saving = false;
        scoreSaved = true;
        StudentSession.MarkCompleted(completionKey);
        if (continuePromptText != null) continuePromptText.text = "Results saved. Press A to Continue";
    }

    public bool IsShowingScore()
    {
        return scorePopupPanel != null && scorePopupPanel.activeInHierarchy;
    }

    // Called when the player presses A on the score panel
    public void BackToMapSelection()
    {
        if (!scoreSaved) { if (!saving) SaveScore(); return; }

        bool wasFinal = completionKey == finalCompletionKey;
        ResetQuiz();
        if (wasFinal) { ShowEnding(); return; }
        SceneManager.LoadScene("START_SCENE");
    }

    void ShowEnding()
    {
        if (MessagePopup.Instance == null) { ExitToLogin(); return; }
        MessagePopup.Instance.Show("Training Complete!", new[]
        {
            "Congratulations, {name}! You finished the DejaView VR tour guide simulator.",
            "Your results were saved. Press A to return to the login screen."
        }, ExitToLogin, "Press A to finish");
    }

    void ExitToLogin()
    {
        Firebase.Auth.FirebaseAuth.DefaultInstance.SignOut();
        StudentSession.Clear();
        MapGuide.ResetAll();

        var player = FindObjectOfType<VRPlayerController>();
        if (player != null) Destroy(player.gameObject);

        if (EventSystem.current != null && EventSystem.current.gameObject.scene.name == "DontDestroyOnLoad")
            Destroy(EventSystem.current.gameObject);

        Instance = null;
        SceneManager.LoadScene(loginSceneName);
        Destroy(gameObject);
    }

    public void ResetQuiz()
    {
        totalScore = 0; totalSpeedFraction = 0f; questionsAnswered = 0;
        choicesMade = 0; goodAnswers = 0; navAccum = 0f; navStartTime = -1f;
        pendingFinish = false; scoreSaved = false; saving = false;
        kn = tm = nav = ps = comp = total = 0;
        if (scorePopupPanel != null) scorePopupPanel.SetActive(false);
    }
}
