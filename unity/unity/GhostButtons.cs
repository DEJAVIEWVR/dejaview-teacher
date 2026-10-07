using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

// Shows a "ghost" badge on screen while a controller button is held, then fades it out.
// Put this on the ReticleCanvas (the head-locked canvas). The badges are built at runtime.
public class GhostButtons : MonoBehaviour
{
    [System.Serializable]
    public class Mapping { public int button; public string label; }

    [Header("Names for your controller buttons (Joystick1Button<number>)")]
    public List<Mapping> mappings = new List<Mapping> { new Mapping { button = 3, label = "X" } };
    [Tooltip("Show the raw button number for buttons you have not named. Press each button once to find its number.")]
    public bool showNumberIfUnnamed = true;

    [Header("Look")]
    public float badgeSize = 110f;
    public float bottomOffset = 120f;
    public float spacing = 16f;
    public float fadeSeconds = 0.35f;
    public int fontSize = 56;
    public Color badgeColor = new Color(0.1f, 0.15f, 0.3f, 0.85f);
    public Color textColor = Color.white;
    public Sprite badgeSprite;      // optional rounded sprite
    public Material uiMaterial;     // AlwaysOnTopMap
    public Material textMaterial;   // LiberationSans SDF - Overlay (optional)

    class Badge { public GameObject go; public CanvasGroup group; public RectTransform rt; public float alpha; public float pop; public bool held; }

    readonly Dictionary<int, Badge> badges = new Dictionary<int, Badge>();
    RectTransform row;

    void Awake()
    {
        var go = new GameObject("GhostRow", typeof(RectTransform));
        row = go.GetComponent<RectTransform>();
        row.SetParent(transform, false);
        row.anchorMin = new Vector2(0.5f, 0f);
        row.anchorMax = new Vector2(0.5f, 0f);
        row.pivot = new Vector2(0.5f, 0f);
        row.anchoredPosition = new Vector2(0f, bottomOffset);
        row.localScale = Vector3.one;

        var h = go.AddComponent<HorizontalLayoutGroup>();
        h.spacing = spacing;
        h.childAlignment = TextAnchor.MiddleCenter;
        h.childControlWidth = true; h.childControlHeight = true;
        h.childForceExpandWidth = false; h.childForceExpandHeight = false;
        var fit = go.AddComponent<ContentSizeFitter>();
        fit.horizontalFit = ContentSizeFitter.FitMode.PreferredSize;
        fit.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
        row.SetAsLastSibling();   // drawn on top of the other canvas items
    }

    void Update()
    {
        for (int i = 0; i < 20; i++)
        {
            KeyCode k = (KeyCode)((int)KeyCode.Joystick1Button0 + i);
            if (Input.GetKeyDown(k)) Press(i);
            if (Input.GetKeyUp(k) && badges.ContainsKey(i)) badges[i].held = false;
        }

        foreach (var b in badges.Values)
        {
            if (b.held) b.alpha = 1f;
            else b.alpha = Mathf.MoveTowards(b.alpha, 0f, Time.unscaledDeltaTime / Mathf.Max(0.01f, fadeSeconds));
            b.pop = Mathf.MoveTowards(b.pop, 0f, Time.unscaledDeltaTime * 5f);
            b.group.alpha = b.alpha;
            b.rt.localScale = Vector3.one * (1f + 0.25f * b.pop);
            bool show = b.alpha > 0.01f;
            if (b.go.activeSelf != show) b.go.SetActive(show);
        }
    }

    void Press(int index)
    {
        Badge b;
        if (!badges.TryGetValue(index, out b))
        {
            string label = LabelFor(index);
            if (label == null) return;
            b = Create(label);
            badges[index] = b;
        }
        b.held = true; b.alpha = 1f; b.pop = 1f;
        b.go.SetActive(true);
    }

    string LabelFor(int index)
    {
        foreach (var m in mappings) if (m.button == index) return m.label;
        return showNumberIfUnnamed ? "#" + index : null;
    }

    Badge Create(string label)
    {
        var go = new GameObject("Ghost_" + label, typeof(RectTransform));
        var rt = go.GetComponent<RectTransform>();
        rt.SetParent(row, false);
        rt.sizeDelta = new Vector2(badgeSize, badgeSize);

        var img = go.AddComponent<Image>();
        img.color = badgeColor;
        img.raycastTarget = false;      // must not block the gaze raycast
        if (badgeSprite != null) { img.sprite = badgeSprite; img.type = Image.Type.Sliced; }
        if (uiMaterial != null) img.material = uiMaterial;

        var le = go.AddComponent<LayoutElement>();
        le.preferredWidth = badgeSize; le.preferredHeight = badgeSize;

        var cg = go.AddComponent<CanvasGroup>();
        cg.blocksRaycasts = false; cg.interactable = false;

        var tgo = new GameObject("Label", typeof(RectTransform));
        var trt = tgo.GetComponent<RectTransform>();
        trt.SetParent(rt, false);
        trt.anchorMin = Vector2.zero; trt.anchorMax = Vector2.one;
        trt.offsetMin = Vector2.zero; trt.offsetMax = Vector2.zero;
        var t = tgo.AddComponent<TextMeshProUGUI>();
        t.text = label; t.fontSize = fontSize; t.fontStyle = FontStyles.Bold;
        t.alignment = TextAlignmentOptions.Center; t.color = textColor;
        t.raycastTarget = false;
        if (textMaterial != null) t.fontSharedMaterial = textMaterial;

        return new Badge { go = go, group = cg, rt = rt };
    }
}
