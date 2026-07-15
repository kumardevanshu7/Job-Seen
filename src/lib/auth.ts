import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  query,
  collection,
  where,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "./firebase";

const SUPER_ADMIN_UID = import.meta.env.PUBLIC_SUPER_ADMIN_UID;

export function isAdmin(uid: string): boolean {
  return uid === SUPER_ADMIN_UID;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export function onAuthChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/** Returns user profile from Firestore, or null if not found */
export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/** Check if a username is already taken */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const q = query(
    collection(db, "users"),
    where("username", "==", username.toLowerCase())
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/** Create or update user profile in Firestore */
export async function upsertUserProfile(
  uid: string,
  data: {
    displayName: string;
    username: string;
    email: string;
    photoURL?: string;
  }
) {
  const existing = await getUserProfile(uid);
  const now = serverTimestamp();

  if (!existing) {
    // New user
    await setDoc(doc(db, "users", uid), {
      ...data,
      username: data.username.toLowerCase(),
      createdAt: now,
      lastUsernameChange: now,
    });
  } else {
    // Update only display name / photo (username immutable after set)
    await setDoc(
      doc(db, "users", uid),
      {
        displayName: data.displayName,
        photoURL: data.photoURL ?? existing.photoURL,
        email: data.email,
      },
      { merge: true }
    );
  }
}
