import type { EmploymentType, JobCard } from "./firestore";
import { safeExternalUrl } from "./security";

export type OnlineJobImportRow = Omit<JobCard, "id" | "ownerUID" | "ownerUsername" | "createdAt">;

const ALLOWED_KEYS = new Set([
  "role", "company", "location", "applyLink", "appliedVia", "appliedViaOther",
  "ctc", "batch", "bond", "lastDate", "employmentType", "internshipMonths", "ppo",
]);
const APPLIED_VIA = new Set(["Naukri.com", "LinkedIn", "Company Website", "Referral", "Others"]);
const EMPLOYMENT_TYPES = new Set<EmploymentType>(["full_time", "part_time", "internship"]);
const PPO_VALUES = new Set(["", "yes", "no", "maybe"]);

function stringField(
  row: Record<string, unknown>,
  key: string,
  rowNumber: number,
  fallback = ""
): string {
  const value = row[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`Row ${rowNumber}: ${key} string hona chahiye.`);
  return value.trim();
}

function validDate(value: string, rowNumber: number): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Row ${rowNumber}: lastDate YYYY-MM-DD format mein honi chahiye.`);
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Row ${rowNumber}: lastDate valid date nahi hai.`);
  }
  return date;
}
export function parseOnlineJobImport(contents: string): OnlineJobImportRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("Invalid JSON file. JSON syntax check karo.");
  }
  if (!Array.isArray(parsed)) throw new Error("JSON ka top level array [...] hona chahiye.");
  if (parsed.length === 0) throw new Error("JSON mein kam se kam 1 job honi chahiye.");
  if (parsed.length > 100) throw new Error("Ek file mein maximum 100 jobs import kar sakte ho.");

  return parsed.map((value, index) => {
    const rowNumber = index + 1;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Row ${rowNumber}: har job JSON object honi chahiye.`);
    }
    const row = value as Record<string, unknown>;
    const unknownKey = Object.keys(row).find(key => !ALLOWED_KEYS.has(key));
    if (unknownKey) throw new Error(`Row ${rowNumber}: unknown field “${unknownKey}”.`);

    const role = stringField(row, "role", rowNumber);
    const company = stringField(row, "company", rowNumber);
    const location = stringField(row, "location", rowNumber);
    const rawApplyLink = stringField(row, "applyLink", rowNumber);
    const applyLink = safeExternalUrl(rawApplyLink);
    const appliedVia = stringField(row, "appliedVia", rowNumber, "LinkedIn");
    const appliedViaOther = stringField(row, "appliedViaOther", rowNumber);
    const ctc = stringField(row, "ctc", rowNumber);
    const bond = stringField(row, "bond", rowNumber);
    const lastDate = validDate(stringField(row, "lastDate", rowNumber), rowNumber);
    const employmentType = stringField(row, "employmentType", rowNumber, "full_time") as EmploymentType;
    const internshipMonths = stringField(row, "internshipMonths", rowNumber);
    const ppo = stringField(row, "ppo", rowNumber);

    if (!role) throw new Error(`Row ${rowNumber}: role required hai.`);
    if (!applyLink) throw new Error(`Row ${rowNumber}: applyLink valid https:// URL hona chahiye.`);
    if (!APPLIED_VIA.has(appliedVia)) throw new Error(`Row ${rowNumber}: appliedVia invalid hai.`);
    if (!EMPLOYMENT_TYPES.has(employmentType)) throw new Error(`Row ${rowNumber}: employmentType invalid hai.`);
    if (!PPO_VALUES.has(ppo)) throw new Error(`Row ${rowNumber}: ppo invalid hai.`);
    if (employmentType === "internship" && !internshipMonths) {
      throw new Error(`Row ${rowNumber}: internshipMonths required hai.`);
    }
    const batchValue = row.batch;
    let batch: string[] = [];
    if (typeof batchValue === "string") {
      batch = batchValue.split(",").map(item => item.trim()).filter(Boolean);
    } else if (Array.isArray(batchValue) && batchValue.every(item => typeof item === "string")) {
      batch = batchValue.map(item => item.trim()).filter(Boolean);
    } else if (batchValue !== undefined) {
      throw new Error(`Row ${rowNumber}: batch string ya string array honi chahiye.`);
    }

    if (role.length > 200 || company.length > 200) throw new Error(`Row ${rowNumber}: role/company bahut lamba hai.`);
    if (location.length > 300 || ctc.length > 100 || bond.length > 100) throw new Error(`Row ${rowNumber}: field length limit cross hui.`);
    if (appliedViaOther.length > 80 || internshipMonths.length > 20) throw new Error(`Row ${rowNumber}: field length limit cross hui.`);
    if (batch.length > 30 || batch.some(item => item.length > 50)) throw new Error(`Row ${rowNumber}: batch values invalid hain.`);

    const isInternship = employmentType === "internship";
    return {
      jobType: "online",
      company,
      location,
      applyLink,
      appliedVia,
      appliedViaOther: appliedVia === "Others" ? appliedViaOther : "",
      ctc,
      role,
      lastDate,
      bond,
      batch,
      mapLink: "",
      nearestMetro: "",
      routeOrder: 0,
      employmentType,
      internshipMonths: isInternship ? internshipMonths : "",
      ppo: isInternship ? ppo : "",
    };
  });
}
