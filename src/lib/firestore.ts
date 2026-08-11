import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit,
  runTransaction,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { canonicalPairId, requireSafeExternalUrl } from "./security";
import { WALK_IN_ENABLED } from "./features";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  photoURL?: string | null;
  createdAt: any;
  updatedAt?: any;
}

export type JobType = 'online' | 'walkin';

export type EmploymentType = 'full_time' | 'part_time' | 'internship';

export type JobStatus =
  | 'pending'
  | 'applied'
  | 'in_progress'
  | 'no_response'
  | 'rejected'
  | 'selected'
  | 'interview_done'
  | 'fraud'
  | 'cancelled';

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
  statusUpdatedAt?: any; // last time status was changed (for daily reports)
  reminderDismissedAt?: any; // when user dismissed the 3-day reminder
  cancelReason?: string;
  // Online vs Walk-in
  jobType?: JobType;     // default: online for legacy docs
  mapLink?: string;
  nearestMetro?: string;
  routeOrder?: number;   // custom visit order for walk-ins / routed online
  onRoute?: boolean;     // optional: include online job on Walk-in Route
  routeDate?: string;    // which day's route this job belongs to (YYYY-MM-DD)
  // Role kind
  employmentType?: EmploymentType; // full_time | part_time | internship
  internshipMonths?: string;       // e.g. "3"
  ppo?: string;                    // "yes" | "no" | "maybe" | ""
}

export interface BruteForceJob {
  id: string;
  ownerUID: string;
  ownerUsername: string;
  company: string;
  phone: string;
  location: string;
  mapLink: string;
  role: string;
  callOutcome: BruteForceCallOutcome;
  decision: BruteForceDecision;
  successAt: any | null;
  interviewMode: InterviewMode | null;
  interviewAt: any | null;
  interviewRescheduledAt: any | null;
  statusHistory?: BruteForceStatusEntry[];
  /** YYYY-MM-DD — jis din pehle try hua tha (retry cards pe). */
  previousTryDate?: string;
  /** 2 = 2nd try, 3 = 3rd try, … */
  tryNumber?: number;
  /** Source lead id jisse retry banaya. */
  retryFromLeadId?: string;
  createdAt: any;
  updatedAt: any;
}

export interface BruteForceStatusEntry {
  status: string; // callOutcome value or a final decision
  at: number;     // client epoch ms (serverTimestamp not allowed inside arrays)
}

export type BruteForceCallOutcome =
  | "not_called"
  | "no_response"
  | "wrong_number"
  | "incoming_not_allowed"
  | "no_vacancies"
  | "not_connected"
  | "call_busy"
  | "call_later"
  | "switched_off"
  | "site_resume_email"
  | "call_cut_rudely"
  | "resume_sent"
  | "success";

export type InterviewMode = "offline" | "online";
export type BruteForceDecision = "pending" | "selected" | "rejected";

