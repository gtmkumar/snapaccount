/**
 * Privacy / DPO contact constants.
 *
 * DPDP Rules 2025 require a published, India-based Data Protection Officer
 * contact that is admin-configurable so it can be updated without an app release.
 *
 * TODO Wave 3: replace with GET /auth/config/privacy-contact so the
 * contact details can be updated server-side without a new app release.
 */

export interface PrivacyContact {
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
  dpoName: 'SnapAccount Data Protection Officer',
  dpoEmail: 'dpo@snapaccount.in',
  dpoPhone: '+91 80 4700 0000',
  indiaAddress: 'SnapAccount Technologies Pvt. Ltd., 3rd Floor, Tower B, DLF Cyber City, Bengaluru – 560 103, Karnataka, India',
  businessHours: 'Mon–Fri, 10:00 AM – 6:00 PM IST',
  ackDays: 3,
  slaDays: 30,
  dpbLearnMoreUrl: 'https://dpboard.gov.in',
};
