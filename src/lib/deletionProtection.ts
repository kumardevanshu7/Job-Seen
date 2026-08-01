import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export type DeletionTargetKind = "jobs" | "bruteForceJobs";

export interface DeletionQuestion {
  uid: string;
  question: string;
  version: number;
  createdAt: unknown;
  updatedAt: unknown;
}

const QUESTION_MIN_LENGTH = 5;
const QUESTION_MAX_LENGTH = 160;

function collapseWhitespace(value: string): string {
  const compatible = value.normalize("NFKC");
  if (/[\u0000-\u001f\u007f]/.test(compatible)) {
    throw new Error("Question/answer mein line breaks ya control characters allowed nahi hain.");
  }
  return compatible.trim().replace(/\s+/g, " ");
}

export function normalizeDeletionQuestion(value: string): string {
  const normalized = collapseWhitespace(value);
  if (normalized.length < QUESTION_MIN_LENGTH || normalized.length > QUESTION_MAX_LENGTH) {
    throw new Error(`Question ${QUESTION_MIN_LENGTH}–${QUESTION_MAX_LENGTH} characters ka hona chahiye.`);
  }
  return normalized;
}

export function normalizeDeletionAnswer(value: string): string {
  const normalized = collapseWhitespace(value).toLocaleLowerCase("en-US");
  if (!normalized) {
    throw new Error("Answer empty nahi ho sakta.");
  }
  return normalized;
}

export async function digestDeletionAnswer(answer: string): Promise<string> {
  const normalized = normalizeDeletionAnswer(answer);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function getDeletionQuestion(uid: string): Promise<DeletionQuestion | null> {
  const snapshot = await getDoc(doc(db, "deletionQuestions", uid));
  return snapshot.exists() ? snapshot.data() as DeletionQuestion : null;
}

export async function configureDeletionProtection(
  uid: string,
  question: string,
  answer: string
): Promise<void> {
  const normalizedQuestion = normalizeDeletionQuestion(question);
  const answerDigest = await digestDeletionAnswer(answer);
  const questionRef = doc(db, "deletionQuestions", uid);
  const secretRef = doc(db, "deletionSecrets", uid);

  if ((await getDoc(questionRef)).exists()) {
    throw new Error("One Password pehle se configured hai. Change form use karo.");
  }

  const batch = writeBatch(db);
  batch.set(questionRef, {
    uid,
    question: normalizedQuestion,
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(secretRef, {
    uid,
    answerDigest,
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function changeDeletionProtection(
  uid: string,
  currentAnswer: string,
  nextQuestion: string,
  nextAnswer: string
): Promise<void> {
  const current = await getDeletionQuestion(uid);
  if (!current) throw new Error("Pehle deletion protection setup karo.");

  const currentDigest = await digestDeletionAnswer(currentAnswer);
  const nextDigest = await digestDeletionAnswer(nextAnswer);
  const normalizedQuestion = normalizeDeletionQuestion(nextQuestion);
  const nextVersion = current.version + 1;
  const proofRef = doc(db, "deletionProofs", uid, "targets", "settings-change__secret");

  const batch = writeBatch(db);
  batch.set(proofRef, {
    uid,
    kind: "settings-change",
    targetId: "secret",
    answerDigest: currentDigest,
    secretVersion: current.version,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "deletionQuestions", uid), {
    question: normalizedQuestion,
    version: nextVersion,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "deletionSecrets", uid), {
    answerDigest: nextDigest,
    version: nextVersion,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

async function deleteWithAnswer(
  uid: string,
  kind: DeletionTargetKind,
  targetId: string,
  answer: string
): Promise<void> {
  if (!targetId) throw new Error("Delete target missing hai.");
  const question = await getDeletionQuestion(uid);
  if (!question) throw new Error("NO_DELETION_QUESTION");
  const answerDigest = await digestDeletionAnswer(answer);
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
  batch.delete(doc(db, kind, targetId));
  await batch.commit();
}

export function deleteJobWithAnswer(uid: string, jobId: string, answer: string): Promise<void> {
  return deleteWithAnswer(uid, "jobs", jobId, answer);
}

export function deleteBruteForceJobWithAnswer(uid: string, leadId: string, answer: string): Promise<void> {
  return deleteWithAnswer(uid, "bruteForceJobs", leadId, answer);
}

/**
 * Verifies the deletion-protection answer by writing a non-destructive proof.
 * Uses kind "jobs" with a synthetic targetId so it never unlocks a real job delete.
 */
export async function verifyDeletionAnswer(
  uid: string,
  answer: string,
  purpose = "unlock"
): Promise<void> {
  const question = await getDeletionQuestion(uid);
  if (!question) throw new Error("NO_DELETION_QUESTION");
  const answerDigest = await digestDeletionAnswer(answer);
  const kind: DeletionTargetKind = "jobs";
  const targetId = `verify_${purpose}`.slice(0, 1500);
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
  await batch.commit();
}

export async function deleteBruteForceJobsWithAnswer(
  uid: string,
  leadIds: string[],
  answer: string
): Promise<number> {
  const uniqueIds = [...new Set(leadIds.filter(Boolean))];
  if (uniqueIds.length === 0) throw new Error("Delete karne ke liye cards select karo.");

  const question = await getDeletionQuestion(uid);
  if (!question) throw new Error("NO_DELETION_QUESTION");
  const answerDigest = await digestDeletionAnswer(answer);

  // Firestore atomic writes have a shared rules document-access budget. Small
  // chunks keep every target-specific proof verifiable without hitting it.
  const chunkSize = 15;
  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const batch = writeBatch(db);
    uniqueIds.slice(index, index + chunkSize).forEach(leadId => {
      const proofId = `bruteForceJobs__${leadId}`;
      batch.set(doc(db, "deletionProofs", uid, "targets", proofId), {
        uid,
        kind: "bruteForceJobs",
        targetId: leadId,
        answerDigest,
        secretVersion: question.version,
        createdAt: serverTimestamp(),
      });
      batch.delete(doc(db, "bruteForceJobs", leadId));
    });
    await batch.commit();
  }
  return uniqueIds.length;
}

export function deletionProtectionError(error: unknown): string {
  const value = error as { code?: string; message?: string };
  if (value?.message === "NO_DELETION_QUESTION") {
    return "Pehle Settings → One Password setup karo (1 question + 1 answer).";
  }
  if (value?.code === "permission-denied" || value?.code === "firestore/permission-denied") {
    return "Answer galat hai, ya updated Firestore rules publish nahi hui hain.";
  }
  return value?.message || "One Password verify nahi ho paya. Dobara try karo.";
}
