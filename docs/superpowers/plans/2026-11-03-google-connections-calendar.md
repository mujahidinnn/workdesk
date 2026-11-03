# Google Connections + Calendar Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user connect a Google account from their profile, push approved leave, overtime, trips, task deadlines and holidays to a "WorkDesk" Google calendar, and show their personal Google events read-only on CalendarPage, with a simulated mode for demo visitors.

**Architecture:**
- One migration holds tables, Vault token functions, enqueue triggers, the claim RPC and the `pg_cron` tick. Triggers write to an outbox; they never call Google.
- Three Edge Functions: `google-oauth` (start, callback, disconnect), `google-calendar` (overlay read), `google-calendar-sync` (outbox worker).
- Pure logic lives in Deno-free modules under `supabase/functions/_shared/` so vitest can import them from `src/lib/__tests__/`.

**Tech Stack:** Supabase Postgres 17 (RLS, plpgsql, Vault, pg_cron, pg_net), Deno Edge Functions, React + TanStack Query v5, shadcn/ui, i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-google-connections-calendar-design.md`

**Deviations from the spec, decided while validating this plan:**
- **PKCE verifier is not in `state`.** `state` travels through the browser, so carrying the verifier there defeats PKCE. The verifier is derived: `HMAC(GOOGLE_STATE_SECRET, nonce)`, and only the nonce is in `state`.
- **Enqueue covers `error` connections too** (`status IN ('active','error')`), and the claim RPC only returns `active` ones. Otherwise a change made while a token is expired (a weekly event in Testing mode) would be lost, deletes especially.
- **`t_calendar_outbox` gains `seq int`.** `SKIP LOCKED` inside an RPC releases its lock on return, so the claim also takes a 5 minute lease by pushing `next_attempt_at`. Each enqueue bumps `seq`, and the worker only deletes a row whose `seq` it claimed, so an edit landing mid-flight is not dropped.
- **Toggle off also removes pending `upsert` rows of that type,** otherwise they would create events after the user opted out.
- **Task deadlines are also removed when `archived_at` is set.** The spec only named `done` and a null `due_date`.
- **Callback rejects partial consent.** Google lets users untick individual scopes, so the callback checks the granted scopes and redirects with `connect_error=scope`.
- **Redirect URI is a path:** `${SUPABASE_URL}/functions/v1/google-oauth/callback`, not a query string.
- **`google-calendar` takes `POST {from, to}`,** matching how `supabase.functions.invoke` is used elsewhere in the repo.
- **Leave title is the type alone** (`Cuti`, `Izin`, `Sakit`). `Cuti: Cuti` reads badly. Overtime is `Lembur`, both trip types are `Dinas`.
- **Exhausted retries surface in the UI:** the worker sets `last_error='sync_failed'` on the connection when a row goes `failed`.
- **"Keep calendar" on disconnect keeps the approved behaviour, with honest copy.** The calendar id goes with the row, and `calendar.app.created` gives no reliable way to find it again, so reconnecting creates a second calendar. The dialog says so.

## Global Constraints

- Never run `git commit`. The user commits. Each task ends by printing a suggested commit message with no attribution lines.
- Comments, docs and commit messages use a plain human tone with no em dashes (GUIDELINE.md).
- No new npm dependency. Edge Functions import `@supabase/supabase-js` from `https://esm.sh/@supabase/supabase-js@2.57.4` like the existing ones.
- Rules that protect data live in SQL and are proved in `supabase/tests/connections_smoke.sql`.
- One data-access hook file per thing in `src/hooks/`. Every user-facing string goes through `t()`, with keys in both `src/locales/en.json` and `src/locales/id.json` under `connections.*`.
- DB error messages are in English.
- Modules in `_shared/` used by vitest must not reference `Deno` or use URL imports.
- Event timezone is always `Asia/Jakarta`.
- Scopes, verbatim: `openid`, `email`, `https://www.googleapis.com/auth/calendar.app.created`, `https://www.googleapis.com/auth/calendar.events.readonly`.
- Function secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_STATE_SECRET`, `GOOGLE_TEST_EMAILS`, `APP_URL` (no trailing slash), `CRON_SECRET`.

## Review Focus

1. A change made while the connection is in `error`: it must reach Google after reconnecting. Pinned in Task 2.
2. A task or leave edited again while the worker holds its row: the newer change must survive. Pinned in Task 2.
3. A task finished, archived or unassigned: its deadline leaves that user's calendar. Pinned in Task 2.
4. Overtime that crosses midnight (`22:00` to `02:00`): the event ends the next day, and Google does not reject it. Pinned in Task 3.
5. A user who unticks one scope on the consent screen: the connect fails clearly rather than half working. Pinned in Task 4.

---

### Task 1: Connection tables and token storage

**Files:**
- Create: `supabase/migrations/20261104000000_google_connections.sql`
- Create: `supabase/tests/connections_smoke.sql`

**Interfaces:**
- Produces: tables per spec 3.1 to 3.4, plus `t_calendar_outbox.seq int NOT NULL DEFAULT 0`. `t_calendar_outbox.user_id` has no FK: a trigger firing during a profile cascade must not be able to block the delete.
- Produces, all `SECURITY DEFINER`, `SET search_path = public, vault`, revoked from `public, anon, authenticated`, granted to `service_role`:
  - `google_token_set(p_user uuid, p_token text) RETURNS void` (creates or updates the Vault secret)
  - `google_token_get(p_user uuid) RETURNS text`
  - `google_token_delete(p_user uuid) RETURNS void` (removes the secret and the row)

- [ ] **Step 1: Write the failing smoke test**

Header like `board_smoke.sql` (`\set ON_ERROR_STOP on`, `LOAD 'safeupdate'`). Do not use its blanket `GRANT ALL ON ALL TABLES`: it would hide the ACL under test. Create users A and B as `supabase_admin`, then assert in DO blocks with `SET ROLE authenticated` and `test.uid`:

- A sees only A's row in `t_google_connections`.
- A can update `sync_leave`, and gets `permission denied` updating `status`, `google_email` or inserting a row.
- A gets `permission denied` selecting `t_google_tokens`, `t_calendar_links`, `t_calendar_outbox`.
- `has_function_privilege('authenticated', f, 'execute')` is false for all three token functions.
- As `supabase_admin`: `google_token_set` twice then `google_token_get` returns the second value, and leaves one row in `vault.secrets` for that user.
- `google_token_delete` removes the row in `t_google_tokens` and the secret.

- [ ] **Step 2: Run it to verify it fails**

Run: `supabase/tests/scratch_db.sh supabase/tests/connections_smoke.sql`
Expected: FAIL, relation `t_google_connections` does not exist.

- [ ] **Step 3: Write the migration**

`CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;`, `pg_cron`, and `pg_net WITH SCHEMA extensions`. Enable RLS on all four tables. Policies only on `t_google_connections` (select and update own). ACL must be explicit, since Supabase default privileges grant everything:

```sql
REVOKE ALL ON t_google_connections, t_google_tokens, t_calendar_links, t_calendar_outbox
  FROM anon, authenticated;
