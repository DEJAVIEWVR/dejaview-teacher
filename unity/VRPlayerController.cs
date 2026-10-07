using UnityEngine;

[RequireComponent(typeof(CharacterController))]
public class VRPlayerController : MonoBehaviour
{
    [Header("References")]
    public Transform cameraTransform;

    [Header("Movement")]
    public float moveSpeed = 2.5f;       // walking speed (your old value is kept)
    public float runSpeed = 4.5f;        // speed while the run button is HELD
    public float acceleration = 8f;      // how fast the speed changes (higher = snappier)

    [Header("Run button (hold it while pushing the left stick)")]
    public KeyCode androidRunButton = KeyCode.Joystick1Button5;   // right shoulder (R1 / RB) on most controllers
    public KeyCode pcRunButton = KeyCode.Joystick1Button5;

    [Header("Looking")]
    public float lookHorizontalSpeed = 90f;
    public float lookVerticalSpeed = 90f;
    public float maxLookAngle = 80f;

    [Header("Gravity")]
    public float gravity = -9.81f;

    [Header("Jump (X Button = Joystick1Button3)")]
    public float jumpHeight = 1.2f;
    public KeyCode jumpButton = KeyCode.Joystick1Button3;

    [Header("Dead Zone")]
    [Range(0f, 0.3f)]
    public float deadZone = 0.15f;

    private CharacterController controller;
    private float verticalVelocity;
    private float cameraPitch;
    private float currentSpeed;
    private KeyCode runButton;

    void Start()
    {
        controller = GetComponent<CharacterController>();
        currentSpeed = moveSpeed;

#if UNITY_ANDROID && !UNITY_EDITOR
        runButton = androidRunButton;
#else
        runButton = pcRunButton;
#endif

        if (cameraTransform == null)
        {
            Debug.LogError("Camera Transform is not assigned!");
        }
    }

    void Update()
    {
        HandleMovement();
        HandleLook();
    }

    // True while any dialogue / score / popup is on screen
    bool IsUIBusy()
    {
        if (DialogueUI.Instance != null && DialogueUI.Instance.IsOpen()) return true;
        if (QuizManager.Instance != null && QuizManager.Instance.IsShowingScore()) return true;
        if (MessagePopup.Instance != null && MessagePopup.Instance.IsOpen) return true;
        return false;
    }

    void HandleMovement()
    {
        bool uiBusy = IsUIBusy();

        float x = Input.GetAxis("L3Horizontal");
        float y = Input.GetAxis("L3Vertical");

        x = ApplyDeadZone(x);
        y = ApplyDeadZone(y);

        y = -y; // fix L3 Y inversion

        // Don't drift while reading or answering
        if (uiBusy) { x = 0f; y = 0f; }

        // Walk in the direction the HEAD is looking (the phone turns the camera, not the body)
        Transform head = Camera.main != null ? Camera.main.transform : transform;
        Vector3 forward = head.forward;
        Vector3 right = head.right;

        forward.y = 0f;
        right.y = 0f;

        if (forward.sqrMagnitude < 0.0001f)   // looking straight up or down
        {
            forward = transform.forward;
            forward.y = 0f;
        }

        forward.Normalize();
        right.Normalize();

        // Hold the run button to go faster; speed eases in and out
        bool wantsRun = !uiBusy && Input.GetKey(runButton);
        float targetSpeed = wantsRun ? runSpeed : moveSpeed;
        currentSpeed = Mathf.MoveTowards(currentSpeed, targetSpeed, acceleration * Time.deltaTime);

        Vector3 direction = Vector3.ClampMagnitude(forward * y + right * x, 1f);
        Vector3 movement = direction * currentSpeed;

        if (controller.isGrounded)
        {
            verticalVelocity = -0.5f;

            if (!uiBusy && Input.GetKeyDown(jumpButton))
            {
                verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);
            }
        }
        else
        {
            verticalVelocity += gravity * Time.deltaTime;
        }

        movement.y = verticalVelocity;

        controller.Move(movement * Time.deltaTime);
    }

    void HandleLook()
    {
        float r3X = Input.GetAxis("R3Horizontal");
        float r3Y = -Input.GetAxis("R3Vertical");

        transform.Rotate(Vector3.up, r3X * lookHorizontalSpeed * Time.deltaTime);

        if (cameraTransform != null)
        {
            cameraPitch -= r3Y * lookVerticalSpeed * Time.deltaTime;
            cameraPitch = Mathf.Clamp(cameraPitch, -maxLookAngle, maxLookAngle);
            cameraTransform.localRotation = Quaternion.Euler(cameraPitch, 0f, 0f);
        }
    }

    float ApplyDeadZone(float value)
    {
        if (Mathf.Abs(value) < deadZone)
            return 0f;

        return value;
    }
}
