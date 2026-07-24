import {
  GoogleAuthProvider,
  getIdTokenResult,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import type { UserProfile } from "./firestore";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export async function hasAdminClaim(user: User): Promise<boolean> {
  const token = await getIdTokenResult(user);
  return token.claims.admin === true;
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

/** Load the public profile. Legacy user documents are securely migrated on owner login. */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const publicRef = doc(db, "publicProfiles", uid);
  const publicSnap = await getDoc(publicRef);
  if (publicSnap.exists()) return publicSnap.data() as UserProfile;

  return runTransaction(db, async (transaction) => {
    const privateRef = doc(db, "users", uid);
    const legacySnap = await transaction.get(privateRef);
    const existingPublic = await transaction.get(publicRef);
    if (existingPublic.exists()) return existingPublic.data() as UserProfile;
    if (!legacySnap.exists()) return null;

    const legacy = legacySnap.data();
    const username = String(legacy.username ?? "").toLowerCase();
    if (!USERNAME_RE.test(username)) return null;

    const usernameRef = doc(db, "usernames", username);
    const usernameSnap = await transaction.get(usernameRef);
    if (usernameSnap.exists() && usernameSnap.data().uid !== uid) {
      throw new Error("This legacy username conflicts with another account. Contact an administrator.");
    }

    const profile: UserProfile = {
      uid,
      username,
      displayName: String(legacy.displayName ?? "User").slice(0, 80),
      photoURL: typeof legacy.photoURL === "string" ? legacy.photoURL : null,
      createdAt: legacy.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    transaction.set(publicRef, profile);
    if (!usernameSnap.exists()) {
      transaction.set(usernameRef, { uid, createdAt: serverTimestamp() });
    }
    transaction.set(privateRef, {
      email: String(legacy.email ?? auth.currentUser?.email ?? "").slice(0, 320),
      createdAt: legacy.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return profile;
  });
}
/** Direct registry lookup avoids a query race and prevents duplicate usernames. */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  if (!USERNAME_RE.test(normalized)) return true;
  return (await getDoc(doc(db, "usernames", normalized))).exists();
}

/** Atomically creates or updates the private account, public profile, and username registry. */
export async function upsertUserProfile(
  uid: string,
  data: {
    displayName: string;
    username: string;
    email: string;
    photoURL?: string;
  }
): Promise<void> {
  const username = data.username.trim().toLowerCase();
  const displayName = data.displayName.trim();
  if (!USERNAME_RE.test(username)) throw new Error("Invalid username.");
  if (!displayName || displayName.length > 80) throw new Error("Display name must be 1–80 characters.");

  const publicRef = doc(db, "publicProfiles", uid);
  const privateRef = doc(db, "users", uid);
  const usernameRef = doc(db, "usernames", username);

  await runTransaction(db, async (transaction) => {
    const publicSnap = await transaction.get(publicRef);
    const usernameSnap = await transaction.get(usernameRef);

    if (usernameSnap.exists() && usernameSnap.data().uid !== uid) {
      throw new Error("That username is already taken.");
    }
    if (publicSnap.exists() && publicSnap.data().username !== username) {
      throw new Error("Username cannot be changed.");
    }

    const createdAt = publicSnap.exists() ? publicSnap.data().createdAt : serverTimestamp();
    transaction.set(publicRef, {
      uid,
      username,
      displayName,
      photoURL: data.photoURL ?? null,
      createdAt,
      updatedAt: serverTimestamp(),
    });
    if (!usernameSnap.exists()) {
      transaction.set(usernameRef, { uid, createdAt: serverTimestamp() });
    }
    transaction.set(privateRef, {
      email: data.email.slice(0, 320),
      createdAt,
      updatedAt: serverTimestamp(),
    });
  });
}
