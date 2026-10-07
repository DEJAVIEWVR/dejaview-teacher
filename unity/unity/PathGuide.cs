using UnityEngine;

// A glowing line on the ground that leads the player to the next place (for example the Grotto gate).
// 1) Put this on an empty object. 2) Drag empty "point" objects along the route into Points (last one = the gate).
// 3) Call Show() when the guide should appear (TouristSequenceManager can do it after the last question).
public class PathGuide : MonoBehaviour
{
    public Transform[] points;
    public float lineWidth = 0.6f;
    public float heightAboveGround = 0.15f;
    public Color color = new Color(1f, 0.85f, 0.2f, 1f);
    public float pulseSpeed = 3f;
    [Tooltip("Optional: an unlit material. Leave empty to use a plain glowing line.")]
    public Material lineMaterial;
    public bool startHidden = true;

    LineRenderer lr;

    void Awake()
    {
        lr = gameObject.GetComponent<LineRenderer>();
        if (lr == null) lr = gameObject.AddComponent<LineRenderer>();
        lr.useWorldSpace = true;
        lr.alignment = LineAlignment.TransformZ;            // lay the line flat on the ground
        transform.rotation = Quaternion.Euler(-90f, 0f, 0f);
        lr.widthMultiplier = lineWidth;
        lr.numCornerVertices = 4;
        lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        lr.receiveShadows = false;
        lr.material = lineMaterial != null ? lineMaterial : new Material(Shader.Find("Sprites/Default"));
        lr.enabled = !startHidden;
        if (!startHidden) Build();
    }

    public void Show() { Build(); lr.enabled = true; }
    public void Hide() { lr.enabled = false; }

    void Build()
    {
        if (points == null || points.Length < 2) { Debug.LogWarning("PathGuide: add at least 2 points."); return; }
        lr.positionCount = points.Length;
        for (int i = 0; i < points.Length; i++)
        {
            Vector3 p = points[i].position;
            RaycastHit hit;
            if (Physics.Raycast(p + Vector3.up * 30f, Vector3.down, out hit, 80f)) p.y = hit.point.y;   // follow the terrain
            lr.SetPosition(i, p + Vector3.up * heightAboveGround);
        }
    }

    void Update()
    {
        if (!lr.enabled) return;
        float a = 0.55f + 0.45f * Mathf.Sin(Time.time * pulseSpeed);
        Color c = new Color(color.r, color.g, color.b, a);
        lr.startColor = c;
        lr.endColor = c;
    }
}
