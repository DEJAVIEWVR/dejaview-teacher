using UnityEngine;

public class LevelLock : MonoBehaviour
{
    [Tooltip("Key that must be completed BEFORE this map opens, e.g. Level1_Completed")]
    public string requiredCompletionKey = "Level1_Completed";

    [Tooltip("This map's OWN key, e.g. Level2_Completed. Once the student finishes it, the card locks for good.")]
    public string ownCompletionKey = "";

    [Tooltip("Check this for the very first map - it is open until its own key is completed")]
    public bool alwaysUnlocked = false;

    public bool IsUnlocked()
    {
        // The instructor must have activated this level for the student (class session)
        if (!PlayAccess.LevelOpen(ownCompletionKey)) return false;

        // A finished level can never be entered again (it is a test)
        if (!string.IsNullOrEmpty(ownCompletionKey) && IsDone(ownCompletionKey)) return false;

        if (alwaysUnlocked) return true;
        return IsDone(requiredCompletionKey);
    }

    static bool IsDone(string key)
    {
        if (StudentSession.LoggedIn) return StudentSession.IsCompleted(key);
#if UNITY_EDITOR
        return PlayerPrefs.GetInt(key, 0) == 1;   // editor testing without logging in
#else
        return false;
#endif
    }
}
