using System;
using System.Collections.Generic;

// Holds who is logged in and which levels they finished (loaded from the "scores" collection at login)
public static class StudentSession
{
    public static string Uid = "";
    public static string StudentId = "";
    public static string FullName = "";
    public static string Username = "";
    public static string Section = "";
    public static DateTime? ExpiresAt;

    static readonly HashSet<string> done = new HashSet<string>();

    // Levels the instructor has opened for this student right now (from the "sessions" collection)
    static readonly HashSet<int> playable = new HashSet<int>();
    public static bool HasAccess { get { return playable.Count > 0; } }
    public static bool CanPlay(int level) { return playable.Contains(level); }
    public static void SetPlayable(IEnumerable<int> levels) { playable.Clear(); foreach (var l in levels) playable.Add(l); }

    public static bool LoggedIn { get { return !string.IsNullOrEmpty(Uid); } }
    public static bool IsCompleted(string key) { return done.Contains(key); }
    public static void MarkCompleted(string key) { done.Add(key); }

    public static void SetCompleted(IEnumerable<string> keys)
    {
        done.Clear();
        foreach (var k in keys) done.Add(k);
    }

    public static void Clear()
    {
        Uid = ""; StudentId = ""; FullName = ""; Username = ""; Section = "";
        ExpiresAt = null;
        done.Clear();
        playable.Clear();
    }
}