GRANT SELECT ON t_google_connections TO authenticated;
GRANT UPDATE (sync_leave, sync_overtime, sync_tasks, sync_holidays, show_overlay)
  ON t_google_connections TO authenticated;
```

Outbox unique index: `CREATE UNIQUE INDEX ... ON t_calendar_outbox (user_id, source_type, source_id) WHERE NOT failed;`

- [ ] **Step 4: Run the smoke test**

Run: `supabase/tests/scratch_db.sh supabase/tests/connections_smoke.sql`
Expected: exits 0.

- [ ] **Step 5: Print the commit message**

`feat(db): add google connection tables and vault token storage`

---

### Task 2: Outbox enqueue, claim and cron tick

**Files:**
- Modify: `supabase/migrations/20261104000000_google_connections.sql`
- Modify: `supabase/tests/connections_smoke.sql`

**Interfaces:**
- Consumes: Task 1 tables.
- Produces, revoked from clients, granted to `service_role`:
  - `calendar_enqueue(p_user uuid, p_type text, p_id bigint, p_op text) RETURNS void`
  - `calendar_backfill(p_user uuid, p_type text DEFAULT NULL) RETURNS void` (null means every enabled type)
  - `calendar_outbox_claim(p_limit int) RETURNS SETOF t_calendar_outbox`
  - `calendar_sync_tick() RETURNS void`

- [ ] **Step 1: Add the failing assertions**

Fixture: A connected `active`, B with no connection, C connected `demo`, D connected `error`. Cover:

- Leave `Pending → Approved` enqueues `upsert`. `Approved → Rejected` flips that row to `delete`. Delete of an `Approved` row enqueues `delete`. `Pending` never enqueues.
- Date change on an `Approved` leave enqueues `upsert`. Same rules hold for `t_overtime_business_trips`.
- Three quick edits leave one outbox row, with `seq` raised.
- B and C are never enqueued.
- **Review 1:** D (`error`) is enqueued, `calendar_outbox_claim` skips it, and it is returned once D becomes `active`.
- **Review 2:** claim a row for A, enqueue the same source again, then `DELETE ... WHERE id = x AND seq = <claimed seq>` removes nothing and the row is claimable.
- **Review 3:** task with assignee A and a `due_date` enqueues `upsert`. Setting `status='done'`, setting `archived_at`, clearing `due_date`, and removing the assignee each enqueue `delete`. Adding an assignee enqueues `upsert` for that user. Changing `position` enqueues nothing.
- Insert into `m_holidays` enqueues for every `active` user with `sync_holidays`.
- `sync_holidays` off: a pending holiday `upsert` for that user is gone, and each `t_calendar_links` holiday row has a `delete`. Toggle on: `upsert` for this year's holidays.
- `calendar_backfill(A)`: past leave is skipped, future leave and open tasks are queued.
- Two sequential `calendar_outbox_claim(10)` calls return no row twice (the lease).
- `calendar_outbox_claim` removes rows of users with no connection.
- `calendar_sync_tick()` returns without error when the Vault secrets are missing, and `cron.job` has `calendar-sync` with schedule `* * * * *`.

- [ ] **Step 2: Run it to verify it fails**

Run: `supabase/tests/scratch_db.sh supabase/tests/connections_smoke.sql`
Expected: FAIL at the first enqueue assertion.

- [ ] **Step 3: Add the enqueue core**

```sql
-- inside calendar_enqueue, after reading the connection into c:
IF c.status NOT IN ('active', 'error') THEN RETURN; END IF;
IF p_op = 'upsert' AND NOT CASE p_type
    WHEN 'leave' THEN c.sync_leave WHEN 'overtime' THEN c.sync_overtime
    WHEN 'task' THEN c.sync_tasks WHEN 'holiday' THEN c.sync_holidays END THEN RETURN; END IF;
