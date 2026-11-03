# Google Connections + Calendar Sync Design

Tanggal: 2026-10-12
Status: menunggu review

## 1. Latar belakang dan tujuan

WorkDesk belum terhubung ke layanan luar. Jadwal cuti, lembur/dinas, deadline task dan libur kantor hanya terlihat di dalam app, sehingga karyawan mencatat ulang di Google Calendar pribadinya. Agenda pribadi di Google juga tidak terlihat saat merencanakan pekerjaan di WorkDesk.

Tujuan sub-proyek ini:

- **Hub Connections**: tiap user bisa menghubungkan akun Google-nya di halaman profil, melihat status, dan memutusnya.
- **Infra OAuth Google** yang dipakai ulang oleh sub-proyek Drive dan Photos.
- **Calendar push**: cuti/lembur/dinas yang disetujui, deadline task, dan libur kantor otomatis tampil di kalender Google "WorkDesk" milik user.
- **Calendar overlay**: event dari kalender primary user tampil read-only di CalendarPage.
- **Demo mode**: pengunjung live demo yang bukan test user Google tetap bisa mencoba alurnya dengan data simulasi.

Sub-proyek berikutnya (spec terpisah): **Drive** (lampiran via Google Picker, simpan link) lalu **Photos** (Picker API, foto disalin ke Storage).

## 2. Keputusan

| Topik | Keputusan |
|---|---|
| Provider | Google saja |
| Pemilik koneksi | Per user, satu akun Google per user WorkDesk untuk semua service |
| Arah sync | WorkDesk → Google (push) untuk data WorkDesk; Google → WorkDesk hanya overlay read-only. WorkDesk sumber kebenaran |
| Edit di Google | Event milik WorkDesk yang diedit di Google ditimpa saat sync berikutnya; yang dihapus dibuat ulang |
| Runtime backend | Supabase Edge Functions (bukan Vercel `/api`) |
| Penyimpanan token | Refresh token di Supabase Vault; tabel referensi tanpa policy RLS (service role saja) |
| Login Supabase via Google | Tidak dipakai (`linkIdentity` tidak menyimpan/refresh provider token) |
| Penjadwalan push | Tabel outbox diisi trigger, diproses `pg_cron` + `pg_net` tiap menit |
| Kalender tujuan | Kalender sekunder "WorkDesk" dibuat app, bukan primary |
| Scope Calendar | `calendar.app.created` + `calendar.events.readonly` (+ `openid email`) |
| Status app Google | Mode Testing (maks 100 test user, refresh token kedaluwarsa 7 hari). Tidak mengajukan verifikasi |
| Demo | Email WorkDesk di luar secret `GOOGLE_TEST_EMAILS` mendapat koneksi `status='demo'` dengan data fixture |
| Zona waktu event | `Asia/Jakarta` (sama dengan DB) |

## 3. Model data

Satu migrasi baru `supabase/migrations/20261104000000_google_connections.sql`. Mengaktifkan extension `pg_cron`, `pg_net`, `supabase_vault` bila belum.

### 3.1 `t_google_connections`

| Kolom | Tipe | Catatan |
|---|---|---|
| `user_id` | uuid PK → `profiles(id)` ON DELETE CASCADE | |
| `google_email` | text | null saat `demo` |
| `scopes` | text[] NOT NULL DEFAULT '{}' | scope yang sudah diberikan |
| `status` | text CHECK IN (`active`,`error`,`demo`) | |
| `workdesk_calendar_id` | text | id kalender sekunder |
| `sync_leave` / `sync_overtime` / `sync_tasks` / `sync_holidays` | boolean DEFAULT true | |
| `show_overlay` | boolean DEFAULT true | |
| `last_error` | text | pesan untuk UI |
| `last_synced_at` | timestamptz | |
| `connected_at` | timestamptz DEFAULT now() | |

