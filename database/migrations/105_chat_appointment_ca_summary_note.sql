-- Migration 105: DG-CHAT-05 — CA post-call summary note on appointments
-- Adds a nullable ca_summary_note column to chat.appointments so CAs can write
-- a summary after a COMPLETED consultation that is visible to the user on the
-- appointment detail screen (Screen 45 / Screen 82).
--
-- Additive-only — no existing data or constraints are modified.
-- The column is deliberately NOT constrained to COMPLETED status at the DB layer
-- (that business rule is enforced by Appointment.SetCaSummary in the domain).

ALTER TABLE chat.appointments
    ADD COLUMN IF NOT EXISTS ca_summary_note TEXT CHECK (char_length(ca_summary_note) <= 4000);

COMMENT ON COLUMN chat.appointments.ca_summary_note
    IS 'Post-call summary note written by the CA after the appointment is COMPLETED. Visible to the user. Max 4000 chars. DG-CHAT-05 (migration 105).';
