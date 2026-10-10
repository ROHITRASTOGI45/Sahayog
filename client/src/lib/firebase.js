const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function ensureFirebase() {
  if (!window.firebase) throw new Error("Firebase web SDK is not loaded.");
  if (!window.firebase.apps?.length) window.firebase.initializeApp(firebaseConfig);
  return window.firebase;
}

export async function registerForPush() {
  const firebase = ensureFirebase();
  if (!firebase.messaging.isSupported()) throw new Error("This browser does not support Firebase Web Push.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  const registration = await navigator.serviceWorker.ready;
  const messaging = firebase.messaging();
  const token = await messaging.getToken({ vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Firebase did not return an FCM token. Check your VAPID key.");
  return token;
}
