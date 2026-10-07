using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

// A "ghost" gamepad in the VR view: PS4-style face buttons, two sticks and two shoulder buttons.
// Each part lights up while you press it. The whole thing fades away when you stop touching the controller.
// Put this on the ReticleCanvas (head-locked). Everything is built at runtime, no images needed.
public class GhostController : MonoBehaviour
{
    public enum Side { Left, Right }

    [System.Serializable]
    public class Btn
    {
        public Side side = Side.Right;
        [Tooltip("Text inside the circle. Leave empty to show the button number.")]
        public string label = "";
        [Tooltip("Joystick1Button<number>")]
        public int button = 0;
        public Vector2 pos;
        public Vector2 size = new Vector2(64f, 64f);
        [HideInInspector] public Image img;
        [HideInInspector] public float pop;
    }

    [System.Serializable]
    public class Stick
    {
        public Side side = Side.Left;
        public string horizontalAxis = "L3Horizontal";
        public string verticalAxis = "L3Vertical";
        public Vector2 pos;
        public bool invertY = true;
        [HideInInspector] public RectTransform knob;
    }

    [Header("Face buttons (right group: top, left, right, bottom)")]
    public List<Btn> faceButtons = new List<Btn>
    {
        new Btn { side = Side.Right, label = "X", button = 3, pos = new Vector2(0f, 122f) },    // top
        new Btn { side = Side.Right, label = "",  button = 0, pos = new Vector2(-62f, 60f) },   // left
        new Btn { side = Side.Right, label = "",  button = 2, pos = new Vector2(62f, 60f) },    // right
        new Btn { side = Side.Right, label = "A", button = 1, pos = new Vector2(0f, -2f) }      // bottom
    };

    [Header("Shoulder buttons")]
    public List<Btn> shoulderButtons = new List<Btn>
    {
        new Btn { side = Side.Left,  label = "L1", button = 4, pos = new Vector2(0f, 200f), size = new Vector2(130f, 34f) },
        new Btn { side = Side.Right, label = "R1", button = 5, pos = new Vector2(0f, 200f), size = new Vector2(130f, 34f) }
    };

    [Header("Sticks")]
    public List<Stick> sticks = new List<Stick>
    {
        new Stick { side = Side.Left,  horizontalAxis = "L3Horizontal", verticalAxis = "L3Vertical", pos = new Vector2(0f, 60f) },
        new Stick { side = Side.Right, horizontalAxis = "R3Horizontal", verticalAxis = "R3Vertical", pos = new Vector2(0f, -120f) }
    };
    public float stickRingSize = 92f;
    public float stickKnobSize = 38f;
    public float stickTravel = 22f;

    [Header("Look")]
    [Tooltip("How far from the centre of the view each group sits (left group at -X, right group at +X). Lower it if the edges are cut off in the headset.")]
    public float sideOffsetX = 760f;
    [Tooltip("Height of both groups. Negative = lower than the centre.")]
    public float offsetY = -120f;
    [Tooltip("Size of everything. 2.2 = big, 1.5 = medium.")]
    public float scale = 2.2f;
    public Color idleColor = new Color(1f, 1f, 1f, 0.28f);
    public Color pressedColor = new Color(1f, 0.85f, 0.25f, 1f);
    public Color textColor = Color.white;
    public int fontSize = 30;
    public Material uiMaterial;      // AlwaysOnTopMap
    public Material textMaterial;    // LiberationSans SDF - Overlay (optional)

    [Header("Fade away when idle")]
    public bool autoHide = true;
    public float hideSeconds = 3f;

    [Header("Setup helper")]
    [Tooltip("Shows 'Button N' above the ghost for every press. Use it to find your controller's button numbers.")]
    public bool showLastPressed = true;

    RectTransform root, leftGroup, rightGroup;
    CanvasGroup group;
    TextMeshProUGUI lastLabel;
    float lastInput;
    float lastLabelTime = -10f;

    void Awake()
    {
        Sprite circle = MakeCircle(false);
        Sprite ring = MakeCircle(true);

        var rootGo = new GameObject("GhostController", typeof(RectTransform), typeof(CanvasGroup));
        root = rootGo.GetComponent<RectTransform>();
        root.SetParent(transform, false);
        root.anchorMin = root.anchorMax = root.pivot = new Vector2(0.5f, 0.5f);
        root.anchoredPosition = Vector2.zero;
        root.sizeDelta = Vector2.zero;
        root.localScale = Vector3.one;
        group = rootGo.GetComponent<CanvasGroup>();
        group.blocksRaycasts = false;
        group.interactable = false;

        leftGroup = MakeGroup("LeftGroup", new Vector2(-sideOffsetX, offsetY));
        rightGroup = MakeGroup("RightGroup", new Vector2(sideOffsetX, offsetY));

        foreach (var b in faceButtons) b.img = MakeImage(Group(b.side), circle, b.pos, b.size, idleColor, Text(b), "Face_" + b.button);
        foreach (var b in shoulderButtons) b.img = MakeImage(Group(b.side), null, b.pos, b.size, idleColor, Text(b), "Shoulder_" + b.button);

        foreach (var st in sticks)
        {
            MakeImage(Group(st.side), ring, st.pos, new Vector2(stickRingSize, stickRingSize), idleColor, null, "StickRing");
            var knob = MakeImage(Group(st.side), circle, st.pos, new Vector2(stickKnobSize, stickKnobSize), pressedColor, null, "StickKnob");
            st.knob = knob.rectTransform;
        }

        if (showLastPressed)
        {
            lastLabel = MakeLabel(root, "", fontSize * 2);
            lastLabel.rectTransform.anchorMin = lastLabel.rectTransform.anchorMax = new Vector2(0.5f, 0.5f);
            lastLabel.rectTransform.anchoredPosition = new Vector2(0f, -420f);
            lastLabel.rectTransform.sizeDelta = new Vector2(900f, 100f);
        }

        lastInput = Time.unscaledTime + 1f;   // visible for a few seconds at the start
        group.alpha = 1f;
        root.SetAsLastSibling();
    }

