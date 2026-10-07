using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

public class VRInputModule : PointerInputModule
{
    public Camera vrCamera;
    public Image reticleImage;
    public GameObject reticleLabel;
    public TMP_Text reticleLabelText;

    public Color normalColor = Color.white;
    public Color interactableColor = new Color(0.2f, 1f, 0.3f);
    public Color lockedColor = new Color(1f, 0.55f, 0f);
    public Color npcColor = new Color(0.3f, 0.7f, 1f);

    [Header("Gaze range (metres)")]
    public float maxInteractDistance = 12f;   // NPCs, doors and other world objects
    public float maxMapCardDistance = 8f;     // world-space UI such as the map cards

    [Header("PC / Editor Buttons")]
    public KeyCode pcClickButton = KeyCode.Joystick1Button3;
    public KeyCode pcInteractButton = KeyCode.Joystick1Button2;

    [Header("Android Buttons")]
    public KeyCode androidClickButton = KeyCode.Joystick1Button3;
    public KeyCode androidInteractButton = KeyCode.Joystick1Button1;

    private KeyCode clickButton;
    private KeyCode interactButton;

    private PointerEventData pointerData;
    private GameObject lastHoveredObject;

    void Awake()
    {
#if UNITY_ANDROID && !UNITY_EDITOR
        clickButton = androidClickButton;
        interactButton = androidInteractButton;
#else
        clickButton = pcClickButton;
        interactButton = pcInteractButton;
#endif
    }

    public override void Process()
    {
        if (vrCamera == null) return;

        bool dialogueOpen = DialogueUI.Instance != null && DialogueUI.Instance.IsOpen();
        bool choicesShowing = DialogueUI.Instance != null && DialogueUI.Instance.AreChoicesShowing();
        bool scoreShowing = QuizManager.Instance != null && QuizManager.Instance.IsShowingScore();

        // Hide the reticle while the score or a popup is up
        bool popupOpen = MessagePopup.Instance != null && MessagePopup.Instance.IsOpen;
        if (reticleImage != null) reticleImage.enabled = !(scoreShowing || popupOpen);

        if (scoreShowing)
        {
            HideLabel();
            if (Input.GetKeyDown(interactButton)) QuizManager.Instance.BackToMapSelection();
            return;
        }

        if (popupOpen)
        {
            HideLabel();
            if (Input.GetKeyDown(interactButton)) MessagePopup.Instance.Advance();
            return;
        }

        if (dialogueOpen && !choicesShowing)
        {
            if (Input.GetKeyDown(interactButton))
            {
                DialogueUI.Instance.NextLine();
            }
            SetReticleColor(normalColor);
            HideLabel();
            return;
        }

        if (choicesShowing)
        {
            SetReticleColor(interactableColor);
            ShowLabel("X: Next  |  A: Select", interactableColor);

            if (Input.GetKeyDown(clickButton))
            {
                DialogueUI.Instance.CycleSelection();
            }
            if (Input.GetKeyDown(interactButton))
            {
                DialogueUI.Instance.ConfirmSelection();
            }
            return;
        }

        if (pointerData == null)
            pointerData = new PointerEventData(eventSystem);

        pointerData.Reset();
        pointerData.position = new Vector2(vrCamera.pixelWidth / 2f, vrCamera.pixelHeight / 2f);

        eventSystem.RaycastAll(pointerData, m_RaycastResultCache);

        // Ignore anything farther than the gaze range (UI cards use their own, shorter range)
        m_RaycastResultCache.RemoveAll(r =>
            r.distance > (r.module is GraphicRaycaster ? maxMapCardDistance : maxInteractDistance));

        pointerData.pointerCurrentRaycast = FindFirstRaycast(m_RaycastResultCache);
        m_RaycastResultCache.Clear();

        GameObject hitObject = pointerData.pointerCurrentRaycast.gameObject;
        HandlePointerExitAndEnter(pointerData, hitObject);

        UpdateReticleVisual(hitObject);

        NPCInteractable npc = hitObject != null ? hitObject.GetComponentInParent<NPCInteractable>() : null;
        if (npc != null && Input.GetKeyDown(interactButton))
        {
            if (!npc.IsUnlocked()) return;
            npc.Interact();
            return;
        }

        SceneDoor door = hitObject != null ? hitObject.GetComponentInParent<SceneDoor>() : null;
        if (door != null && Input.GetKeyDown(interactButton))
        {
            door.Enter();
            return;
        }

        if (hitObject != null && Input.GetKeyDown(clickButton))
        {
            LevelLock lockInfo = hitObject.GetComponentInParent<LevelLock>();
            if (lockInfo != null && !lockInfo.IsUnlocked())
            {
                AudioManager.Instance?.PlayLocked();
                return;
            }

            if (lockInfo != null)
            {
                AudioManager.Instance?.PlayMapSelect();   // a map card
            }
            else
            {
                AudioManager.Instance?.PlayClick();       // generic UI button
            }

            pointerData.pointerPressRaycast = pointerData.pointerCurrentRaycast;
            ExecuteEvents.ExecuteHierarchy(hitObject, pointerData, ExecuteEvents.pointerClickHandler);
        }
    }

    void UpdateReticleVisual(GameObject hitObject)
    {
        if (hitObject != lastHoveredObject)
        {
            lastHoveredObject = hitObject;
            if (hitObject != null)
            {
                AudioManager.Instance?.PlayHover();
            }
        }

        if (hitObject == null)
        {
            SetReticleColor(normalColor);
            HideLabel();
            return;
        }

        LevelLock lockInfo = hitObject.GetComponentInParent<LevelLock>();
        NPCInteractable npc = hitObject.GetComponentInParent<NPCInteractable>();

        if (lockInfo != null && !lockInfo.IsUnlocked())
        {
            SetReticleColor(lockedColor);
            ShowLabel("Still locked, travel to first map first", lockedColor);
            return;
        }

        if (npc != null && !npc.IsUnlocked())
        {
            SetReticleColor(lockedColor);
            ShowLabel("Talk to the Tour Guide first", lockedColor);
            return;
        }

        if (npc != null)
        {
            SetReticleColor(interactableColor);
            ShowLabel("Talk", interactableColor);
            return;
        }

        SceneDoor door = hitObject.GetComponentInParent<SceneDoor>();
        if (door != null)
        {
            if (!door.IsUnlocked())
            {
                SetReticleColor(lockedColor);
                ShowLabel("Finish the tour first", lockedColor);
            }
            else
            {
                SetReticleColor(interactableColor);
                ShowLabel("Enter", interactableColor);
            }
            return;
        }

        Button btn = hitObject.GetComponentInParent<Button>();
        if (btn != null)
        {
            SetReticleColor(interactableColor);
            ShowLabel("Travel Here", interactableColor);
        }
        else
        {
            SetReticleColor(normalColor);
            HideLabel();
        }
    }

    void SetReticleColor(Color c)
    {
        if (reticleImage != null) reticleImage.color = c;
    }

    void ShowLabel(string text, Color c)
    {
        if (reticleLabel != null) reticleLabel.SetActive(true);
        if (reticleLabelText != null)
        {
            reticleLabelText.text = text;
            reticleLabelText.color = c;
        }
    }

    void HideLabel()
    {
        if (reticleLabel != null) reticleLabel.SetActive(false);
    }
}