INSERT INTO t_calendar_outbox (user_id, source_type, source_id, op)
VALUES (p_user, p_type, p_id, p_op)
ON CONFLICT (user_id, source_type, source_id) WHERE NOT failed DO UPDATE
  SET op = EXCLUDED.op, attempts = 0, next_attempt_at = now(), last_error = NULL,
      seq = t_calendar_outbox.seq + 1;
```

- [ ] **Step 4: Add the triggers**

Per spec 3.5, as `SECURITY DEFINER` functions with `SET search_path = public`, since the actor is usually a manager with no access to the outbox. `t_tasks` uses `AFTER UPDATE OF due_date, title, status, archived_at` and looks up `t_task_assignees`. A task is live when `due_date IS NOT NULL AND status <> 'done' AND archived_at IS NULL`, else `delete`. `t_google_connections` gets `AFTER UPDATE` of the four toggles: on, call `calendar_backfill(user, type)`; off, delete that type's pending `upsert` rows, then `calendar_enqueue(..., 'delete')` for each link of that type.

`calendar_backfill` scope: leave and overtime `Approved` with end date (`coalesce(end_date, date)` for overtime) at or after the Jakarta date today, live tasks assigned to the user, holidays in the current year.

- [ ] **Step 5: Add the claim and the tick**

```sql
DELETE FROM t_calendar_outbox o
 WHERE NOT EXISTS (SELECT 1 FROM t_google_connections c WHERE c.user_id = o.user_id);
RETURN QUERY
UPDATE t_calendar_outbox o SET next_attempt_at = now() + interval '5 minutes'
 WHERE o.id IN (
   SELECT o2.id FROM t_calendar_outbox o2
   JOIN t_google_connections c ON c.user_id = o2.user_id AND c.status = 'active'
   WHERE NOT o2.failed AND o2.next_attempt_at <= now()
   ORDER BY o2.next_attempt_at LIMIT p_limit
   FOR UPDATE OF o2 SKIP LOCKED)
