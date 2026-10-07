using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;
using Firebase.Firestore;
using Firebase.Extensions;

// Asks Firestore which levels the instructor has opened for this student.
// A level is playable when a session exists for the student's section with status "open",
// closesAt in the future, and studentUid empty (whole class) or equal to this student.
public static class PlayAccess
{
    public const string InactiveMessage =
        "Your account is still inactive. Please tell your instructor to activate it to play the game and pick a map.";

    // Call after login and every few seconds while waiting. onDone runs on the main thread.
    public static void Refresh(Action onDone)
    {
        if (!StudentSession.LoggedIn || FirebaseManager.Instance == null || FirebaseManager.Instance.Db == null)
        {
#if UNITY_EDITOR
            // testing in the editor without logging in: everything open
            StudentSession.SetPlayable(new[] { 1, 2, 3 });
#endif
            if (onDone != null) onDone();
            return;
        }

        FirebaseManager.Instance.Db.Collection("sessions")
            .WhereEqualTo("section", StudentSession.Section)
            .WhereEqualTo("status", "open")
            .GetSnapshotAsync().ContinueWithOnMainThread(t =>
            {
                var levels = new List<int>();
                if (!t.IsFaulted && !t.IsCanceled)
                {
                    foreach (var d in t.Result.Documents)
                    {
                        var m = d.ToDictionary();
                        if (!m.ContainsKey("closesAt") || !(m["closesAt"] is Timestamp)) continue;
                        if (((Timestamp)m["closesAt"]).ToDateTime() <= DateTime.UtcNow) continue;
                        string who = m.ContainsKey("studentUid") && m["studentUid"] != null ? m["studentUid"].ToString() : "";
                        if (who != "" && who != StudentSession.Uid) continue;
                        if (m.ContainsKey("level")) levels.Add(Convert.ToInt32(m["level"]));
                    }
                }
                else Debug.LogWarning("Could not read sessions: " + t.Exception);
                StudentSession.SetPlayable(levels);
                if (onDone != null) onDone();
            });
    }

    // Used by LevelLock. "Level2_Completed" -> level 2. No key = not a level door, always fine.
    public static bool LevelOpen(string completionKey)
    {
        if (string.IsNullOrEmpty(completionKey)) return true;
        if (!StudentSession.LoggedIn)
        {
#if UNITY_EDITOR
            return true;
#else
            return false;
#endif
        }
        Match m = Regex.Match(completionKey, @"\d+");
        return m.Success && StudentSession.CanPlay(int.Parse(m.Value));
    }
}
