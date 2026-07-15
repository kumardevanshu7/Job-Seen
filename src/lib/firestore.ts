import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  email: string;
  photoURL?: string;
  createdAt: any;
}

export type JobStatus = 'pending' | 'applied' | 'in_progress' | 'no_response' | 'rejected' | 'selected';

export interface JobCard {
  id: string;
  ownerUID: string;
  ownerUsername: string;
  company: string;
  location: string;
  role: string;
  ctc: string;
  applyLink: string;
  appliedVia: string;
  appliedViaOther?: string;
  batch: string[];
  bond: string;
  lastDate: any;
  copiedFromUID?: string;
  copiedFromUsername?: string;
  createdAt: any;
  // Application tracking
  status?: JobStatus;
  appliedAt?: any;       // when user clicked "Applied"
  reminderDismissedAt?: any; // when user dismissed the 3-day reminder
}

export interface Connection {
  id: string;
  userA: string;
  userB: string;
  connectedAt: any;
}

export interface Notification {
  id: string;
  receiverUID: string;
  senderUID: string;
  senderUsername: string;
  senderDisplayName: string;
  type: "connection_request";
  requestId: string;
  status: "unread" | "read";
  createdAt: any;
}

export interface Permission {
  id: string;
  ownerUID: string;
  granteeUID: string;
  canCopy: boolean;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function createJob(
  ownerUID: string,
  ownerUsername: string,
  data: Omit<JobCard, "id" | "ownerUID" | "ownerUsername" | "createdAt">
): Promise<string> {
  const payload: any = {
    ...data,
    ownerUID,
    ownerUsername,
    copiedFromUID: data.copiedFromUID ?? null,
    copiedFromUsername: data.copiedFromUsername ?? null,
    appliedViaOther: data.appliedViaOther ?? "",
    createdAt: serverTimestamp(),
  };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
  const ref = await addDoc(collection(db, "jobs"), payload);
  return ref.id;
}

export function subscribeToUserJobs(
  uid: string,
  callback: (jobs: JobCard[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "jobs"),
    where("ownerUID", "==", uid)
  );
  return onSnapshot(q, (snap) => {
    const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobCard));
    jobs.sort((a, b) => {
      const tA = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
      const tB = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
      return tB - tA;
    });
    callback(jobs);
  });
}

export async function getJobsByUID(uid: string): Promise<JobCard[]> {
  const q = query(
    collection(db, "jobs"),
    where("ownerUID", "==", uid)
  );
  const snap = await getDocs(q);
  const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as JobCard));
  jobs.sort((a, b) => {
    const tA = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
    const tB = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
    return tB - tA;
  });
  return jobs;
}

export async function copyJob(
  sourceJob: JobCard,
  targetUID: string,
  targetUsername: string
): Promise<string> {
  // ── Duplicate check ──────────────────────────────────────────────
  // Check if user already copied this exact job (by original owner + company + role)
  const dupQ = query(
    collection(db, "jobs"),
    where("ownerUID", "==", targetUID),
    where("copiedFromUID", "==", sourceJob.ownerUID),
    limit(10)
  );
  const dupSnap = await getDocs(dupQ);
  const alreadyCopied = dupSnap.docs.some(d => {
    const data = d.data();
    return data.company === sourceJob.company && data.role === sourceJob.role;
  });
  if (alreadyCopied) {
    throw new Error("DUPLICATE");
  }
  // ─────────────────────────────────────────────────────────────────
  const { id, ownerUID, ownerUsername, createdAt, status, appliedAt, reminderDismissedAt, ...rest } = sourceJob;
  return createJob(targetUID, targetUsername, {
    ...rest,
    copiedFromUID: sourceJob.ownerUID,
    copiedFromUsername: sourceJob.ownerUsername,
  });
}