RETURNING o.*;
```

`calendar_sync_tick` reads `calendar_sync_url` and `calendar_sync_secret` from `vault.decrypted_secrets`, returns when either is missing or when no row is due for an `active` user (so an idle minute costs no function call), else `net.http_post` with `Authorization: Bearer <secret>`. Schedule it: `cron.schedule('calendar-sync', '* * * * *', 'SELECT public.calendar_sync_tick()')`. No secret or project URL goes in the migration.

- [ ] **Step 6: Run the smoke test**

Run: `supabase/tests/scratch_db.sh supabase/tests/connections_smoke.sql`
Expected: exits 0.

- [ ] **Step 7: Run the other smoke tests**

Run: `supabase/tests/scratch_db.sh supabase/tests/board_smoke.sql`, then the same with `security_smoke.sql`
Expected: both exit 0, so the new triggers do not break task or leave flows. `security_smoke.sql` may list functions callable by clients; add the new ones to it if it does.

- [ ] **Step 8: Print the commit message**

`feat(db): queue calendar changes through an outbox with a cron tick`

---

### Task 3: Event mapping

**Files:**
- Create: `supabase/functions/_shared/calendarEvent.ts`
- Test: `src/lib/__tests__/calendarEvent.test.ts`

**Interfaces:**
- Produces:
  - `type CalendarSource` = union on `kind: "leave" | "overtime" | "task" | "holiday"`, carrying the DB columns each case needs (`type`, `start_date`, `end_date`, `date`, `start_time`, `end_time`, `activity_description`, `title`, `due_date`, `board_id`, `name`) plus `id: number`
  - `type GoogleEventPayload` = `{summary, description, start, end, status: "confirmed", transparency, extendedProperties: {private: {workdesk_source: string}}}`
  - `toGoogleEvent(source: CalendarSource, appUrl: string): GoogleEventPayload`
  - `backoffMinutes(attemptsBefore: number): number`
  - `shouldGiveUp(attemptsAfter: number): boolean`
  - `demoEvents(from: string): OverlayEvent[]`
  - `toOverlayEvent(item: unknown): OverlayEvent`, where `OverlayEvent = {id, title, start, end, allDay, htmlLink: string | null}`. `start`/`end` are `YYYY-MM-DD` or ISO datetimes as Google sent them; `end` stays exclusive for all-day events.

- [ ] **Step 1: Write the failing test**

```ts
it("makes multi-day leave all-day with an exclusive end", () => {
  const e = toGoogleEvent({ kind: "leave", id: 7, type: "Cuti", start_date: "2026-12-30", end_date: "2027-01-01" }, APP);
  expect(e.start).toEqual({ date: "2026-12-30" });
  expect(e.end).toEqual({ date: "2027-01-02" });
  expect(e.summary).toBe("Cuti");
  expect(e.transparency).toBe("opaque");
  expect(e.status).toBe("confirmed");
  expect(e.extendedProperties.private.workdesk_source).toBe("leave:7");
});
it("rolls overtime past midnight into the next day", () => {
  const e = toGoogleEvent({ kind: "overtime", id: 1, type: "Overtime", date: "2026-11-30", start_time: "22:00:00", end_time: "02:00:00", end_date: null, activity_description: "Deploy" }, APP);
  expect(e.start).toEqual({ dateTime: "2026-11-30T22:00:00", timeZone: "Asia/Jakarta" });
  expect(e.end).toEqual({ dateTime: "2026-12-01T02:00:00", timeZone: "Asia/Jakarta" });
  expect(e.summary).toBe("Lembur");
  expect(e.transparency).toBe("transparent");
});
```

Also assert: overtime with null times is all-day; `BusinessTrip_Local` with null `end_date` is one all-day `Dinas` (`opaque`), and with `end_date` spans it; a task gives `[Deadline] <title>` with end `due_date + 1` and a description holding `${APP}/boards/<board_id>`; a holiday uses `name`; `backoffMinutes` gives 1, 2, 4 for 0, 1, 2 and caps at 60 for 6 and 7; `shouldGiveUp(7)` false and `shouldGiveUp(8)` true; `demoEvents("2026-02-01")` are all inside February and at least one multi-day; `toOverlayEvent` handles `start.date` and `start.dateTime`, and a missing `summary` becomes an empty title.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/calendarEvent.test.ts`
Expected: FAIL, cannot resolve the module.

