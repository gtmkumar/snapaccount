/**
 * Utility functions for SnapAccount mobile app
 * - INR formatting (Indian number system: lakhs/crores)
 * - Date utilities (Indian format DD/MM/YYYY, Financial Year awareness)
 * - PAN / GSTIN / Phone validators
 */

// ─────────────────────────────────────────────────────────────────────────────
// INR / Currency formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format amount as Indian Rupee string
 * Uses Indian numbering: ₹1,23,45,678 (not ₹12,345,678)
 */
export function formatINR(
  amount: number,
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showSymbol?: boolean;
  } = {},
): string {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    showSymbol = true,
  } = options;

  const formatter = new Intl.NumberFormat('en-IN', {
    style: showSymbol ? 'currency' : 'decimal',
    currency: 'INR',
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return formatter.format(amount);
}

/**
 * Compact INR format: ₹12.5L, ₹2.3Cr
 */
export function formatINRCompact(amount: number): string {
  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(2)}Cr`;
  }
  if (amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(2)}L`;
  }
  if (amount >= 1_000) {
    return `₹${(amount / 1_000).toFixed(1)}K`;
  }
  return formatINR(amount);
}

/**
 * Parse INR string to number (removes ₹, commas)
 */
export function parseINR(value: string): number {
  return parseFloat(value.replace(/[₹,\s]/g, '')) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format date as DD/MM/YYYY (Indian standard)
 */
export function formatDateIN(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Parse DD/MM/YYYY string to Date
 */
export function parseDateIN(dateStr: string): Date | null {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Get current Indian Financial Year
 * FY starts April 1, ends March 31
 * Returns: { year: "FY 2024-25", start: Date, end: Date }
 */
export function getCurrentFinancialYear(): {
  label: string;
  startYear: number;
  endYear: number;
  start: Date;
  end: Date;
} {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed, March = 2, April = 3
  const year = now.getFullYear();

  const startYear = month >= 3 ? year : year - 1; // April (3) or later → current year
  const endYear = startYear + 1;

  return {
    label: `FY ${startYear}-${String(endYear).slice(2)}`,
    startYear,
    endYear,
    start: new Date(startYear, 3, 1),  // April 1
    end: new Date(endYear, 2, 31),      // March 31
  };
}

/**
 * Get list of financial years (last N years)
 */
export function getFinancialYears(count = 5): string[] {
  const current = getCurrentFinancialYear();
  return Array.from({ length: count }, (_, i) => {
    const sy = current.startYear - i;
    const ey = sy + 1;
    return `FY ${sy}-${String(ey).slice(2)}`;
  });
}

/**
 * Relative time: "2 hours ago", "3 days ago"
 */
export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return formatDateIN(d);
}

/**
 * Days until deadline (negative if overdue)
 */
export function daysUntil(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────────────────────────────────────
// Indian document validators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate Indian mobile number
 * Format: 10 digits, starts with 6-9
 */
export function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.trim());
}

/**
 * Sanitize phone input: strip +91, leading 0, spaces
 */
export function sanitizePhone(raw: string): string {
  return raw
    .replace(/^\+91/, '')
    .replace(/^0/, '')
    .replace(/\D/g, '')
    .slice(0, 10);
}

/**
 * Format phone for display: +91 XXXXX XXXXX
 */
export function formatPhoneDisplay(phone: string): string {
  const clean = sanitizePhone(phone);
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return `+91 ${clean}`;
}

/**
 * Validate PAN Number
 * Format: XXXXX9999X (5 letters, 4 digits, 1 letter) — all uppercase
 */
export function isValidPAN(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase().trim());
}

/**
 * Validate GSTIN
 * 15 characters: 2-digit state code + 10-char PAN + 1 entity + Z + check
 */
export function isValidGSTIN(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    gstin.toUpperCase().trim(),
  );
}

/**
 * Validate Aadhaar number (12 digits)
 */
export function isValidAadhaar(aadhaar: string): boolean {
  const clean = aadhaar.replace(/\s/g, '');
  return /^\d{12}$/.test(clean);
}

/**
 * Mask Aadhaar for display: XXXX XXXX 1234
 */
export function maskAadhaar(aadhaar: string): string {
  const clean = aadhaar.replace(/\D/g, '');
  if (clean.length !== 12) return aadhaar;
  return `XXXX XXXX ${clean.slice(8)}`;
}

/**
 * Validate IFSC code (11 chars: 4 alpha + 0 + 6 alphanumeric)
 */
export function isValidIFSC(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase().trim());
}

/**
 * Validate Indian PIN code (6 digits, not starting with 0)
 */
export function isValidPinCode(pin: string): boolean {
  return /^[1-9]\d{5}$/.test(pin.trim());
}

/**
 * Validate TAN (Tax Deduction Account Number)
 * 10 chars: 4 alpha + 5 digits + 1 alpha
 */
export function isValidTAN(tan: string): boolean {
  return /^[A-Z]{4}\d{5}[A-Z]{1}$/.test(tan.toUpperCase().trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// GST utilities
// ─────────────────────────────────────────────────────────────────────────────

export type GSTRate = 0 | 5 | 12 | 18 | 28;

/**
 * Calculate GST components from taxable amount and rate
 */
export function calculateGST(
  taxableAmount: number,
  rate: GSTRate,
  isInterstate: boolean,
): {
  taxableAmount: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  total: number;
} {
  const totalTax = (taxableAmount * rate) / 100;

  if (isInterstate) {
    return {
      taxableAmount,
      igst: totalTax,
      cgst: 0,
      sgst: 0,
      totalTax,
      total: taxableAmount + totalTax,
    };
  }

  return {
    taxableAmount,
    igst: 0,
    cgst: totalTax / 2,
    sgst: totalTax / 2,
    totalTax,
    total: taxableAmount + totalTax,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate initials from a name (max 2 chars)
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

/**
 * Deterministic color from string (for Avatar background)
 */
export function stringToColor(str: string): string {
  const colors = [
    '#2563EB', '#7C3AED', '#0891B2', '#059669',
    '#D97706', '#DC2626', '#DB2777', '#0284C7',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
