# School portal pilot

Status: prepared; no school participants have completed this pilot in this development environment.

Use staging and synthetic records initially. Suggested cohort: one school coordinator, one registration reviewer, two teachers (different subject/class scopes), and five students across junior/senior placements. Confirm participants, devices, time and support contact with the school before inviting anyone. Do not send invitations or copy real student documents into the test environment automatically.

## Session plan

Allow 45–60 minutes. Ask each participant to complete tasks without coaching, recording completion, time, confusion and any reference ID. Use participant codes rather than names in shared feedback. Test at least one narrow Android phone, one iPhone/Safari, and a laptop with keyboard-only navigation; automated Chromium checks do not replace these devices or screen-reader testing.

| Role | Task | Expected outcome |
| --- | --- | --- |
| Applicant | Sign up, save an incomplete application, leave and return | Saved fields persist; unsaved changes warn before navigation |
| Applicant | Upload/replace a synthetic passport, retry after a failed upload | Clear progress and retry; entered fields remain intact |
| Reviewer | Request changes, verify documents, approve correct placement | Student receives a permanent ID and one initial enrollment |
| Student | Sign in, reload, open daily work and weekly timetable | Correct current session/class/subjects; real deadlines and school time |
| Student | Follow a notification, open classwork, download an attachment | Correct resource opens; no unrelated class data is visible |
| Teacher | Save classwork during a simulated save failure, then publish | Draft remains editable; only the assigned audience receives it |
| Timetable manager | Add a lesson, try a clash, publish a corrected week | Class/teacher/room conflicts fail clearly without clearing edits |
| Teacher | Enter scores including zero/absent, save and submit | Unsaved entries block submission; server validates scores |
| Reviewer | Review, return for correction, approve, publish | Independent approval required; student sees only published reports |
| Teacher/reviewer | Request and apply a published correction | Reason recorded; corrected report is a new revision |
| Student | Read, print and download a report; change session filter | Correct historical session/placement and readable mobile layout |
| Administrator | Promote a synthetic student and inspect old enrollment | New enrollment created; old academic history and permanent ID retained |
| All | Disconnect/reconnect, sign out, use Back, then sign in as another account | No private data leaks across users; failures have useful recovery |

## Launch criteria

- Every critical task completes without an unresolved authorization, data-loss, upload, or incorrect-result defect.
- Participants can identify their current academic context, next action, and where to get help without facilitator intervention.
- Forms, navigation and report reading work on the school’s actual devices, keyboard and required assistive technology.
- Provider storage check, backup restore, incident notification and rollback rehearsal have recorded owners and evidence.
- The coordinator signs off the remaining lower-priority issues with an owner and date. Do not replace failures with a blanket “production grade” approval.

Use `pilot-feedback.csv` for non-sensitive findings. Severity: blocker = security/data loss/wrong authoritative result; high = core task impossible; medium = task needs assistance; low = cosmetic. Never include passwords, real documents, signed links or medical data. Attach redacted screenshots only in the school’s restricted feedback location.
