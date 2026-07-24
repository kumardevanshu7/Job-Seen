import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey:            import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain:        import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

// Prevent duplicate app initialization on hot-reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// App Check reduces scripted abuse. Enforcement must be enabled in Firebase Console after monitoring.
const appCheckSiteKey = import.meta.env.PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
const appCheckFlag = "__jobseenAppCheckInitialized";
if (typeof window !== "undefined" && appCheckSiteKey && !(window as any)[appCheckFlag]) {
  (window as any)[appCheckFlag] = true;
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db   = getFirestore(app);

export default app;
