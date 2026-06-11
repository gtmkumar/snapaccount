/**
 * Privacy / DPO contact constants.
 *
 * DPDP Rules 2025 require a published, India-based Data Protection Officer
 * contact that is admin-configurable so it can be updated without an app release.
 *
 * ⚠️ TODO(TL-10) — DPO APPOINTMENT PENDING (team-lead blocker, NEW-W2-007):
 * The values below are PLACEHOLDERS. No DPO has been appointed yet, so the
 * Privacy Center and DPO Contact screens MUST render the "DPO appointment
 * pending" state (driven by `isPlaceholder` below) instead of presenting
 * these as live contact details. When the DPO is appointed:
 *   1. Replace dpoName/dpoEmail/dpoPhone/indiaAddress with the real details.
 *   2. Flip `isPlaceholder` to false.
 *
 * TODO Wave 3: replace with GET /auth/config/privacy-contact so the
 * contact details can be updated server-side without a new app release.
 */

export interface PrivacyContact {
  /**
   * True while TL-10 (DPO appointment) is unresolved. UI must show a
   * "DPO appointment pending" state and disable direct-contact CTAs.
   */
  isPlaceholder: boolean;
  dpoName: string;
  dpoEmail: string;
  dpoPhone: string;
  indiaAddress: string;
  businessHours: string;
  ackDays: number;
  slaDays: number;
  dpbLearnMoreUrl: string;
}

export const PRIVACY_CONTACT: PrivacyContact = {
  isPlaceholder: true, // TODO(TL-10): flip to false once the DPO is appointed
  dpoName: 'SnapAccount Data Protection Officer',
  dpoEmail: 'dpo@snapaccount.in',
  dpoPhone: '+91 80 4700 0000',
  indiaAddress: 'SnapAccount Technologies Pvt. Ltd., 3rd Floor, Tower B, DLF Cyber City, Bengaluru – 560 103, Karnataka, India',
  businessHours: 'Mon–Fri, 10:00 AM – 6:00 PM IST',
  ackDays: 3,
  slaDays: 30,
  dpbLearnMoreUrl: 'https://dpboard.gov.in',
};
