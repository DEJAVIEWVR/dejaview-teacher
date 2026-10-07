#if UNITY_EDITOR
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

// Menu: DejaView > Export Questions (current scene)
// Writes questions_<destination>.json in the project folder. Upload it on the website: Admin > Import Questions.
public static class QuestionExporter
{
    [System.Serializable] public class ExLine { public bool isPlayerSpeaking; public string text; }
    [System.Serializable] public class ExOpt { public string text; public int scoreWeight; public string reaction; }
    [System.Serializable] public class ExQ
    {
        public string destinationID; public string speakerNPC; public string questionText; public int order;
        public List<ExLine> introLines = new List<ExLine>();
        public List<ExOpt> options = new List<ExOpt>();
    }
    [System.Serializable] public class ExAll { public List<ExQ> questions = new List<ExQ>(); }

    [MenuItem("DejaView/Export Questions (current scene)")]
    static void Export()
    {
        var mgr = Object.FindObjectOfType<TouristSequenceManager>();
        if (mgr == null) { EditorUtility.DisplayDialog("Export", "No TouristSequenceManager in this scene.", "OK"); return; }

        var all = new ExAll();
        for (int i = 0; i < mgr.questions.Length; i++)
        {
            var q = mgr.questions[i];
            if (q.lines == null || q.lines.Length == 0) continue;

            // The last line spoken by the tourist is the question; everything before it is intro dialogue
            int qi = -1;
            for (int k = q.lines.Length - 1; k >= 0; k--) if (!q.lines[k].isPlayerSpeaking) { qi = k; break; }
            if (qi < 0) continue;

            var e = new ExQ { destinationID = mgr.destinationName, speakerNPC = q.questionNpcName, questionText = q.lines[qi].text, order = i + 1 };
            for (int k = 0; k < qi; k++) e.introLines.Add(new ExLine { isPlayerSpeaking = q.lines[k].isPlayerSpeaking, text = q.lines[k].text });
            if (q.choices != null)
                foreach (var c in q.choices)
                    e.options.Add(new ExOpt { text = c.choiceText, scoreWeight = c.scoreValue, reaction = c.responseLines != null ? string.Join("\n", c.responseLines) : "" });
            all.questions.Add(e);
        }

        string safe = mgr.destinationName.Replace(" ", "_").Replace(".", "");
        string path = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "questions_" + safe + ".json"));
        File.WriteAllText(path, JsonUtility.ToJson(all, true));
        Debug.Log("Exported " + all.questions.Count + " questions to " + path);
        EditorUtility.RevealInFinder(path);
    }
}
#endif
