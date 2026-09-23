// Pure string-normalisation + fingerprint helpers shared by the food-bank directory
// service and the import/reconciliation scripts.
//
// Dependency-free by design: importing this module pulls in no Prisma client, no config
// and no network, so scripts can run it offline. `foodBankDirectoryService.js` imports
// these rather than defining its own copies, so there is exactly ONE implementation of
// the fingerprint scheme.

export function normalizeWhitespace(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

export function normalizeText(value = '') {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function normalizeStateValue(value) {
  const normalized = normalizeWhitespace(value || '');
  if (!normalized) return '';
  return normalized.length <= 3 ? normalized.toUpperCase() : normalized;
}

export function normalizeUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(String(value).trim());
    const hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `https://${hostname}${pathname}`;
  } catch {
    return null;
  }
}

export function extractDomain(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  try {
    return new URL(normalized).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

// The directory's cross-source match key. Deliberately NOT the unique `fingerprint`
// column: several distinct venues legitimately share a domain, so a collision here is a
// useful "same place / same source" signal rather than a constraint violation.
export function buildFingerprint(candidate) {
  if (candidate.websiteDomain) return `site:${candidate.websiteDomain}`;
  if (candidate.normalizedPhone) return `phone:${candidate.normalizedPhone}`;
  return `name:${candidate.normalizedName}|${normalizeText(candidate.city)}|${normalizeText(candidate.state)}`;
}