- [ ] **Step 3: Implement the module**

Date math on `Date.UTC` so the machine timezone cannot shift a day. `status` is always `confirmed`: Google keeps deleted events as `cancelled` and a plain patch would leave them hidden, so this is what restores an event the user deleted. Times are normalised to `HH:MM:SS`. Overtime with `end_time <= start_time` ends the next day.

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/lib/__tests__/calendarEvent.test.ts`
Expected: PASS.

- [ ] **Step 5: Print the commit message**

`feat(calendar): map workdesk records to google events`

---

### Task 4: OAuth helpers

**Files:**
- Create: `supabase/functions/_shared/googleOAuth.ts`
- Test: `src/lib/__tests__/googleOAuth.test.ts`

**Interfaces:**
- Produces:
  - `type GoogleService = "calendar"`
  - `scopesFor(service: GoogleService): string[]`
  - `missingScopes(granted: string, service: GoogleService): string[]`
  - `isTestEmail(email: string | undefined, list: string | undefined): boolean`
  - `signState(p: {userId: string; nonce: string; service: GoogleService; exp: number}, secret: string): Promise<string>`
  - `verifyState(state: string, secret: string, now: number): Promise<{userId: string; nonce: string; service: GoogleService} | null>`
  - `pkceVerifier(nonce: string, secret: string): Promise<string>`
  - `pkceChallenge(verifier: string): Promise<string>`
  - `buildAuthUrl(p: {clientId: string; redirectUri: string; state: string; challenge: string; service: GoogleService}): string`
  - `emailFromIdToken(idToken: string): string | null`

- [ ] **Step 1: Write the failing test**

```ts
it("reports a scope the user unticked", () => {
  const granted = `openid email ${APP_CREATED}`;
  expect(missingScopes(granted, "calendar")).toEqual([EVENTS_READONLY]);
});
it("rejects tampered and expired state", async () => {
  const s = await signState({ userId: "u", nonce: "n", service: "calendar", exp: 1000 }, "k");
  expect(await verifyState(s, "k", 999)).toMatchObject({ userId: "u", nonce: "n" });
  expect(await verifyState(s, "k", 1001)).toBeNull();
  expect(await verifyState(s, "other", 999)).toBeNull();
  expect(await verifyState(`x${s}`, "k", 999)).toBeNull();
  expect(await verifyState("garbage", "k", 999)).toBeNull();
});
```

Also assert: `state` decoded contains no verifier; `pkceVerifier` is stable per nonce and 43 to 128 url-safe chars; `pkceChallenge` of the RFC 7636 verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` equals `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`; `isTestEmail` ignores case and spaces, and is false for an undefined or empty list; `buildAuthUrl` sets `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`, `code_challenge_method=S256` and every scope; `emailFromIdToken` reads a base64url payload and returns null on junk.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/googleOAuth.test.ts`
Expected: FAIL, cannot resolve the module.

- [ ] **Step 3: Implement with WebCrypto**

`crypto.subtle` works in both Node 24 and Deno. `verifyState` uses `crypto.subtle.verify`, which is constant time, and returns null rather than throwing on malformed input.

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/lib/__tests__/googleOAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Print the commit message**

`feat(connections): add google oauth state and pkce helpers`

---

### Task 5: `google-oauth` function

**Files:**
- Create: `supabase/functions/_shared/googleConnection.ts`
- Create: `supabase/functions/google-oauth/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: Task 1 token functions, `calendar_backfill`, Task 4 helpers.
- Produces, in `googleConnection.ts`:
  - `class ReconnectNeeded extends Error`
  - `getAccessToken(admin: SupabaseClient, userId: string): Promise<string>`: refreshes through `https://oauth2.googleapis.com/token`. On `invalid_grant` it moves the connection `active → error` with `last_error='reconnect'`, inserts one `t_notifications` row (title `Koneksi Google terputus`, body `Hubungkan ulang akun Google di halaman profil`, link `/settings/profile`) only on that transition, then throws `ReconnectNeeded`.
  - `createWorkdeskCalendar(accessToken: string): Promise<string>`
  - `calendarFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response>`, base `https://www.googleapis.com/calendar/v3`