RLS: `SELECT` dan `UPDATE` hanya baris sendiri. `UPDATE` dibatasi ke kolom toggle: `REVOKE INSERT, UPDATE, DELETE ON t_google_connections FROM authenticated, anon` (Supabase memberi grant penuh secara default), lalu `GRANT UPDATE (sync_leave, sync_overtime, sync_tasks, sync_holidays, show_overlay) TO authenticated`. Insert/delete hanya service role (Edge Function). Disconnect = hapus baris.

### 3.2 `t_google_tokens`

`user_id uuid PK → profiles ON DELETE CASCADE`, `vault_secret_id uuid NOT NULL`. RLS aktif tanpa policy. Akses hanya lewat fungsi `SECURITY DEFINER` `google_token_get(uid)` / `google_token_set(uid, token)` / `google_token_delete(uid)` yang di-`REVOKE` dari `anon` dan `authenticated`.

### 3.3 `t_calendar_links`

`(user_id, source_type, source_id)` PK, `google_event_id text NOT NULL`, `updated_at`. `source_type` CHECK IN (`leave`,`overtime`,`task`,`holiday`). Tanpa policy (service role).

### 3.4 `t_calendar_outbox`

| Kolom | Tipe |
|---|---|
| `id` | bigserial PK |
| `user_id` | uuid NOT NULL |
| `source_type` | text (sama dengan 3.3) |
| `source_id` | bigint NOT NULL |
| `op` | text CHECK IN (`upsert`,`delete`) |
| `attempts` | int DEFAULT 0 |
| `next_attempt_at` | timestamptz DEFAULT now() |
| `failed` | boolean DEFAULT false |
| `last_error` | text |

Unique parsial `(user_id, source_type, source_id) WHERE NOT failed`. Enqueue memakai `ON CONFLICT DO UPDATE SET op = EXCLUDED.op, attempts = 0, next_attempt_at = now()` sehingga perubahan beruntun dikompres jadi satu baris. Tanpa policy (service role).

### 3.5 Trigger enqueue

Semua trigger hanya enqueue untuk user yang punya koneksi `status='active'` dan toggle yang relevan menyala. Fungsi bersama `calendar_enqueue(uid, type, id, op)`.

| Tabel | Kondisi | Op |
|---|---|---|
| `t_leave_requests` | status menjadi `Approved`, atau tanggal berubah saat `Approved` | upsert |
| `t_leave_requests` | status keluar dari `Approved`, atau baris `Approved` dihapus | delete |
| `t_overtime_business_trips` | sama seperti cuti | upsert / delete |
| `t_tasks` | `due_date` atau judul berubah, untuk tiap assignee | upsert (delete bila `due_date` null atau status `done`) |
| `t_task_assignees` | insert / delete assignee | upsert / delete untuk user itu |
| `m_holidays` | insert / update / delete | fan-out ke semua user `sync_holidays` |

Toggle di `t_google_connections` berubah → trigger enqueue backfill (menyala) atau delete semua link bertipe itu (mati).

## 4. Edge Functions

Semua di `supabase/functions/`, memakai `_shared/cors.ts`. Logika murni (pemetaan event, backoff) di `supabase/functions/_shared/calendarEvent.ts` dan dites dengan vitest.