    RectTransform Group(Side side) { return side == Side.Left ? leftGroup : rightGroup; }

    RectTransform MakeGroup(string name, Vector2 pos)
    {
        var go = new GameObject(name, typeof(RectTransform));
        var rt = go.GetComponent<RectTransform>();
        rt.SetParent(root, false);
        rt.anchorMin = rt.anchorMax = rt.pivot = new Vector2(0.5f, 0.5f);
        rt.anchoredPosition = pos;
        rt.sizeDelta = Vector2.zero;
        rt.localScale = Vector3.one * scale;
        return rt;
    }

    string Text(Btn b) { return string.IsNullOrEmpty(b.label) ? "#" + b.button : b.label; }

    void Update()
    {
        float dt = Time.unscaledDeltaTime;
        bool active = Input.anyKeyDown;

        for (int i = 0; i < 20; i++)
        {
            if (Input.GetKeyDown((KeyCode)((int)KeyCode.Joystick1Button0 + i)))
            {
                active = true;
                if (lastLabel != null) { lastLabel.text = "Button " + i; lastLabelTime = Time.unscaledTime; }
            }
        }

        foreach (var b in faceButtons) Light(b, dt);
        foreach (var b in shoulderButtons) Light(b, dt);
        foreach (var s in sticks) if (MoveStick(s)) active = true;

        if (active) lastInput = Time.unscaledTime;

        float target = (!autoHide || Time.unscaledTime - lastInput < hideSeconds) ? 1f : 0f;
        group.alpha = Mathf.MoveTowards(group.alpha, target, dt * 3f);

        if (lastLabel != null && Time.unscaledTime - lastLabelTime > 1.5f) lastLabel.text = "";
    }

    void Light(Btn b, float dt)
    {
        if (b.img == null) return;
        KeyCode key = (KeyCode)((int)KeyCode.Joystick1Button0 + b.button);
        bool down = Input.GetKey(key);
        if (Input.GetKeyDown(key)) b.pop = 1f;
        b.pop = Mathf.MoveTowards(b.pop, 0f, dt * 4f);

        float k = 1f - Mathf.Exp(-14f * dt);
        b.img.color = Color.Lerp(b.img.color, down ? pressedColor : idleColor, k);
        float s = down ? 1.25f : 1f + 0.2f * b.pop;
        b.img.rectTransform.localScale = Vector3.Lerp(b.img.rectTransform.localScale, Vector3.one * s, k);
    }

    bool MoveStick(Stick s)
    {
        if (s.knob == null) return false;
        float x = 0f, y = 0f;
        try { x = Input.GetAxis(s.horizontalAxis); y = Input.GetAxis(s.verticalAxis); } catch { }   // axis not set up: ignore
        if (s.invertY) y = -y;
        Vector2 p = new Vector2(x, y);
        if (p.magnitude > 1f) p.Normalize();
        s.knob.anchoredPosition = s.pos + p * stickTravel;
        return p.magnitude > 0.3f;
    }

    // ---------- runtime UI builders ----------
    Image MakeImage(Transform parent, Sprite sprite, Vector2 pos, Vector2 size, Color color, string label, string name)
    {
        var go = new GameObject(name, typeof(RectTransform));
        var rt = go.GetComponent<RectTransform>();
        rt.SetParent(parent, false);
        rt.anchorMin = rt.anchorMax = rt.pivot = new Vector2(0.5f, 0.5f);
        rt.anchoredPosition = pos;
        rt.sizeDelta = size;

        var img = go.AddComponent<Image>();
        img.sprite = sprite;
        img.color = color;
        img.raycastTarget = false;         // must never block the gaze raycast
        if (uiMaterial != null) img.material = uiMaterial;

        if (!string.IsNullOrEmpty(label)) MakeLabel(rt, label, fontSize);
        return img;
    }

    TextMeshProUGUI MakeLabel(Transform parent, string text, int size)
    {
        var go = new GameObject("Label", typeof(RectTransform));
        var rt = go.GetComponent<RectTransform>();
        rt.SetParent(parent, false);
        rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
        rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;

        var t = go.AddComponent<TextMeshProUGUI>();
        t.text = text;
        t.fontSize = size;
        t.fontStyle = FontStyles.Bold;
        t.alignment = TextAlignmentOptions.Center;
        t.color = textColor;
        t.raycastTarget = false;
        if (textMaterial != null) t.fontSharedMaterial = textMaterial;
        return t;
    }

    static Sprite MakeCircle(bool ring)
    {
        const int s = 128;
        float r = s / 2f, thick = 10f;
        var tex = new Texture2D(s, s, TextureFormat.RGBA32, false);
        tex.wrapMode = TextureWrapMode.Clamp;
        var px = new Color32[s * s];
        for (int y = 0; y < s; y++)
            for (int x = 0; x < s; x++)
            {
                float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(r, r));
                float a = ring ? Mathf.Clamp01(Mathf.Min(r - d, d - (r - thick))) : Mathf.Clamp01(r - d);
                px[y * s + x] = new Color32(255, 255, 255, (byte)(a * 255f));
            }
        tex.SetPixels32(px);
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, s, s), new Vector2(0.5f, 0.5f), 100f);
    }
}