- Produces, HTTP: `POST {action:"start", service}` → `{url}` or `{demo:true}`. `POST {action:"disconnect", deleteCalendar?}` → `{ok:true}`. `GET /google-oauth/callback`.

- [ ] **Step 1: Implement `googleConnection.ts`**

- [ ] **Step 2: Implement `start` and `disconnect`**

Auth with the `callerClient.auth.getUser()` pattern from `delete-user/index.ts`, and use a service-role `adminClient` for writes. `start`: reject any `service` other than `calendar` with 400; `isTestEmail(user.email, GOOGLE_TEST_EMAILS)` false → upsert `{user_id, status:'demo'}` and return `{demo:true}`. `disconnect`: for a real connection, best-effort `DELETE /calendars/{id}` when asked (only with a live token, and swallow `ReconnectNeeded`), revoke at `https://oauth2.googleapis.com/revoke`, ignore failures of both, then `google_token_delete`, delete links, outbox and the connection row.

- [ ] **Step 3: Implement `callback`**

Route on `new URL(req.url).pathname.endsWith("/callback")`. Every exit is a 302 to `${APP_URL}/settings/profile` with `connected=calendar` or `connect_error=<denied|state|scope|exchange>`. Order: `error` param → `denied`; `verifyState` null → `state`; exchange the code with `pkceVerifier(nonce)`; non-OK or no `refresh_token` → `exchange`; `missingScopes` non-empty → `scope`, after revoking the token just granted. Then `google_token_set`, upsert `status='active', google_email, scopes, last_error=null`. Keep an existing `workdesk_calendar_id` and create a calendar only when there is none, so a weekly reconnect does not spawn calendars. Finally `calendar_backfill(user)`.

- [ ] **Step 4: Register it**

Add to `supabase/config.toml`, and reword its header comment so `google-oauth` and `google-calendar-sync` read as the other exceptions:

```toml
[functions.google-oauth]
verify_jwt = false

[functions.google-calendar]
verify_jwt = true

[functions.google-calendar-sync]
verify_jwt = false
```

- [ ] **Step 5: Type check**

Run: `pnpm dlx deno check supabase/functions/google-oauth/index.ts`
Expected: no errors.

- [ ] **Step 6: Print the commit message**

`feat(connections): add google oauth edge function`

---

### Task 6: Sync worker

**Files:**
- Create: `supabase/functions/google-calendar-sync/index.ts`

**Interfaces:**
- Consumes: `calendar_outbox_claim`, `calendar_backfill`, Task 3 `toGoogleEvent`, `backoffMinutes`, `shouldGiveUp`, Task 5 `getAccessToken`, `calendarFetch`, `createWorkdeskCalendar`, `ReconnectNeeded`.
- Produces: `POST` guarded by `Authorization: Bearer ${CRON_SECRET}`; 401 otherwise, including when the secret is unset.

- [ ] **Step 1: Implement `loadSource(admin, row): Promise<CalendarSource | null>`**

Null when the record is gone or no longer eligible: leave or overtime not `Approved`, task not live (Task 2 definition) or the user is no longer in `t_task_assignees`, holiday missing. This covers a trigger that raced, and it is why step 2 treats null as a delete.

- [ ] **Step 2: Implement the loop**

Claim 50, group by `user_id`, sequential per user, per spec 4.3. Link lookups use `t_calendar_links`. Every row removal and failure update filters on `.eq("id", row.id).eq("seq", row.seq)`. On success set `last_synced_at` and `last_error = null`.

- Failure: `attempts + 1`, `next_attempt_at` from `backoffMinutes(row.attempts)`, `last_error` from the Google response. When `shouldGiveUp`, set `failed = true` and `last_error='sync_failed'` on the connection.
- `ReconnectNeeded`: skip the user's remaining rows and leave them as they are. Their lease expires and the claim ignores them until the connection is `active`.
- Insert 404 means the calendar is gone: `createWorkdeskCalendar`, save the id, delete the user's links, `calendar_backfill(user)`, and move on to the next user.

Add `// ponytail: a crash between insert and saving the link duplicates that event; use deterministic event ids if it ever shows up.`

- [ ] **Step 3: Type check**

Run: `pnpm dlx deno check supabase/functions/google-calendar-sync/index.ts`
Expected: no errors.

- [ ] **Step 4: Print the commit message**

`feat(calendar): add worker that pushes the outbox to google`