Secret baru: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_STATE_SECRET`, `GOOGLE_TEST_EMAILS` (dipisah koma), `APP_URL`, `CRON_SECRET` (sudah ada di Vercel, disalin ke Supabase).

### 4.1 `google-oauth` (`verify_jwt = false`, auth manual per action)

- `POST start {service}` (wajib JWT): jika email user tidak ada di `GOOGLE_TEST_EMAILS` → upsert koneksi `demo`, balas `{demo: true}`. Selain itu buat PKCE verifier dan `state = base64(user_id, nonce, exp 10 menit, service, verifier) + HMAC`, balas URL auth Google dengan `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`, scope sesuai service.
- `GET callback?code&state`: validasi HMAC dan exp, tukar code (dengan verifier), ambil email dari id_token, simpan refresh token via `google_token_set`, upsert koneksi `active`, buat kalender "WorkDesk" bila belum ada, enqueue backfill, redirect ke `${APP_URL}/settings/profile?connected=calendar`. Gagal → redirect dengan `?connect_error=<kode>`.
- `POST disconnect {deleteCalendar?: boolean}` (wajib JWT): revoke token di Google (abaikan error), opsional hapus kalender "WorkDesk", hapus token, links, outbox, dan baris koneksi.

### 4.2 `google-calendar` (`verify_jwt = true`)

- `GET events?from&to`: untuk koneksi `active`, ambil event kalender primary (`singleEvents=true`, `orderBy=startTime`, maks 250), kembalikan `{id, title, start, end, allDay, htmlLink}`. Untuk `demo`, kembalikan fixture tetap yang digeser ke bulan yang diminta. Kalender "WorkDesk" tidak ikut dibaca.

### 4.3 `google-calendar-sync` (`verify_jwt = false`, header `Authorization: Bearer CRON_SECRET`)

1. Ambil ≤ 50 baris outbox `NOT failed AND next_attempt_at <= now()` dengan `FOR UPDATE SKIP LOCKED` (lewat RPC `calendar_outbox_claim(50)`).
2. Kelompokkan per user, minta access token sekali per user.
3. `upsert`: baca sumber terbaru dari DB. Sumber hilang → perlakukan sebagai `delete`. Ada link → `events.patch`, 404/410 → `events.insert` lalu perbarui link. Tidak ada link → `events.insert`.
4. `delete`: `events.delete` (404/410 dianggap sukses), hapus link.
5. Sukses → hapus baris outbox, set `last_synced_at`.
6. Gagal → `attempts + 1`, `next_attempt_at = now() + min(2^attempts menit, 60 menit)`, `failed = true` setelah 8 kali.
7. `invalid_grant` → koneksi `status='error'`, `last_error='reconnect'`, satu `t_notifications` ("Koneksi Google terputus, hubungkan ulang"), lewati sisa baris user itu tanpa menambah attempts.

`pg_cron` job `calendar-sync` tiap menit: `net.http_post` ke function ini dengan header secret. Koneksi `demo` tidak pernah di-enqueue.

### 4.4 Format event

| Sumber | Event |
|---|---|
| Cuti/izin/sakit | All-day `start_date`..`end_date + 1`, judul `Cuti: <type>` |
| Lembur | `date start_time`–`end_time` di `Asia/Jakarta`; tanpa jam → all-day |
| Dinas | All-day `date`..`coalesce(end_date, date) + 1` |
| Deadline task | All-day `due_date`, judul `[Deadline] <title>` |
| Libur | All-day `date`, judul `<name>` |

Semua event: `description` berisi link `${APP_URL}/...` ke halaman sumber, `extendedProperties.private = {workdesk_source: "<type>:<id>"}`, `transparency = transparent` kecuali cuti dan dinas (`opaque`).

## 5. Frontend

### 5.1 Halaman profil

Section baru **Connections** di [ProfileSettingsPage.tsx](../../../src/pages/ProfileSettingsPage.tsx), komponen `src/components/connections/ConnectionsSection.tsx` + `GoogleCalendarCard.tsx`.

- Belum terhubung: tombol **Hubungkan Google Calendar**.
- `active`: "Terhubung sebagai x@gmail.com", sync terakhir, 4 toggle sync + toggle overlay, tombol **Putuskan** (dialog konfirmasi dengan checkbox "hapus juga kalender WorkDesk").
- `error`: pesan + tombol **Hubungkan ulang**.
- `demo`: badge "Demo", penjelasan singkat bahwa data disimulasikan.
- Query `?connected=` / `?connect_error=` → toast, lalu dibersihkan dari URL.

Kartu Drive dan Photos tampil sebagai "Segera hadir" sampai sub-proyeknya selesai.

### 5.2 Hooks (`src/hooks/useGoogleConnection.ts`)

`useGoogleConnection()` (select baris sendiri), `useConnectGoogle(service)` (panggil `start`, lalu `window.location.assign(url)` atau invalidate bila demo), `useDisconnectGoogle()`, `useUpdateConnectionToggles()`, `useGoogleEvents(month)` (`staleTime` 5 menit, nonaktif bila tidak terhubung atau `show_overlay` mati).

### 5.3 CalendarPage

[CalendarPage.tsx](../../../src/pages/CalendarPage.tsx) menampilkan event Google sebagai penanda warna berbeda di grid dan masuk ke daftar agenda dengan label "Google". Read-only, klik membuka `htmlLink` di tab baru (demo: tidak ada link).

### 5.4 i18n

Semua string baru di `src/locales/id.json` dan `en.json` di bawah kunci `connections.*`.

## 6. Keamanan

- Refresh token tidak pernah keluar dari Edge Function dan Vault; client tidak bisa membaca `t_google_tokens`, links, atau outbox.
- `state` OAuth ditandatangani HMAC, kedaluwarsa 10 menit, terikat ke user_id; PKCE wajib.
- `google-calendar-sync` menolak request tanpa `CRON_SECRET`.
- Scope minimal: app tidak bisa mengubah kalender user selain kalender yang dibuatnya.
- CSP tidak berubah: semua panggilan Google lewat Edge Function.

## 7. Error handling

| Kasus | Penanganan |
|---|---|
| User menolak consent | Callback `?error=access_denied` → redirect `connect_error=denied`, toast |
| `state` invalid/kedaluwarsa | Redirect `connect_error=state` |
| Refresh token kedaluwarsa (Testing 7 hari) / dicabut | `status='error'`, notifikasi, outbox dijeda sampai connect ulang |
| Google 429/5xx | Backoff (4.3 langkah 6) |
| Kalender "WorkDesk" dihapus user | Insert gagal 404 → buat ulang kalender, enqueue ulang backfill |
| Overlay gagal | Kalender WorkDesk tetap tampil, banner kecil "Event Google tidak dapat dimuat" |

## 8. Testing

- **SQL smoke** `supabase/tests/connections_smoke.sql`:
  - User A tidak bisa select koneksi B, tidak bisa select `t_google_tokens`/links/outbox, tidak bisa update kolom selain toggle.
  - Cuti `Pending → Approved` meng-enqueue `upsert`; `Approved → Rejected` dan delete meng-enqueue `delete`; enqueue beruntun dikompres jadi satu baris.
  - User tanpa koneksi aktif tidak di-enqueue; koneksi `demo` tidak di-enqueue.
  - Toggle `sync_holidays` mati meng-enqueue `delete` untuk link holiday.
  - `calendar_outbox_claim` tidak mengembalikan baris yang sama ke dua pemanggil.
- **Vitest** `src/lib/__tests__/calendarEvent.test.ts` (mengimpor `supabase/functions/_shared/calendarEvent.ts` lewat path relatif; modul itu tanpa import Deno agar jalan di Node): pemetaan tiap sumber ke payload event (all-day end eksklusif, lembur tanpa jam, dinas tanpa end_date) dan fungsi backoff.
- **Manual E2E** dengan satu akun test Google: connect, approve cuti, cek event muncul ≤ 2 menit, ubah tanggal, reject, disconnect.

## 9. Di luar scope

- Drive dan Photos (spec terpisah).
- Tulis balik perubahan Google ke WorkDesk, webhook/watch channel.
- Provider selain Google.
- Verifikasi app oleh Google.
- Koneksi level organisasi / akun Google bersama.

## 10. Urutan implementasi

1. Migrasi: tabel, fungsi token Vault, trigger enqueue, RPC claim, SQL smoke.
2. `_shared/calendarEvent.ts` + vitest.
3. `google-oauth` (start, callback, disconnect, demo).
4. `google-calendar-sync` + job `pg_cron`.
5. `google-calendar` overlay.
6. Frontend: hooks, ConnectionsSection, CalendarPage overlay, i18n.
7. Setup Google Cloud Console (OAuth client, redirect URI, test users) didokumentasikan di README.
