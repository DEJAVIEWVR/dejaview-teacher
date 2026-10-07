using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Video;

// A video screen in the VR view. Put on an object under ReticleCanvas (keep this object active).
public class VideoPopup : MonoBehaviour
{
    public static VideoPopup Instance;

    public GameObject panel;        // the whole video panel (starts hidden)
    public RawImage screen;         // RawImage that shows the video
    public TMP_Text hintText;       // "Press A to skip"
    [Tooltip("Optional: the background music source to lower while the video plays")]
    public AudioSource musicToDuck;

    VideoPlayer vp;
    RenderTexture rt;
    Action onClose;
    float savedMusicVolume = 1f;
    public bool IsOpen { get; private set; }

    void Awake()
    {
        if (Instance != null && Instance != this) return;
        Instance = this;

        vp = gameObject.AddComponent<VideoPlayer>();
        vp.playOnAwake = false;
        vp.isLooping = false;
        vp.renderMode = VideoRenderMode.RenderTexture;
        vp.audioOutputMode = VideoAudioOutputMode.Direct;
        vp.loopPointReached += _ => Close();
        vp.errorReceived += (p, msg) => { Debug.LogError("Video error: " + msg); Close(); };

        rt = new RenderTexture(1280, 720, 0);
        vp.targetTexture = rt;
        if (screen != null) screen.texture = rt;
        if (panel != null) panel.SetActive(false);
    }

    public void Play(VideoClip clip, Action closed = null)
    {
        if (clip == null) { if (closed != null) closed(); return; }

        onClose = closed;
        IsOpen = true;
        if (panel != null) panel.SetActive(true);
        if (hintText != null) hintText.text = "Press A to skip";

        if (musicToDuck != null) { savedMusicVolume = musicToDuck.volume; musicToDuck.volume = 0f; }

        vp.clip = clip;
        vp.Play();
    }

    public void Close()
    {
        if (!IsOpen) return;
        IsOpen = false;
        vp.Stop();
        if (panel != null) panel.SetActive(false);
        if (musicToDuck != null) musicToDuck.volume = savedMusicVolume;

        var cb = onClose; onClose = null;
        if (cb != null) cb();
    }
}
