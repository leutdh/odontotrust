// WhatsApp (wa.me and the Cloud API) needs the international number as digits only, and for
// Argentine mobiles that means 54 + 9 + area code + subscriber, e.g. 5491155551234.

const AR_NATIONAL = /^(11|[23]\d)\d{8}$/; // 10 digits: area code (11, 2xx, 3xx) + subscriber

function normalizeArgentina(national: string): string | null {
  let n = national;
  if (n.startsWith('0')) n = n.slice(1); // trunk prefix: 011 ...
  if (n.startsWith('9') && n.length === 11) n = n.slice(1); // mobile indicator after +54
  if (n.length === 12) {
    // Old local mobile prefix "15" after the area code (2, 3 or 4 digits): 11 15 5555 1234
    for (const areaLen of [2, 3, 4]) {
      if (n.slice(areaLen, areaLen + 2) === '15') {
        n = n.slice(0, areaLen) + n.slice(areaLen + 2);
        break;
      }
    }
  }
  return AR_NATIONAL.test(n) ? `549${n}` : null;
}

/**
 * Digits-only international number for WhatsApp, or null if it can't be made reliable.
 * Numbers without country code are assumed Argentine; a number with no area code is rejected
 * (we cannot guess the area).
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  const international = trimmed.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (international || (digits.startsWith('54') && digits.length >= 12)) {
    if (digits.startsWith('54')) return normalizeArgentina(digits.slice(2));
    return /^\d{8,15}$/.test(digits) ? digits : null;
  }
  return normalizeArgentina(digits);
}
