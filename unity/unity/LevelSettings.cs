using UnityEngine;
using UnityEngine.SceneManagement;

public class LevelSettings : MonoBehaviour
{
    [Tooltip("Key saved when this level finishes: Level1_Completed, Level2_Completed or Level3_Completed")]
    public string completionKey = "Level2_Completed";

    [Tooltip("Fallback question count. The real number is set after the website questions load.")]
    public int totalQuestions = 5;

    void Start()
    {
        Screen.sleepTimeout = SleepTimeout.NeverSleep;   // the test must not be interrupted by screen sleep

        // The level is a one-time test: a finished level cannot be taken again
        if (StudentSession.LoggedIn && StudentSession.IsCompleted(completionKey))
        {
            SceneManager.LoadScene("START_SCENE");
            return;
        }

        if (QuizManager.Instance == null) return;
        QuizManager.Instance.completionKey = completionKey;
        QuizManager.Instance.totalQuestions = totalQuestions;
        QuizManager.Instance.ResetQuiz();
    }
}
