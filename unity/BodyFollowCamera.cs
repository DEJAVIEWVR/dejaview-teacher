using UnityEngine;

// Put this on the body model (for example "female02"). The body turns to face where the head camera looks.
public class BodyFollowCamera : MonoBehaviour
{
    [Tooltip("Drag the Main Camera here (leave empty to use Camera.main)")]
    public Transform head;
    public float turnSpeed = 360f;   // degrees per second

    void LateUpdate()
    {
        if (head == null)
        {
            if (Camera.main == null) return;
            head = Camera.main.transform;
        }
        Quaternion target = Quaternion.Euler(0f, head.eulerAngles.y, 0f);
        transform.rotation = Quaternion.RotateTowards(transform.rotation, target, turnSpeed * Time.deltaTime);
    }
}