export async function deleteJob(jobId: string): Promise<void> {
  await deleteDoc(doc(db, "jobs", jobId));
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  extra?: { appliedAt?: any; reminderDismissedAt?: any }
): Promise<void> {
  const updates: any = { status };
  if (extra?.appliedAt !== undefined) updates.appliedAt = extra.appliedAt;
  if (extra?.reminderDismissedAt !== undefined) updates.reminderDismissedAt = extra.reminderDismissedAt;
  await updateDoc(doc(db, "jobs", jobId), updates);
}


// ─── Chat ──────────────────────────────────────────────────────────────────────


export interface ChatMessage {
  id: string;
  senderUID: string;
  senderUsername: string;
  text: string;
  createdAt: any;
  read: boolean;
}

/** Deterministic chat ID from two UIDs (sorted alphabetically) */
export function getChatId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

export async function sendMessage(
  chatId: string,
  senderUID: string,
  senderUsername: string,
  text: string
): Promise<void> {
  await addDoc(collection(db, "chats", chatId, "messages"), {
    senderUID,
    senderUsername,
    text: text.trim(),
    createdAt: serverTimestamp(),
    read: false,
  });
  // Update chat metadata for "last message" preview
  await setDoc(doc(db, "chats", chatId), {
    updatedAt: serverTimestamp(),
    lastText: text.trim().slice(0, 80),
    lastSenderUID: senderUID,
  }, { merge: true });
}

export function subscribeToMessages(
  chatId: string,
  callback: (msgs: ChatMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc"),
    limit(100)
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
  });
}

export async function markMessagesRead(chatId: string, currentUID: string): Promise<void> {
  // Only query by `read == false` to avoid composite index requirement.
  // Filter out own messages client-side.
  const q = query(
    collection(db, "chats", chatId, "messages"),
    where("read", "==", false),
    limit(50)
  );
  const snap = await getDocs(q);
  const toMark = snap.docs.filter(d => d.data().senderUID !== currentUID);
  await Promise.all(toMark.map(d => updateDoc(d.ref, { read: true })));
}

export function subscribeToUnreadChatCount(
  uid: string,
  connectedUIDs: string[],
  callback: (count: number, countsMap: Record<string, number>) => void
): Unsubscribe[] {
  if (connectedUIDs.length === 0) { callback(0, {}); return []; }
  const counts: Record<string, number> = {};
  const unsubs = connectedUIDs.map(otherUID => {
    const chatId = getChatId(uid, otherUID);
    const q = query(
      collection(db, "chats", chatId, "messages"),
      where("read", "==", false),
      where("senderUID", "==", otherUID),
    );
    return onSnapshot(q, snap => {
      counts[chatId] = snap.size;
      callback(Object.values(counts).reduce((a, b) => a + b, 0), counts);
    });
  });
  return unsubs;
}

// ─── Users ─────────────────────────────────────────────────────────────────────


export async function searchUserByUsername(
  username: string
): Promise<UserProfile | null> {
  const q = query(
    collection(db, "users"),
    where("username", "==", username.toLowerCase()),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, ...d.data() } as UserProfile;
}

export async function getUsersByUIDs(uids: string[]): Promise<UserProfile[]> {
  if (uids.length === 0) return [];
  const profiles: UserProfile[] = [];
  for (const uid of uids) {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      profiles.push({ uid: snap.id, ...snap.data() } as UserProfile);
    }
  }
  return profiles;
}

// ─── Connection Requests ───────────────────────────────────────────────────────