---

### Task 7: Overlay function and day expansion

**Files:**
- Create: `supabase/functions/google-calendar/index.ts`
- Create: `src/lib/googleEvents.ts`
- Test: `src/lib/__tests__/googleEvents.test.ts`

**Interfaces:**
- Consumes: Task 3 `OverlayEvent`, `toOverlayEvent`, `demoEvents`; Task 5 `getAccessToken`, `calendarFetch`, `ReconnectNeeded`.
- Produces: `POST {from: "YYYY-MM-DD", to: "YYYY-MM-DD"}` → `{events: OverlayEvent[]}`. 400 on a bad date or `from > to`, 409 `{error:"reconnect"}` on `ReconnectNeeded`, `{events: []}` with no connection.
- Produces: `eventDays(e: OverlayEvent): string[]` in `src/lib/googleEvents.ts`, and re-exports `type OverlayEvent`.

- [ ] **Step 1: Write the failing test**

```ts
it("treats an all-day end as exclusive", () => {
  expect(eventDays({ id: "1", title: "", start: "2026-11-28", end: "2026-12-01", allDay: true, htmlLink: null }))
    .toEqual(["2026-11-28", "2026-11-29", "2026-11-30"]);
});
it("keeps a timed event on its own days", () => {
  expect(eventDays({ id: "2", title: "", start: "2026-11-30T23:00:00+07:00", end: "2026-12-01T01:00:00+07:00", allDay: false, htmlLink: null }))
    .toEqual(["2026-11-30", "2026-12-01"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/googleEvents.test.ts`
Expected: FAIL, cannot resolve the module.

- [ ] **Step 3: Implement `eventDays`**

Timed events use the date part of the string as sent, because the function requests `timeZone=Asia/Jakarta`.

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/lib/__tests__/googleEvents.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the function**

Same auth pattern as Task 5, with RLS reading the caller's own connection. `demo` returns `demoEvents(from)`. `active` calls `/calendars/primary/events` with `singleEvents=true`, `orderBy=startTime`, `maxResults=250`, `timeZone=Asia/Jakarta`, `timeMin=${from}T00:00:00+07:00`, `timeMax` as the day after `to`. Add `// ponytail: first 250 events only; follow nextPageToken if a month ever exceeds it.`

- [ ] **Step 6: Type check**

Run: `pnpm dlx deno check supabase/functions/google-calendar/index.ts`
Expected: no errors.

- [ ] **Step 7: Print the commit message**

`feat(calendar): read personal google events for the overlay`

---

### Task 8: Connections section

**Files:**
- Create: `src/hooks/useGoogleConnection.ts`
- Create: `src/components/connections/ConnectionsSection.tsx`
- Create: `src/components/connections/GoogleCalendarCard.tsx`
- Modify: `src/lib/types.ts`
- Modify: `src/integrations/supabase/types.ts`
- Modify: `src/pages/ProfileSettingsPage.tsx`
- Modify: `src/locales/en.json`, `src/locales/id.json`

**Interfaces:**
- Consumes: Task 5 HTTP actions, Task 7 `eventDays`, `OverlayEvent`.
- Produces in `useGoogleConnection.ts`: `useGoogleConnection()`, `useConnectGoogle()` (mutation taking `"calendar"`), `useDisconnectGoogle()` (mutation taking `{deleteCalendar: boolean}`), `useUpdateConnectionToggles()`, `useGoogleEvents(month: Date)`.
- Produces in `src/lib/types.ts`: `GoogleConnection`.

- [ ] **Step 1: Regenerate DB types**

Run `supabase/tests/scratch_db.sh` with no argument to get a URL, then `supabase gen types typescript --db-url <url> --schema public > src/integrations/supabase/types.ts`, then `docker rm -f` the printed container.
Expected: `git diff --stat` on that file shows only additions for the new tables and functions.

- [ ] **Step 2: Implement the hooks**

Follow `useHolidays.ts`. Selecting from `t_google_connections` uses `.maybeSingle()`, so no connection is `null`. `useConnectGoogle` invokes `google-oauth` with `{action:"start", service}`, then `window.location.assign(data.url)`, or invalidates and toasts for demo. `useGoogleEvents` has query key `["google-events", "yyyy-MM"]`, `staleTime` 5 minutes, and is enabled only when the connection is `active` or `demo` with `show_overlay` on.

