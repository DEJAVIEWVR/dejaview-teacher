using System.Collections;
using TMPro;
using UnityEngine;

// Put this on the map scene (any always-active object). Drag in a panel (World Space or Overlay canvas)
// with a TMP text. It shows the "inactive" message when the instructor has not opened any level,
// re-checks every few seconds, and hides itself as soon as the instructor activates the student.
public class InactivePopup : MonoBehaviour
{
    public GameObject panel;
    public TMP_Text messageText;
    public float checkEverySeconds = 10f;

    void OnEnable() { StartCoroutine(Loop()); }

    IEnumerator Loop()
    {
        while (true)
        {
            bool done = false;
            PlayAccess.Refresh(() => done = true);
            while (!done) yield return null;

            bool show = StudentSession.LoggedIn && !StudentSession.HasAccess;
            if (panel != null) panel.SetActive(show);
            if (show && messageText != null) messageText.text = PlayAccess.InactiveMessage;
            yield return new WaitForSeconds(checkEverySeconds);
        }
    }
}
