using UnityEngine;
using UnityEngine.UI;

// Shows a "ghost" of the controller in the VR view: a button lights up while you press it,
// and the stick knobs move. Put this on an object under ReticleCanvas (so it is head-locked).
public class ControllerGhostHUD : MonoBehaviour
{
    [System.Serializable]
    public class GhostButton
    {
        public string name = "A";
        public KeyCode key = KeyCode.Joystick1Button0;
        public Image image;                       // the circle for this button
        [HideInInspector] public float lastDown = -10f;
    }

    public GhostButton[] buttons;

    [Header("Look")]
    public Color idleColor = new Color(1f, 1f, 1f, 0.18f);   // set alpha to 0 to hide idle buttons completely
    public Color pressedColor = new Color(1f, 0.85f, 0.25f, 1f);
    public float pressedScale = 1.3f;
    public float holdSeconds = 0.25f;                        // keeps a quick tap visible
    public float fadeSpeed = 12f;

    [Header("Sticks (optional)")]
    public RectTransform leftKnob;
    public RectTransform rightKnob;
    public string leftH = "L3Horizontal", leftV = "L3Vertical";
    public string rightH = "R3Horizontal", rightV = "R3Vertical";
    public float stickRadius = 18f;
    public bool invertLeftY = true;
    public bool invertRightY = true;

    [Header("Setup helper")]
    public bool logPressedKeys = false;   // in the Editor with the controller plugged in: shows each KeyCode in the Console

    void Update()
    {
        float k = 1f - Mathf.Exp(-fadeSpeed * Time.unscaledDeltaTime);

        foreach (var b in buttons)
        {
            if (b == null || b.image == null) continue;
            if (Input.GetKeyDown(b.key)) b.lastDown = Time.unscaledTime;
            bool lit = Input.GetKey(b.key) || (Time.unscaledTime - b.lastDown) < holdSeconds;

            b.image.color = Color.Lerp(b.image.color, lit ? pressedColor : idleColor, k);
            Vector3 target = Vector3.one * (lit ? pressedScale : 1f);
            b.image.rectTransform.localScale = Vector3.Lerp(b.image.rectTransform.localScale, target, k);
        }

        MoveKnob(leftKnob, leftH, leftV, invertLeftY);
        MoveKnob(rightKnob, rightH, rightV, invertRightY);

        if (logPressedKeys)
            foreach (KeyCode code in System.Enum.GetValues(typeof(KeyCode)))
                if (Input.GetKeyDown(code)) Debug.Log("Pressed: " + code);
    }

    void MoveKnob(RectTransform knob, string h, string v, bool invertY)
    {
        if (knob == null) return;
        float x = 0f, y = 0f;
        try { x = Input.GetAxis(h); y = Input.GetAxis(v); } catch { }   // ignore axes that are not set up
        if (invertY) y = -y;
        Vector2 p = new Vector2(x, y);
        if (p.magnitude > 1f) p.Normalize();
        knob.anchoredPosition = Vector2.Lerp(knob.anchoredPosition, p * stickRadius, 0.5f);
    }
}
