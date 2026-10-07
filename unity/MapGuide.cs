using System.Collections;
using UnityEngine;

public class MapGuide : MonoBehaviour
{
    public static bool welcomeShown;
    // MUST match the completion keys in LevelSettings and LevelLock
    public static readonly string[] Keys  = { "Level1_Completed", "Level2_Completed", "Level3_Completed" };
    public static readonly string[] Names = { "Our Lady of Lourdes Grotto", "Mt. Balagbag", "Padre Pio" };

    IEnumerator Start()
    {
        while (MessagePopup.Instance == null) yield return null;
        yield return new WaitForSeconds(0.8f);

        int done = 0;
        while (done < Keys.Length && StudentSession.IsCompleted(Keys[done])) done++;

        if (done == 0)
        {
            if (welcomeShown) yield break;
            welcomeShown = true;
            MessagePopup.Instance.Show("Welcome, {name}!", new[]
            {
                "You're a tourism student trainee. Your job is to guide visitors and answer their questions.",
                "Look at a person and press A to talk. When choices appear, press X to move and A to confirm.",
                "Each level is a test. Once you start, finish all the questions.",
                "Look at a map card and press X to travel. Start with Level 1: " + Names[0] + "!"
            });
            yield break;
        }

        if (done >= Keys.Length) yield break;

        // Remember per student that the "level complete" message was already shown
        string ann = "Announced_" + StudentSession.Uid + "_" + Keys[done - 1];
        if (PlayerPrefs.GetInt(ann, 0) == 1) yield break;
        PlayerPrefs.SetInt(ann, 1); PlayerPrefs.Save();

        MessagePopup.Instance.Show("Level " + done + " complete!", new[]
        {
            "You can now proceed to Level " + (done + 1) + ": " + Names[done] + "!\nLook at the unlocked map card and press X to travel."
        });
    }

    public static void ResetAll() { welcomeShown = false; }
}