export interface Connection {
  id: string;
  userA: string;
  userB: string;
  connectedAt: any;
  requestId?: string;
  legacyConnectionId?: string;
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

function buildJobPayload(
  ownerUID: string,
  ownerUsername: string,
  data: Omit<JobCard, "id" | "ownerUID" | "ownerUsername" | "createdAt">
) {
  const applyLink = data.applyLink?.trim()
    ? requireSafeExternalUrl(data.applyLink, "Apply link")
    : "";
  const mapLink = data.mapLink?.trim()
    ? requireSafeExternalUrl(data.mapLink, "Map link")
    : "";
  const payload: any = {
    ...data,
    applyLink,
    mapLink,
    ownerUID,
    ownerUsername,
    copiedFromUID: data.copiedFromUID ?? null,
    copiedFromUsername: data.copiedFromUsername ?? null,
    appliedViaOther: data.appliedViaOther ?? "",
    createdAt: serverTimestamp(),
  };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
  return payload;
}

export async function createJob(
  ownerUID: string,
  ownerUsername: string,
  data: Omit<JobCard, "id" | "ownerUID" | "ownerUsername" | "createdAt">
): Promise<string> {
  if (!WALK_IN_ENABLED && (data.jobType === "walkin" || data.onRoute === true)) {
    throw new Error("Walk-in feature is currently disabled.");
  }
  const ref = await addDoc(collection(db, "jobs"), buildJobPayload(ownerUID, ownerUsername, data));
  return ref.id;
}

export async function createJobs(
  ownerUID: string,
  ownerUsername: string,
  rows: Omit<JobCard, "id" | "ownerUID" | "ownerUsername" | "createdAt">[]
): Promise<number> {
  if (rows.length === 0 || rows.length > 100) {
    throw new Error("JSON import must contain between 1 and 100 jobs.");
  }
  if (!WALK_IN_ENABLED && rows.some(row => row.jobType === "walkin" || row.onRoute === true)) {
    throw new Error("Walk-in feature is currently disabled.");
  }

  const batch = writeBatch(db);
  rows.forEach(row => {
    const ref = doc(collection(db, "jobs"));
    batch.set(ref, buildJobPayload(ownerUID, ownerUsername, row));
  });
  await batch.commit();
  return rows.length;
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
  }, error => {
    console.error("Firestore listener [user jobs] failed", error);
    callback([]);
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
  if (!WALK_IN_ENABLED && (sourceJob.jobType === "walkin" || sourceJob.onRoute === true)) {
    throw new Error("Walk-in feature is currently disabled.");
  }
  const copyRef = doc(db, "jobs", `copy_${targetUID}_${sourceJob.id}`);
  const { id, ownerUID, ownerUsername, createdAt, status, appliedAt, reminderDismissedAt, ...rest } = sourceJob;
  const payload = buildJobPayload(targetUID, targetUsername, {
    ...rest,
    copiedFromUID: sourceJob.ownerUID,
    copiedFromUsername: sourceJob.ownerUsername,
  });

  await runTransaction(db, async transaction => {
    if ((await transaction.get(copyRef)).exists()) throw new Error("DUPLICATE");
    transaction.set(copyRef, payload);
  });
  return copyRef.id;
}

export async function getJobById(jobId: string): Promise<JobCard | null> {
  const snap = await getDoc(doc(db, "jobs", jobId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as JobCard;
}

// ─── Brute Force Job Leads ────────────────────────────────────────────────────

export interface BruteForceJobInput {
  company: string;
  phone?: string;
  location: string;
  mapLink: string;
  role: string;
}

function buildBruteForceJobPayload(
  ownerUID: string,
  ownerUsername: string,
  data: BruteForceJobInput
) {
  return {
    ownerUID,
    ownerUsername,
    company: data.company.trim().slice(0, 200),
    phone: data.phone?.trim().slice(0, 30) ?? "",
    location: data.location.trim().slice(0, 300),
    mapLink: requireSafeExternalUrl(data.mapLink, "Map link"),
    role: data.role.trim().slice(0, 200),
    callOutcome: "not_called",
    decision: "pending",
    successAt: null,
    interviewMode: null,
    interviewAt: null,
    interviewRescheduledAt: null,
    statusHistory: [{ status: "not_called", at: Date.now() }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function appendStatusHistory(current: any, status: string): BruteForceStatusEntry[] {
  const previous: BruteForceStatusEntry[] = Array.isArray(current?.statusHistory) ? current.statusHistory : [];
  return [...previous, { status, at: Date.now() }].slice(-100);
}

export async function createBruteForceJob(
  ownerUID: string,
  ownerUsername: string,
  data: BruteForceJobInput
): Promise<string> {
  const ref = await addDoc(
    collection(db, "bruteForceJobs"),
    buildBruteForceJobPayload(ownerUID, ownerUsername, data)
  );
  return ref.id;
}

export async function createBruteForceJobs(
  ownerUID: string,
  ownerUsername: string,
  rows: BruteForceJobInput[]
): Promise<number> {
  if (rows.length === 0 || rows.length > 100) {
    throw new Error("JSON import must contain between 1 and 100 jobs.");
  }

  const batch = writeBatch(db);
  rows.forEach(row => {
    const ref = doc(collection(db, "bruteForceJobs"));
    batch.set(ref, buildBruteForceJobPayload(ownerUID, ownerUsername, row));
  });
  await batch.commit();
  return rows.length;
}

/** Copy leads to today for another try; not_called stays not_called, other statuses carry over. */
export async function createBruteForceRetryLeads(
  ownerUID: string,
  ownerUsername: string,
  sources: BruteForceJob[],
  previousTryDate: string
): Promise<number> {
  if (sources.length === 0) return 0;
  if (sources.length > 100) {
    throw new Error("Maximum 100 leads can be retried at once.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(previousTryDate)) {
    throw new Error("Invalid previous try date.");
  }

  const batch = writeBatch(db);
  sources.forEach(source => {
    const tryNumber = Math.min(99, (source.tryNumber ?? 1) + 1);
    const sourceOutcome = source.decision !== "pending"
      ? source.callOutcome
      : source.callOutcome;
    const resetToNotCalled = sourceOutcome === "not_called";
    const carriedOutcome = resetToNotCalled ? "not_called" : sourceOutcome;
    const carriedHistory: BruteForceStatusEntry[] = resetToNotCalled
      ? [{ status: "not_called", at: Date.now() }]
      : (Array.isArray(source.statusHistory) && source.statusHistory.length > 0
        ? source.statusHistory
        : [{ status: carriedOutcome, at: Date.now() }]);

    const ref = doc(collection(db, "bruteForceJobs"));
    batch.set(ref, {
      ownerUID,
      ownerUsername,
      company: source.company,
      phone: source.phone ?? "",
      location: source.location,
      mapLink: source.mapLink,
      role: source.role,
      callOutcome: carriedOutcome,
      decision: "pending",
      successAt: null,
      interviewMode: null,
      interviewAt: null,
      interviewRescheduledAt: null,
      statusHistory: carriedHistory,
      previousTryDate,
      tryNumber,
      retryFromLeadId: source.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return sources.length;
}

export function bruteForceRouteJobId(ownerUID: string, leadId: string): string {
  return `brute_route_${ownerUID}_${leadId}`;
}

export async function addBruteForceJobToRoute(
  lead: BruteForceJob,
  ownerUID: string,
  ownerUsername: string,
  routeJobExists: boolean,
  routeDate?: string
): Promise<string> {
  if (!WALK_IN_ENABLED) throw new Error("Walk-in feature is currently disabled.");
  if (lead.ownerUID !== ownerUID) throw new Error("Only the lead owner can add it to a route.");

  const routeRef = doc(db, "jobs", bruteForceRouteJobId(ownerUID, lead.id));
  if (routeJobExists) {
    const updates: any = { onRoute: true, routeOrder: Date.now() };
    if (routeDate) updates.routeDate = routeDate;
    await updateDoc(routeRef, updates);
    return routeRef.id;
  }

  await setDoc(routeRef, buildJobPayload(ownerUID, ownerUsername, {
    jobType: "walkin",
    company: lead.company,
    location: lead.location,
    role: lead.role,
    ctc: "",
    applyLink: "",
    appliedVia: "Brute Force",
    appliedViaOther: "",
    batch: [],
    bond: "",
    lastDate: null,
    mapLink: lead.mapLink,
    nearestMetro: "",
    routeOrder: Date.now(),
    onRoute: true,
    status: "pending",
    ...(routeDate ? { routeDate } : {}),
  }), { merge: true });
  return routeRef.id;
}

export function subscribeToBruteForceJobs(
  uid: string,
  callback: (jobs: BruteForceJob[]) => void
): Unsubscribe {
  const q = query(collection(db, "bruteForceJobs"), where("ownerUID", "==", uid));
  return onSnapshot(q, snapshot => {
    const jobs = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as BruteForceJob));
    jobs.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds * 1000 ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds * 1000 ?? 0;
      return bTime - aTime;
    });
    callback(jobs);
  }, error => {
    console.error("Firestore listener [brute-force jobs] failed", error);
    callback([]);
  });
}

export async function recordBruteForceCallOutcome(
  jobId: string,
  outcome: BruteForceCallOutcome,
  interview?: { mode: InterviewMode; at: Date }
): Promise<void> {
  const jobRef = doc(db, "bruteForceJobs", jobId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("Lead not found.");
    const current = snapshot.data();
    if (current.decision !== "pending") throw new Error("Final result cannot be changed.");

    if (outcome === "success") {
      if (!interview || Number.isNaN(interview.at.getTime()) || interview.at.getTime() <= Date.now()) {
        throw new Error("Choose a future interview date and time.");
      }
      transaction.update(jobRef, {
        callOutcome: outcome,
        successAt: serverTimestamp(),
        interviewMode: interview.mode,
        interviewAt: interview.at,
        interviewRescheduledAt: null,
        statusHistory: appendStatusHistory(current, outcome),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    transaction.update(jobRef, {
      callOutcome: outcome,
      successAt: null,
      interviewMode: null,
      interviewAt: null,
      interviewRescheduledAt: null,
      statusHistory: appendStatusHistory(current, outcome),
      updatedAt: serverTimestamp(),
    });
  });
}

export type BruteForceEditableFields = {
  company: string;
  phone: string;
  location: string;
  mapLink: string;
  role: string;
};

/** Field edit gated by One Password (same-batch proof `bruteForceJobs__{id}_edit`). */
export async function updateBruteForceJobWithAnswer(
  uid: string,
  leadId: string,
  answer: string,
  fields: BruteForceEditableFields
): Promise<void> {
  const { getDeletionQuestion, digestDeletionAnswer } = await import("./deletionProtection");
  const question = await getDeletionQuestion(uid);
  if (!question) throw new Error("NO_DELETION_QUESTION");
  const answerDigest = await digestDeletionAnswer(answer);
  const mapLink = requireSafeExternalUrl(fields.mapLink, "Map link");
  const kind = "bruteForceJobs";
  const targetId = `${leadId}_edit`;
  const proofId = `${kind}__${targetId}`;

  const batch = writeBatch(db);
  batch.set(doc(db, "deletionProofs", uid, "targets", proofId), {
    uid,
    kind,
    targetId,
    answerDigest,
    secretVersion: question.version,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "bruteForceJobs", leadId), {
    company: fields.company.trim(),
    phone: fields.phone.trim(),
    location: fields.location.trim(),
    mapLink,
    role: fields.role.trim(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}


export async function rescheduleBruteForceInterview(jobId: string, interviewAt: Date): Promise<void> {
  if (Number.isNaN(interviewAt.getTime()) || interviewAt.getTime() <= Date.now()) {
    throw new Error("Choose a future interview date and time.");
  }
  const jobRef = doc(db, "bruteForceJobs", jobId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("Lead not found.");
    const current = snapshot.data();
    const successMillis = current.successAt?.toMillis?.() ?? current.successAt?.seconds * 1000 ?? 0;
    if (current.callOutcome !== "success" || current.decision !== "pending") {
      throw new Error("Only an active successful lead can be rescheduled.");
    }
    if (!successMillis || Date.now() < successMillis + 24 * 60 * 60 * 1000) {
      throw new Error("Interview date change unlocks 24 hours after success.");
    }
    transaction.update(jobRef, {
      interviewAt,
      interviewRescheduledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function setBruteForceDecision(
  jobId: string,
  decision: Exclude<BruteForceDecision, "pending">
): Promise<void> {
  const jobRef = doc(db, "bruteForceJobs", jobId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("Lead not found.");
    const current = snapshot.data();
    const interviewMillis = current.interviewAt?.toMillis?.() ?? current.interviewAt?.seconds * 1000 ?? 0;
    if (current.callOutcome !== "success" || current.decision !== "pending") {
      throw new Error("This result cannot be changed.");
    }
    if (!interviewMillis || Date.now() < interviewMillis) {
      throw new Error("Final result unlocks after the scheduled interview time.");
    }
    transaction.update(jobRef, {
      decision,
      statusHistory: appendStatusHistory(current, decision),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  extra?: { appliedAt?: any; reminderDismissedAt?: any; cancelReason?: string }
): Promise<void> {
  const updates: any = { status, statusUpdatedAt: serverTimestamp() };
  if (extra?.appliedAt !== undefined) updates.appliedAt = extra.appliedAt;
  if (extra?.reminderDismissedAt !== undefined) updates.reminderDismissedAt = extra.reminderDismissedAt;
  if (extra?.cancelReason !== undefined) updates.cancelReason = extra.cancelReason;
  await updateDoc(doc(db, "jobs", jobId), updates);
}

export type JobEditableFields = {
  company: string;
  role: string;
  location: string;
  ctc: string;
  applyLink: string;
  appliedVia: string;
  appliedViaOther: string;
  batch: string[];
  bond: string;
  lastDate: Date | null;
  mapLink: string;
  nearestMetro: string;
  employmentType: EmploymentType;
  internshipMonths: string;
  ppo: string;
};

function jobFieldsPayload(fields: JobEditableFields) {
  const isIntern = fields.employmentType === "internship";
  return {
    company: fields.company.trim(),
    role: fields.role.trim(),
    location: fields.location.trim(),
    ctc: fields.ctc.trim(),
    applyLink: fields.applyLink.trim(),
    appliedVia: fields.appliedVia,
    appliedViaOther: fields.appliedVia === "Others" ? fields.appliedViaOther.trim() : "",
    batch: fields.batch,
    bond: fields.bond.trim(),
    lastDate: fields.lastDate,
    mapLink: fields.mapLink.trim(),
    nearestMetro: fields.nearestMetro.trim(),
    employmentType: fields.employmentType,
    internshipMonths: isIntern ? fields.internshipMonths.trim() : "",
    ppo: isIntern ? fields.ppo : "",
  };
}

/** Unprotected update — only for admin/migration. Prefer updateJobFieldsWithAnswer. */
export async function updateJobFields(jobId: string, fields: JobEditableFields): Promise<void> {
  await updateDoc(doc(db, "jobs", jobId), jobFieldsPayload(fields));
}

/**
 * Field edit gated by One Password in the same batch as a fresh deletion proof.
 * Rules require proof targetId = `${jobId}_edit`.
 */
export async function updateJobFieldsWithAnswer(
  uid: string,
  jobId: string,
  answer: string,
  fields: JobEditableFields
): Promise<void> {
  const { getDeletionQuestion, digestDeletionAnswer } = await import("./deletionProtection");
  const question = await getDeletionQuestion(uid);
  if (!question) throw new Error("NO_DELETION_QUESTION");
  const answerDigest = await digestDeletionAnswer(answer);
  const kind = "jobs";
  const targetId = `${jobId}_edit`;
  const proofId = `${kind}__${targetId}`;

  const batch = writeBatch(db);
  batch.set(doc(db, "deletionProofs", uid, "targets", proofId), {
    uid,
    kind,
    targetId,
    answerDigest,
    secretVersion: question.version,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "jobs", jobId), jobFieldsPayload(fields));
  await batch.commit();
}

export async function updateJobRouteOrder(
  updates: { id: string; routeOrder: number }[]
): Promise<void> {
  if (!WALK_IN_ENABLED) throw new Error("Walk-in feature is currently disabled.");
  for (let index = 0; index < updates.length; index += 450) {
    const batch = writeBatch(db);
    updates.slice(index, index + 450).forEach(({ id, routeOrder }) => {
      batch.update(doc(db, "jobs", id), { routeOrder });
    });
    await batch.commit();
  }
}

export async function setJobOnRoute(
  jobId: string,
  onRoute: boolean,
  routeOrder?: number,
  routeDate?: string
): Promise<void> {
  if (!WALK_IN_ENABLED) throw new Error("Walk-in feature is currently disabled.");
  const updates: any = { onRoute };
  if (onRoute) {
    updates.routeOrder = routeOrder ?? Date.now();
    if (routeDate) updates.routeDate = routeDate;
  }
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

export function getChatId(uidA: string, uidB: string): string {
  return canonicalPairId(uidA, uidB);
}

function chatParticipants(uidA: string, uidB: string): [string, string] {
  return [uidA, uidB].sort() as [string, string];
}

async function ensureChat(uidA: string, uidB: string): Promise<string> {
  const chatId = getChatId(uidA, uidB);
  await setDoc(doc(db, "chats", chatId), {
    participants: chatParticipants(uidA, uidB),
  }, { merge: true });
  return chatId;
}

export async function sendMessage(
  senderUID: string,
  receiverUID: string,
  senderUsername: string,
  text: string
): Promise<void> {
  const cleanText = text.trim();
  if (!cleanText || cleanText.length > 2000) throw new Error("Message must be 1–2000 characters.");
  const chatId = getChatId(senderUID, receiverUID);
  const messageRef = doc(collection(db, "chats", chatId, "messages"));
  const batch = writeBatch(db);
  batch.set(doc(db, "chats", chatId), {
    participants: chatParticipants(senderUID, receiverUID),
    updatedAt: serverTimestamp(),
    lastText: cleanText.slice(0, 80),
    lastSenderUID: senderUID,
  }, { merge: true });
  batch.set(messageRef, {
    senderUID,
    senderUsername,
    text: cleanText,
    createdAt: serverTimestamp(),
    read: false,
  });
  await batch.commit();
}

export function subscribeToMessages(
  uidA: string,
  uidB: string,
  callback: (msgs: ChatMessage[]) => void
): Unsubscribe {
  let stopped = false;
  let unsubscribe: Unsubscribe = () => {};
  ensureChat(uidA, uidB).then(chatId => {
    if (stopped) return;
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc"),
      limit(100)
    );
    unsubscribe = onSnapshot(q, snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
    }, error => {
      console.error("Firestore listener [chat messages] failed", error);
      callback([]);
    });
  }).catch(error => {
    console.error("Firestore chat initialization failed", error);
    callback([]);
  });
  return () => { stopped = true; unsubscribe(); };
}

export async function markMessagesRead(uidA: string, uidB: string, currentUID: string): Promise<void> {
  const chatId = getChatId(uidA, uidB);
  const q = query(
    collection(db, "chats", chatId, "messages"),
    where("read", "==", false),
    limit(100)
  );
  const snap = await getDocs(q);
  const toMark = snap.docs.filter(d => d.data().senderUID !== currentUID);
  for (let index = 0; index < toMark.length; index += 450) {
    const batch = writeBatch(db);
    toMark.slice(index, index + 450).forEach(message => batch.update(message.ref, { read: true }));
    await batch.commit();
  }
}

export function subscribeToUnreadChatCount(
  uid: string,
  connectedUIDs: string[],
  callback: (count: number, countsMap: Record<string, number>) => void
): Unsubscribe[] {
  if (connectedUIDs.length === 0) { callback(0, {}); return []; }
  const counts: Record<string, number> = {};
  return connectedUIDs.map(otherUID => {
    let stopped = false;
    let unsubscribe: Unsubscribe = () => {};
    const chatId = getChatId(uid, otherUID);
    ensureChat(uid, otherUID).then(() => {
      if (stopped) return;
      const q = query(
        collection(db, "chats", chatId, "messages"),
        where("read", "==", false),
        where("senderUID", "==", otherUID),
      );
      unsubscribe = onSnapshot(q, snap => {
        counts[chatId] = snap.size;
        callback(Object.values(counts).reduce((a, b) => a + b, 0), { ...counts });
      }, error => {
        console.error(`Firestore listener [unread chat ${chatId}] failed`, error);
        counts[chatId] = 0;
        callback(Object.values(counts).reduce((a, b) => a + b, 0), { ...counts });
      });
    }).catch(error => {
      console.error(`Firestore chat badge initialization [${chatId}] failed`, error);
      counts[chatId] = 0;
      callback(Object.values(counts).reduce((a, b) => a + b, 0), { ...counts });
    });
    return () => { stopped = true; unsubscribe(); };
  });
}

// ─── Users ─────────────────────────────────────────────────────────────────────


export async function searchUserByUsername(
  username: string
): Promise<UserProfile | null> {
  const normalized = username.trim().toLowerCase();
  const usernameSnap = await getDoc(doc(db, "usernames", normalized));
  if (!usernameSnap.exists()) return null;
  const profileSnap = await getDoc(doc(db, "publicProfiles", usernameSnap.data().uid));
  return profileSnap.exists() ? profileSnap.data() as UserProfile : null;
}

export async function getUsersByUIDs(uids: string[]): Promise<UserProfile[]> {
  const uniqueUIDs = [...new Set(uids)].slice(0, 100);
  const snapshots = await Promise.all(uniqueUIDs.map(uid => getDoc(doc(db, "publicProfiles", uid))));
  return snapshots.filter(snap => snap.exists()).map(snap => snap.data() as UserProfile);
}

// ─── Connection Requests ───────────────────────────────────────────────────────

export async function sendConnectionRequest(
  senderUID: string,
  senderUsername: string,
  senderDisplayName: string,
  receiverUID: string
): Promise<void> {
  const pairId = canonicalPairId(senderUID, receiverUID);
  const requestRef = doc(db, "friendRequests", pairId);
  const connectionRef = doc(db, "connections", pairId);
  const notificationRef = doc(db, "notifications", pairId);

  await runTransaction(db, async transaction => {
    const connectionSnap = await transaction.get(connectionRef);
    const requestSnap = await transaction.get(requestRef);
    if (connectionSnap.exists()) return;
    if (requestSnap.exists()) {
      if (requestSnap.data().status === "pending" && requestSnap.data().senderUID === senderUID) return;
      if (requestSnap.data().status === "pending") {
        throw new Error("This user already sent you a request. Respond from Notifications.");
      }
      throw new Error("A previous request already exists for this connection.");
    }

    transaction.set(requestRef, {
      senderUID,
      receiverUID,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(notificationRef, {
      receiverUID,
      senderUID,
      senderUsername,
      senderDisplayName,
      type: "connection_request",
      requestId: pairId,
      status: "unread",
      createdAt: serverTimestamp(),
    });
  });
}

export async function respondToRequest(
  requestId: string,
  notificationId: string,
  status: "accepted" | "declined",
  currentUID: string
): Promise<void> {
  const requestRef = doc(db, "friendRequests", requestId);
  const notificationRef = doc(db, "notifications", notificationId);

  await runTransaction(db, async transaction => {
    const requestSnap = await transaction.get(requestRef);
    const notificationSnap = await transaction.get(notificationRef);
    if (!requestSnap.exists()) throw new Error("Request no longer exists.");
    const request = requestSnap.data();
    if (request.receiverUID !== currentUID || request.status !== "pending") {
      throw new Error("This request cannot be changed.");
    }

    const connectionRef = doc(db, "connections", canonicalPairId(request.senderUID, request.receiverUID));
    const connectionSnap = await transaction.get(connectionRef);
    transaction.update(requestRef, { status, updatedAt: serverTimestamp() });
    if (status === "accepted" && !connectionSnap.exists()) {
      transaction.set(connectionRef, {
        userA: [request.senderUID, request.receiverUID].sort()[0],
        userB: [request.senderUID, request.receiverUID].sort()[1],
        requestId,
        connectedAt: serverTimestamp(),
      });
    }
    if (notificationSnap.exists() && notificationSnap.data().receiverUID === currentUID) {
      transaction.update(notificationRef, { status: "read" });
    }
  });
}

export async function getRequestStatus(
  senderUID: string,
  receiverUID: string
): Promise<"none" | "pending" | "accepted" | "declined"> {
  const connectionSnap = await getDoc(doc(db, "connections", canonicalPairId(senderUID, receiverUID)));
  if (connectionSnap.exists()) return "accepted";
  const requestSnap = await getDoc(doc(db, "friendRequests", canonicalPairId(senderUID, receiverUID)));
  if (requestSnap.exists()) return requestSnap.data().status as "pending" | "accepted" | "declined";

  // Temporary compatibility for legacy random request IDs.
  const legacy = await getDocs(query(
    collection(db, "friendRequests"),
    where("senderUID", "==", senderUID),
    where("receiverUID", "==", receiverUID),
    limit(1)
  ));
  return legacy.empty ? "none" : legacy.docs[0].data().status;
}

// ─── Connections ───────────────────────────────────────────────────────────────

export async function getConnections(uid: string): Promise<Connection[]> {
  const qA = query(collection(db, "connections"), where("userA", "==", uid));
  const qB = query(collection(db, "connections"), where("userB", "==", uid));
  const [snapA, snapB] = await Promise.all([getDocs(qA), getDocs(qB)]);
  const byPair = new Map<string, Connection>();

  for (const snapshot of [...snapA.docs, ...snapB.docs]) {
    const connection = { id: snapshot.id, ...snapshot.data() } as Connection;
    const pairId = canonicalPairId(connection.userA, connection.userB);

    // Keep browser reads read-only. A get() for a missing canonical document is
    // correctly denied by participant-based rules because resource.data does not
    // exist. Legacy documents must be backfilled with a trusted Admin SDK script.
    connection.id = pairId;
    byPair.set(pairId, connection);
  }
  return [...byPair.values()];
}

export async function getConnectedUIDs(uid: string): Promise<string[]> {
  const conns = await getConnections(uid);
  return [...new Set(conns.map(c => c.userA === uid ? c.userB : c.userA))];
}

export async function areConnected(uidA: string, uidB: string): Promise<boolean> {
  return (await getDoc(doc(db, "connections", canonicalPairId(uidA, uidB)))).exists();
}

// ─── Permissions ───────────────────────────────────────────────────────────────

function permissionId(ownerUID: string, granteeUID: string): string {
  return `${ownerUID}__to__${granteeUID}`;
}

export async function getPermission(
  ownerUID: string,
  granteeUID: string
): Promise<boolean> {
  const canonical = await getDoc(doc(db, "permissions", permissionId(ownerUID, granteeUID)));
  if (canonical.exists()) return canonical.data().canCopy === true;

  const legacy = await getDocs(query(
    collection(db, "permissions"),
    where("ownerUID", "==", ownerUID),
    where("granteeUID", "==", granteeUID),
    limit(1)
  ));
  return !legacy.empty && legacy.docs[0].data().canCopy === true;
}

export async function setPermission(
  ownerUID: string,
  granteeUID: string,
  canCopy: boolean
): Promise<void> {
  await setDoc(doc(db, "permissions", permissionId(ownerUID, granteeUID)), {
    ownerUID,
    granteeUID,
    canCopy,
    updatedAt: serverTimestamp(),
  });
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
    orderBy("createdAt", "desc"),
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
  }, error => {
    console.error("Firestore listener [notifications] failed", error);
    callback([]);
  });
}

export async function markNotificationRead(notifId: string): Promise<void> {
  await updateDoc(doc(db, "notifications", notifId), { status: "read" });
}
