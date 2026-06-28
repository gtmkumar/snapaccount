---
name: dg-chat-08-google-calendar-provider-fallback
description: DG-CHAT-08 fix — GoogleCalendarMeetingLinkProvider throws NotImplementedException when creds configured; inverted to safe fallback
metadata:
  type: project
---

# DG-CHAT-08: GoogleCalendarMeetingLinkProvider safe fallback

**File changed:** `backend/Services/AssistService/Assist.Infrastructure/Chat/Services/GoogleCalendarMeetingLinkProvider.cs`

**Bug:** Original code: when `MeetingLink:GoogleCalendar:ServiceAccountJson` was ABSENT → fell back (safe). When JSON WAS configured → threw `NotImplementedException`. This broke `BookAppointmentCommandHandler` (which awaits `CreateMeetingLinkAsync` in the Result handler) any time someone set the provider to `GoogleCalendar` in config.

**Fix:** Inverted failure mode — now BOTH code paths (creds absent and creds present) fall back to the deterministic fake Meet URL (`https://meet.google.com/snap-{shortId}-{dateTag}`) with a `LogWarning`. The `throw new NotImplementedException` is removed entirely. A `// TODO (TL-GATED)` block documents exactly what needs to be added (Google.Apis.Calendar.v3 events.insert with conferenceData/hangoutsMeet) when real creds are provisioned.

**Why:** Real Calendar API credentials are TL-gated (not yet provisioned). The throw was a code bug, not intentional behavior — the safe failure mode for a TL-gated implementation is always a mock URL + warning log, never an exception that propagates out of a Result<T> handler.

**How to apply:** When implementing the real Calendar API call, replace the `if (!string.IsNullOrEmpty(serviceAccountJson))` warning block with the actual `GoogleCredential.FromJson()` → `CalendarService` → `Events.Insert()` call returning `Event.HangoutLink`.

**Build:** 0 errors after fix.
