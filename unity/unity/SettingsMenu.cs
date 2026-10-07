using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;

// Values live in PlayerPrefs so they stay between sessions.
public static class GameSettings
{
    public static float MusicVolume { get { return PlayerPrefs.GetFloat("set_music", 0.8f); } set { PlayerPrefs.SetFloat("set_music", value); } }
    public static float SfxVolume { get { return PlayerPrefs.GetFloat("set_sfx", 0.8f); } set { PlayerPrefs.SetFloat("set_sfx", value); } }
    public static bool ShowFps { get { return PlayerPrefs.GetInt("set_fps", 0) == 1; } set { PlayerPrefs.SetInt("set_fps", value ? 1 : 0); } }
    public static int RenderLevel { get { return PlayerPrefs.GetInt("set_render", 1); } set { PlayerPrefs.SetInt("set_render", value); } }
    public static int SensitivityLevel { get { return PlayerPrefs.GetInt("set_sens", 1); } set { PlayerPrefs.SetInt("set_sens", value); } }

    static readonly float[] far = { 120f, 300f, 700f };
    static readonly float[] sens = { 0.6f, 1f, 1.6f };
    public static float FarClip { get { return far[Mathf.Clamp(RenderLevel, 0, 2)]; } }
    public static float LookMultiplier { get { return sens[Mathf.Clamp(SensitivityLevel, 0, 2)]; } }
}

// Controller-driven settings menu: X = next row, A = change / press, Open key = open.
// Put this on an ACTIVE object under the Player (for example ReticleCanvas). The "panel" child is hidden/shown.
public class SettingsMenu : MonoBehaviour
{
    static bool open;
    static int closedFrame = -10;
    public static bool IsOpen { get { return open || Time.frameCount - closedFrame < 2; } }

    [Header("UI")]
    public GameObject panel;
    [Tooltip("In this order: Music, Sound effects, Show FPS, Render distance, Look sensitivity, Log out, Exit app, Close")]
    public TMP_Text[] rows;
    public TMP_Text fpsText;
    public Color normalColor = Color.white;
    public Color selectedColor = new Color(1f, 0.83f, 0.43f);

    [Header("Audio (drag the AudioSources)")]
    public AudioSource[] musicSources;
    public AudioSource[] sfxSources;

    [Header("Controller buttons (match your VRInputModule)")]
    public KeyCode openKey = KeyCode.Joystick1Button7;
    public KeyCode navKey = KeyCode.Joystick1Button3;      // X
    public KeyCode selectKey = KeyCode.Joystick1Button0;   // A

    public string loginSceneName = "StudentLoginScene";

    static readonly string[] levels3 = { "Low", "Normal", "High" };
    static readonly string[] render3 = { "Near", "Normal", "Far" };

    int sel;
    bool logoutArmed;
    float fpsTimer; int fpsFrames;

    void OnEnable() { SceneManager.sceneLoaded += OnSceneLoaded; }
    void OnDisable() { SceneManager.sceneLoaded -= OnSceneLoaded; }
    void OnSceneLoaded(Scene s, LoadSceneMode m) { Apply(); }

    void Start()
    {
        Application.targetFrameRate = 60;
        QualitySettings.vSyncCount = 0;
        if (panel != null) panel.SetActive(false);
        Apply();
    }

    void Update()
    {
        // FPS counter
        fpsFrames++; fpsTimer += Time.unscaledDeltaTime;
        if (fpsTimer >= 0.5f)
        {
            if (fpsText != null && GameSettings.ShowFps) fpsText.text = Mathf.RoundToInt(fpsFrames / fpsTimer) + " FPS";
            fpsFrames = 0; fpsTimer = 0f;
        }

        if (!open)
        {
            if ((Input.GetKeyDown(openKey) || Input.GetKeyDown(KeyCode.Tab)) && CanOpen()) Open();
            return;
        }

        if (Input.GetKeyDown(navKey)) { sel = (sel + 1) % rows.Length; logoutArmed = false; Refresh(); }
        if (Input.GetKeyDown(selectKey)) Choose();
        if (Input.GetKeyDown(openKey) || Input.GetKeyDown(KeyCode.Tab)) Close();
    }

    bool CanOpen()
    {
        if (DialogueUI.Instance != null && DialogueUI.Instance.IsOpen()) return false;
        if (QuizManager.Instance != null && QuizManager.Instance.IsShowingScore()) return false;
        if (MessagePopup.Instance != null && MessagePopup.Instance.IsOpen) return false;
        if (VideoPopup.IsOpen) return false;
        return true;
    }

    void Open() { open = true; sel = 0; logoutArmed = false; panel.SetActive(true); Refresh(); }
    void Close() { open = false; closedFrame = Time.frameCount; panel.SetActive(false); }

    void Choose()
    {
        switch (sel)
        {
            case 0: GameSettings.MusicVolume = Step(GameSettings.MusicVolume); break;
            case 1: GameSettings.SfxVolume = Step(GameSettings.SfxVolume); break;
            case 2: GameSettings.ShowFps = !GameSettings.ShowFps; break;
            case 3: GameSettings.RenderLevel = (GameSettings.RenderLevel + 1) % 3; break;
            case 4: GameSettings.SensitivityLevel = (GameSettings.SensitivityLevel + 1) % 3; break;
            case 5:
                if (!logoutArmed) { logoutArmed = true; break; }
                LogOut(); return;
            case 6: Application.Quit(); break;
            case 7: Close(); return;
        }
        PlayerPrefs.Save();
        Apply();
        Refresh();
    }

    static float Step(float v) { v = Mathf.Round(v * 5f) / 5f + 0.2f; return v > 1.01f ? 0f : Mathf.Clamp01(v); }

    void Refresh()
    {
        string[] t =
        {
            "Music: " + Mathf.RoundToInt(GameSettings.MusicVolume * 100f) + "%",
            "Sound effects: " + Mathf.RoundToInt(GameSettings.SfxVolume * 100f) + "%",
            "Show FPS: " + (GameSettings.ShowFps ? "On" : "Off"),
            "Render distance: " + render3[GameSettings.RenderLevel],
            "Look sensitivity: " + levels3[GameSettings.SensitivityLevel],
            logoutArmed ? "Press A again to log out" : "Log out",
            "Exit app",
            "Close"
        };
        for (int i = 0; i < rows.Length && i < t.Length; i++)
        {
            rows[i].text = t[i];
            rows[i].color = i == sel ? selectedColor : normalColor;
        }
    }

    void Apply()
    {
        foreach (var s in musicSources) if (s != null) s.volume = GameSettings.MusicVolume;
        foreach (var s in sfxSources) if (s != null) s.volume = GameSettings.SfxVolume;
        if (Camera.main != null) Camera.main.farClipPlane = GameSettings.FarClip;
        if (fpsText != null) { fpsText.gameObject.SetActive(GameSettings.ShowFps); }
    }

    void LogOut()
    {
        open = false; closedFrame = Time.frameCount;
        Firebase.Auth.FirebaseAuth.DefaultInstance.SignOut();
        StudentSession.Clear();
        MapGuide.ResetAll();

        if (QuizManager.Instance != null) Destroy(QuizManager.Instance.gameObject);
        if (EventSystem.current != null && EventSystem.current.gameObject.scene.name == "DontDestroyOnLoad")
            Destroy(EventSystem.current.gameObject);
        var player = FindObjectOfType<VRPlayerController>();
        if (player != null) Destroy(player.gameObject);

        SceneManager.LoadScene(loginSceneName);
    }
}
