const HTTPS_PROTOCOL = "https:";

/**
 * Returns a canonical HTTPS URL or null.
 * User-controlled URLs are untrusted even when React escapes their text.
 */
export function safeExternalUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== HTTPS_PROTOCOL || !url.hostname) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function requireSafeExternalUrl(value: string, label: string): string {
  const url = safeExternalUrl(value);
  if (!url) throw new Error(`${label} must be a valid https:// URL.`);
  return url;
}

export function canonicalPairId(uidA: string, uidB: string): string {
  if (!uidA || !uidB || uidA === uidB) throw new Error("Two different users are required.");
  return [uidA, uidB].sort().join("__");
}