- [ ] **Step 3: Implement the cards**

`GoogleCalendarCard` renders the four states from spec 5.1. The disconnect dialog uses `AlertDialog` with a `Checkbox`, and its copy, in both locales, is:

- id: `Kalender WorkDesk tetap ada di Google tetapi tidak lagi diperbarui. Jika terhubung lagi, kalender baru akan dibuat.`
- en: `The WorkDesk calendar stays in Google but stops updating. Connecting again creates a new one.`

Show that text only while the delete box is unticked. Show `connections.syncFailed` when `last_error === 'sync_failed'`.

`ConnectionsSection` renders the card plus two static "Segera hadir" rows for Drive and Photos, and handles `?connected=` and `?connect_error=` with `useSearchParams`: toast, then remove them with `{ replace: true }`. Codes are `denied`, `state`, `scope`, `exchange`, and anything else falls back to `connections.errors.generic`.

- [ ] **Step 4: Add it to the profile page**

In `src/pages/ProfileSettingsPage.tsx`, just before the `SettingsCard` at line 769, wrap `<ConnectionsSection />` in a `SettingsCard` with `t("connections.title")` and `t("connections.description")`.

- [ ] **Step 5: Verify**

Run: `pnpm build && pnpm test:run && pnpm lint`
Expected: all pass. Then run `pnpm dev`, click connect as a user outside `GOOGLE_TEST_EMAILS` (needs the function running or deployed) and confirm the Demo badge shows. If no function is reachable, say so in the task report rather than claiming this was checked.

- [ ] **Step 6: Print the commit message**

`feat(connections): add connections section to the profile page`

---

### Task 9: Calendar overlay UI

**Files:**
- Modify: `src/pages/CalendarPage.tsx`
- Modify: `src/locales/en.json`, `src/locales/id.json`

**Interfaces:**
- Consumes: Task 8 `useGoogleEvents`, Task 7 `eventDays`.

- [ ] **Step 1: Mark the days**

Call `useGoogleEvents(displayMonth)` and derive `googleDates` with `useMemo` from `eventDays`, as `new Date(\`${d}T00:00:00\`)` like `holidayDates`. Add modifier `google: googleDates` with a class using an underline or dot in a sky tone, so a day that is both a holiday and a Google event shows both. Add a legend entry beside the holiday one, rendered only when events exist.

- [ ] **Step 2: List the events**

Under the holiday list in the same card, add a "Google" group for the displayed month: title, date, and `opacity` styling that reads as read-only. It links to `htmlLink` with `target="_blank" rel="noreferrer"`, and is plain text when `htmlLink` is null (demo). On query error show one muted line `connections.overlayError`; the holiday calendar keeps working.

- [ ] **Step 3: Verify**

Run: `pnpm build && pnpm test:run && pnpm lint`
Expected: all pass. Check in `pnpm dev`, light and dark, that a user with no connection sees the page unchanged.

- [ ] **Step 4: Print the commit message**

`feat(calendar): show personal google events on the calendar page`

---

### Task 10: Setup docs and end-to-end check

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Document the setup in README**

A short feature line under "Team and admin", and a "Google Connections setup" section after "Running locally":

- Google Cloud: enable Calendar API, create a Web OAuth client, redirect URI `https://<ref>.supabase.co/functions/v1/google-oauth/callback`, add the four scopes, add test users.
- `supabase secrets set` for the six secrets in Global Constraints.
- Vault: `calendar_sync_url` = `https://<ref>.supabase.co/functions/v1/google-calendar-sync`, and `calendar_sync_secret` = the same value as `CRON_SECRET`.
- Testing-mode limit: authorisations expire after 7 days, so test users reconnect weekly.

In `.env.example`, add a comment that the Google secrets are Edge Function secrets and do not belong in this file.

- [ ] **Step 2: Hand the manual E2E to the user**

This needs their Google Cloud project and test account, so an agent cannot complete it. List these for the user to run after deploying: connect; approve a leave and see the event within 2 minutes; change its dates; reject it; delete the event in Google, edit the leave again, and confirm the event comes back; set `sync_tasks` off and confirm deadlines leave; disconnect both ways; open CalendarPage as a non-test user and see the Demo data.

- [ ] **Step 3: Print the commit message**

`docs: add google connections setup`
