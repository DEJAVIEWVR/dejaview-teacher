using UnityEngine;
using Firebase.Firestore;
using Firebase.Extensions;

public class FirebaseManager : MonoBehaviour
{
    public static FirebaseManager Instance { get; private set; }
    public FirebaseFirestore Db { get; private set; }

    void Awake()
    {
        if (Instance != null) { Destroy(gameObject); return; }
        Instance = this;

        // DontDestroyOnLoad only works on root objects. If this sits under another object, move it to the root first.
        if (transform.parent != null) transform.SetParent(null);
        DontDestroyOnLoad(gameObject);

        Firebase.FirebaseApp.CheckAndFixDependenciesAsync().ContinueWithOnMainThread(task =>
        {
            var status = task.Result;
            if (status == Firebase.DependencyStatus.Available)
            {
                Db = FirebaseFirestore.DefaultInstance;
                Debug.Log("Firebase initialized successfully.");
            }
            else
            {
                Debug.LogError("Could not resolve Firebase dependencies: " + status);
            }
        });
    }
}