export async function sendConnectionRequest(
  senderUID: string,
  senderUsername: string,
  senderDisplayName: string,
  receiverUID: string
): Promise<void> {
  // Check if already sent or connected
  const existing = await getDocs(
    query(
      collection(db, "friendRequests"),
      where("senderUID", "==", senderUID),
      where("receiverUID", "==", receiverUID)
    )
  );
  if (!existing.empty) return;

  const reqRef = await addDoc(collection(db, "friendRequests"), {
    senderUID,
    senderUsername,
    receiverUID,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  // Create notification for receiver
  await addDoc(collection(db, "notifications"), {
    receiverUID,
    senderUID,
    senderUsername,
    senderDisplayName,
    type: "connection_request",
    requestId: reqRef.id,
    status: "unread",
    createdAt: serverTimestamp(),
  });
}

export async function respondToRequest(
  requestId: string,
  status: "accepted" | "declined",
  senderUID: string,
  receiverUID: string
): Promise<void> {
  await updateDoc(doc(db, "friendRequests", requestId), { status });

  if (status === "accepted") {
    // Create connection document
    await addDoc(collection(db, "connections"), {
      userA: senderUID,
      userB: receiverUID,
      connectedAt: serverTimestamp(),
    });
  }
}

export async function getRequestStatus(
  senderUID: string,
  receiverUID: string
): Promise<"none" | "pending" | "accepted" | "declined"> {
  const q = query(
    collection(db, "friendRequests"),
    where("senderUID", "==", senderUID),
    where("receiverUID", "==", receiverUID),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return "none";
  return snap.docs[0].data().status as any;
}

// ─── Connections ───────────────────────────────────────────────────────────────

export async function getConnections(uid: string): Promise<Connection[]> {
  const qA = query(collection(db, "connections"), where("userA", "==", uid));
  const qB = query(collection(db, "connections"), where("userB", "==", uid));
  const [snapA, snapB] = await Promise.all([getDocs(qA), getDocs(qB)]);
  const all = [...snapA.docs, ...snapB.docs];
  return all.map((d) => ({ id: d.id, ...d.data() } as Connection));
}

export async function getConnectedUIDs(uid: string): Promise<string[]> {
  const conns = await getConnections(uid);
  return conns.map((c) => (c.userA === uid ? c.userB : c.userA));
}

export async function areConnected(
  uidA: string,
  uidB: string
): Promise<boolean> {
  const q1 = query(
    collection(db, "connections"),
    where("userA", "==", uidA),
    where("userB", "==", uidB),
    limit(1)
  );
  const q2 = query(
    collection(db, "connections"),
    where("userA", "==", uidB),
    where("userB", "==", uidA),
    limit(1)
  );
  const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  return !s1.empty || !s2.empty;
}

// ─── Permissions ───────────────────────────────────────────────────────────────

export async function getPermission(
  ownerUID: string,
  granteeUID: string
): Promise<boolean> {
  const q = query(
    collection(db, "permissions"),
    where("ownerUID", "==", ownerUID),
    where("granteeUID", "==", granteeUID),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return false;
  return snap.docs[0].data().canCopy ?? false;
}

export async function setPermission(
  ownerUID: string,
  granteeUID: string,
  canCopy: boolean
): Promise<void> {
  const q = query(
    collection(db, "permissions"),
    where("ownerUID", "==", ownerUID),
    where("granteeUID", "==", granteeUID),
    limit(1)
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    await addDoc(collection(db, "permissions"), {
      ownerUID,
      granteeUID,
      canCopy,
    });
  } else {
    await updateDoc(snap.docs[0].ref, { canCopy });
  }
}

export async function getPermissionsGrantedTo(
  granteeUID: string
): Promise<Permission[]> {
  const q = query(
    collection(db, "permissions"),
    where("granteeUID", "==", granteeUID),
    where("canCopy", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Permission));
}

// ─── Notifications ─────────────────────────────────────────────────────────────

export function subscribeToNotifications(
  uid: string,
  callback: (notifs: Notification[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "notifications"),
    where("receiverUID", "==", uid),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    const notifs = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Notification[];
    notifs.sort((a, b) => {
      const tA = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
      const tB = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
      return tB - tA;
    });
    callback(notifs);
  });
}

export async function markNotificationRead(notifId: string): Promise<void> {
  await updateDoc(doc(db, "notifications", notifId), { status: "read" });
}
