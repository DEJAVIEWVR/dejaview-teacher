using UnityEngine;
using UnityEngine.SceneManagement;

// Limits how far the camera draws, and hides the cut-off with fog.
// Put this on the Player (it persists between scenes). It re-applies after every scene load.
public class RenderDistance : MonoBehaviour
{
    [Tooltip("How far the camera can see, in metres. Lower = faster on phones. Try 60 (low), 120 (medium), 250 (high).")]
    public float farClip = 120f;

    public bool useFog = true;
    public Color fogColor = new Color(0.72f, 0.82f, 0.92f);
    [Range(0.2f, 0.95f)] public float fogStartFraction = 0.6f;   // fog starts at this share of the distance

    void OnEnable()  { SceneManager.sceneLoaded += OnSceneLoaded; }
    void OnDisable() { SceneManager.sceneLoaded -= OnSceneLoaded; }
    void Start()     { Apply(); }

    void OnSceneLoaded(Scene s, LoadSceneMode m) { Apply(); }

    // Call this from a settings menu: RenderDistance.Set(60f);
    public void SetDistance(float metres) { farClip = metres; Apply(); }

    public void Apply()
    {
        Camera cam = Camera.main;
        if (cam != null) cam.farClipPlane = farClip;

        if (useFog)
        {
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = fogColor;
            RenderSettings.fogStartDistance = farClip * fogStartFraction;
            RenderSettings.fogEndDistance = farClip;
        }
    }
}
