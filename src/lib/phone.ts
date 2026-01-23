/**
 * Normalize a phone number to E.164 format for NZ numbers
 * Returns null if the number is invalid
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone) return null;

  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // Handle various NZ formats
  if (cleaned.startsWith('0')) {
    // Local format: 021 123 4567 → +64211234567
    cleaned = '+64' + cleaned.slice(1);
  } else if (cleaned.startsWith('64') && !cleaned.startsWith('+')) {
    // Missing +: 64211234567 → +64211234567
    cleaned = '+' + cleaned;
  } else if (/^\d{9,10}$/.test(cleaned)) {
    // Just digits, assume NZ: 211234567 → +64211234567
    cleaned = '+64' + cleaned;
  }

  // Validate NZ format
  if (!isValidNZNumber(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Check if a phone number is a valid NZ number in E.164 format
 */
export function isValidNZNumber(phone: string): boolean {
  // NZ numbers: +64 followed by 8-10 digits
  // Mobile: +642X XXX XXXX (9 digits after +64)
  // Landline: +64X XXX XXXX (8-9 digits after +64)
  const nzPattern = /^\+64\d{8,10}$/;
  return nzPattern.test(phone);
}

/**
 * Check if a number appears to be international (not NZ)
 */
export function isInternationalNumber(phone: string): boolean {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) return false;
  return !cleaned.startsWith('+64');
}

/**
 * Format E.164 to local display format
 * +64211234567 → 021 123 4567
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!phone) return '';

  if (phone.startsWith('+64')) {
    const local = '0' + phone.slice(3);
    // Format as 0XX XXX XXXX
    if (local.length === 10) {
      return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
    }
    if (local.length === 11) {
      return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
    }
    return local;
  }

  return phone;
}
