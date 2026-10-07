using TMPro;
using UnityEngine;

// Play-time limit for one map (default 5 minutes). Put it on an object in EACH level scene.
// Drag a TMP text (the countdown, e.g. "04:59") into timerText; turns red in the last minute.
public class LevelTimer : MonoBehaviour
{
    public float minutes = 5f;
    public TMP_Text timerText;
    public TMP_Text messageText;   // optional: shows "Time's up!"

    float left;
    bool ended;

    void Start() { left = minutes * 60f; }

    void Update()
    {
        if (ended) return;
        left -= Time.deltaTime;
        if (timerText != null)
        {
            int s = Mathf.Max(0, Mathf.CeilToInt(left));
            timerText.text = (s / 60).ToString("00") + ":" + (s % 60).ToString("00");
            timerText.color = left <= 60f ? Color.red : Color.white;
        }
        if (left > 0f) return;

        ended = true;
        if (messageText != null) messageText.text = "Time's up! Saving your progress...";
        if (QuizManager.Instance != null) QuizManager.Instance.ForceFinish();
    }
}
