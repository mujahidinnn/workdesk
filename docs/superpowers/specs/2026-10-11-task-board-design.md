# Task Board (Trello/Jira-style) Design

Tanggal: 2026-10-11
Status: menunggu review

## 1. Latar belakang dan tujuan

Daily log (`t_daily_tasks`) hanya mencatat 1 entri per orang per hari. Ia tidak bisa menjawab: goal-nya apa, dipecah jadi task/subtask apa, siapa yang di-assign, output yang diharapkan apa, langkah untuk mencapainya apa, siapa yang mencentang, dan apakah hasilnya sudah diverifikasi.

Tujuan: modul **Task Board** per project, mirip Trello/Jira, dengan:

- Card task multi-assignee, dibagi per divisi.
- Nested task tak terbatas (task > subtask > sub-subtask ...), tiap node punya deskripsi, expected output, dan checklist langkah.
- Validasi di database: siapa yang boleh centang, siapa yang boleh assign, dan task baru dianggap selesai setelah di-review.
- Drag-and-drop card dan kolom, pindah card antar kolom/board.
- Activity log otomatis, komentar @mention, notifikasi.
- Workload per user/divisi, dan daily log bisa ditautkan ke node task.

Daily log tetap ada dan tidak berubah perilakunya, hanya mendapat FK opsional ke task.

## 2. Keputusan

| Topik | Keputusan |
|---|---|
| Struktur board | 1 board per project (`m_projects`), kolom custom per board |
| Divisi | Tabel master baru `m_divisions` |
| Hierarki | Nested tak terbatas, adjacency list (`parent_id`) + `root_id` + `depth` |
| Checklist | Tiap node punya `t_task_steps` sendiri |
| Validasi selesai | Assignee centang, lalu ajukan review, reviewer/PIC approve atau reject |
| Hak assign | Assignee node itu atau ancestor-nya, PIC, admin. Unassign: yang meng-assign, PIC, admin |
| Urutan | `position numeric` (fractional), rebalance saat gap terlalu kecil |
| DnD | `@dnd-kit/core` + `@dnd-kit/sortable` (dependency baru, satu-satunya) |
| Penegakan aturan | RLS + trigger + RPC `SECURITY DEFINER`. UI hanya menyembunyikan aksi yang akan ditolak DB |
| Activity log | Trigger DB menulis ke `t_task_activity` |
| Overdue reminder | RPC `notify_my_overdue()` dipanggil client sekali saat app dibuka, idempotent per task per hari. Tanpa pg_cron |

## 3. Model data

Semua tabel di schema `public`, RLS aktif, masuk publication `supabase_realtime` bila disebut realtime.

### 3.1 Master

**`m_divisions`**: `id serial pk`, `name text unique not null`, `color text`, `is_active bool default true`, `created_at`.
Seed: Backend, Frontend, Mobile, UI/UX, QA, DevOps, PM.

**`m_employees`**: tambah `division_id int null references m_divisions(id) on delete set null`. Kolom `department` lama tidak disentuh.

**`m_project_members`**: tambah `member_role text not null default 'member' check (member_role in ('pic','member','reviewer'))`.

### 3.2 Board dan kolom

**`t_boards`**: `id serial pk`, `project_id int unique not null references m_projects on delete cascade`, `name text not null`, `background text`, `next_task_no int not null default 1`, `created_by uuid references profiles`, `created_at`.

Board dibuat otomatis saat pertama kali dibuka (RPC `ensure_board(project_id)`), dengan kolom default: Backlog, Current Sprint, Running, Bug, Ready to Test, Done (Done bertanda `is_done_column`).

**`t_board_columns`**: `id serial pk`, `board_id int not null references t_boards on delete cascade`, `name text not null`, `color text`, `position numeric not null`, `wip_limit int null`, `is_done_column bool default false`, `created_at`. Realtime.

Kolom yang masih berisi task tidak bisa dihapus (trigger menolak). Pindahkan dulu task-nya.

### 3.3 Task

**`t_tasks`** (semua level, realtime):

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | bigserial pk | |
| `board_id` | int not null fk `t_boards` cascade | |
| `column_id` | int null fk `t_board_columns` restrict | wajib untuk root (`parent_id is null`), null untuk child |
| `parent_id` | bigint null fk `t_tasks` cascade | |
| `root_id` | bigint not null | diisi trigger, = id sendiri bila root |
| `depth` | int not null default 0 | diisi trigger |
| `task_no` | int not null | diisi trigger dari `t_boards.next_task_no`, unik per board, tampil sebagai `#118` |
| `title` | text not null | |
| `description` | text | markdown |
| `expected_output` | text | wajib terisi sebelum `in_review` |
| `division_id` | int null fk `m_divisions` | |
| `priority` | text default 'medium' | check low/medium/high/urgent |
| `start_date`, `due_date` | date | |
| `estimate_hours` | numeric(6,2) | |
| `status` | text not null default 'todo' | check `todo,in_progress,in_review,done`. Status "ditolak" dibaca dari review terakhir |
| `position` | numeric not null | urutan di kolom (root) atau di antara sibling (child) |
| `created_by` | uuid fk profiles | diisi `auth.uid()` |
| `completed_at`, `completed_by` | timestamptz, uuid | diisi RPC review |
| `archived_at` | timestamptz | soft archive |
| `created_at`, `updated_at` | timestamptz | |

Index: `(board_id, column_id, position)`, `(parent_id, position)`, `(root_id)`, `(due_date) where status <> 'done'`.
Unique: `(board_id, task_no)`.

Trigger `tasks_before_write`:
- Isi `root_id`, `depth`, `task_no`, `created_by`, `updated_at`.
- Tolak `parent_id` yang membentuk siklus (cek ancestor via recursive CTE) atau berbeda board.
- Child selalu `column_id = null`. Root wajib `column_id` di board yang sama.
- Saat reparent, `root_id` dan `depth` seluruh subtree dihitung ulang.

**`t_task_assignees`**: `task_id bigint fk cascade`, `user_id uuid fk profiles`, `assigned_by uuid`, `assigned_at`, pk `(task_id, user_id)`. Realtime. User harus anggota `m_project_members` project tersebut.

**`t_task_reviewers`**: `task_id`, `user_id`, pk `(task_id, user_id)`. Bila kosong, reviewer = semua member ber-role `pic` atau `reviewer` di project.

**`t_task_steps`** (realtime): `id bigserial`, `task_id fk cascade`, `title text not null`, `note text`, `position numeric`, `is_done bool default false`, `done_by uuid`, `done_at timestamptz`, `created_by uuid`, `created_at`.
Trigger mengisi `done_by = auth.uid()`, `done_at = now()` saat `is_done` berubah, dan mengosongkannya saat di-uncheck.

**`t_task_reviews`**: `id`, `task_id fk cascade`, `reviewer_id uuid`, `decision text check (approved, rejected)`, `note text`, `created_at`. Insert hanya lewat RPC `review_task`.

**`t_task_activity`**: `id bigserial`, `task_id fk cascade`, `root_id bigint`, `actor_id uuid`, `action text`, `detail jsonb`, `created_at`. Insert hanya oleh trigger (`SECURITY DEFINER`), tidak ada policy insert untuk client.
Action: `created, updated(field,from,to), moved(column_from,column_to), reparented, assigned, unassigned, step_checked, step_unchecked, step_added, submitted_review, approved, rejected, archived, commented`.

**`t_task_labels`** (`id`, `board_id`, `name`, `color`) dan **`t_task_label_map`** (`task_id`, `label_id`, pk keduanya).

**`t_board_task_comments`**: `id`, `task_id fk t_tasks cascade`, `user_id uuid`, `comment text`, `mentions uuid[]`, `created_at`, `edited_at`. Tabel terpisah dari `t_task_comments` agar trigger mention lama (link `/issues`) tidak berubah.

**`t_board_task_attachments`**: `id`, `task_id`, `file_path`, `file_name`, `uploaded_by`, `created_at`. Pakai bucket `task-attachments` yang sudah ada dengan prefix `board/{task_id}/`. Policy storage ditambah untuk prefix itu.

**`t_daily_tasks`**: tambah `board_task_id bigint null references t_tasks(id) on delete set null`, index.

### 3.4 View

- **`v_task_progress`**: per task, `steps_total`, `steps_done`, `children_total`, `children_done`, `progress_pct` (rekursif, subtree penuh). Dipakai untuk badge `x/y` dan progress bar.
- **`v_task_workload`**: per `user_id`, `division_id`, `board_id`, berisi jumlah `todo`, `in_progress`, `in_review`, `overdue`, dan `done_7d`. Hanya node yang di-assign langsung ke user, tidak termasuk yang di-archive.

Kedua view `security_invoker = true` agar RLS tabel dasar tetap berlaku.

## 4. Aturan akses

Helper SQL baru (stable, `SECURITY DEFINER`, `search_path` dikunci):

- `board_project(board_id) -> int`
- `is_project_member(project_id)`, `is_project_pic(project_id)` (role `pic` atau `is_admin()`)
- `is_task_assignee(task_id)`: user adalah assignee di node itu **atau di salah satu ancestor**
- `can_review_task(task_id)`: ada di `t_task_reviewers`, atau (tabel itu kosong dan user ber-role pic/reviewer), atau admin. **Dan** user bukan assignee langsung node itu.

Feature key baru `board` di `m_features`, dengan izin default disalin dari `daily-report`.

| Aksi | Siapa |
|---|---|
| Lihat board/task | `has_permission('board','read')` dan (member project atau admin) |
| Buat task root | `has_permission('board','create')` dan member project |
| Buat subtask | assignee node parent, PIC, admin |
| Edit judul/deskripsi/output/due/divisi | assignee node itu atau ancestor, pembuat, PIC, admin |
| Pindah kolom / reorder (RPC `move_task`) | assignee, PIC, admin |
| Kelola kolom & label | PIC, admin |
| Tambah assignee | `is_task_assignee`, PIC, admin. Target harus member project |
| Hapus assignee | `assigned_by = auth.uid()`, PIC, admin |
| Tambah/edit/hapus step | assignee, PIC, admin |
| Centang step | `is_task_assignee`, PIC, admin |
| Status `todo <-> in_progress` | assignee, PIC, admin |
| Status ke `in_review` (RPC `submit_review`) | assignee. Syarat: semua step done, semua child `done`, `expected_output` terisi |
| Approve -> `done`, reject -> `in_progress` (RPC `review_task`) | `can_review_task`. Reject wajib catatan, tercatat `rejected` di `t_task_reviews`, card menampilkan badge Ditolak sampai diajukan ulang |
| Root masuk kolom `is_done_column` | hanya bila `status = 'done'` |
| Archive / hapus | pembuat (bila belum ada child/assignee lain), PIC, admin |

Kolom `status`, `completed_at`, `completed_by` tidak bisa diubah lewat UPDATE langsung. Trigger menolak, kecuali flag sesi lokal yang di-set oleh RPC.

Setiap edit pada step atau child yang sudah `done` membuat parent `done` kembali ke `in_progress` (trigger), agar status tidak bohong.

## 5. RPC

| RPC | Fungsi |
|---|---|
| `ensure_board(p_project_id)` | buat board + kolom default bila belum ada, return board |
| `move_task(p_task_id, p_column_id, p_before_id, p_after_id)` | pindah/reorder root, hitung `position` di antara tetangga, rebalance kolom bila gap < 1e-6 |
| `reparent_task(p_task_id, p_new_parent_id, p_before_id, p_after_id)` | pindah node dalam pohon (termasuk promote ke root dengan `column_id`) |
| `move_step(p_step_id, p_before_id, p_after_id)` | reorder checklist |
| `submit_review(p_task_id)` | validasi syarat, set `in_review`, notifikasi reviewer |
| `review_task(p_task_id, p_decision, p_note)` | approve/reject, set status, isi `completed_*`, notifikasi assignee |
| `notify_my_overdue()` | untuk `auth.uid()` saja, buat notifikasi overdue sekali per task per hari |

## 6. Notifikasi

Trigger ke `t_notifications` (sudah realtime dan bersuara di client), link `/boards/{board_id}?task={task_no}`:

- Di-assign atau di-unassign (ke user target, kecuali dirinya sendiri).
- `submit_review` (ke reviewer).
- Approved atau rejected (ke assignee langsung, dengan catatan reviewer).
- @mention di komentar board.
- Overdue (lewat `notify_my_overdue`).

## 7. Frontend

Dependency baru: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

### 7.1 Rute (`src/router.tsx`, `guarded("board")`)

- `/boards` -> `BoardsPage.tsx`: grid project yang user ikuti, dengan progres, jumlah open/overdue, dan avatar anggota. Klik memanggil `ensure_board`.
- `/boards/:boardId` -> `BoardPage.tsx`: tampilan Board / List / Workload. `?task=<task_no>` membuka detail.
- `/my-tasks` -> `MyTasksPage.tsx`: node yang di-assign ke saya, dikelompokkan Overdue / Hari ini / Minggu ini / Lainnya, plus tab "Perlu saya review".

Sidebar dan CommandPalette ditambah entri. Tabel fitur di GUIDELINE.md diperbarui.

### 7.2 Hooks (`src/hooks/`, satu file per hal)

`useBoards`, `useBoard` (board + kolom + root tasks + progress, plus realtime per board via `subscribeShared`), `useTaskTree` (subtree satu root), `useTaskMutations` (create/update/archive, assign/unassign, move/reparent, submit/review), `useTaskSteps`, `useTaskActivity`, `useBoardTaskComments`, `useBoardTaskAttachments`, `useTaskWorkload`, `useMyTasks`, `useDivisions`.

DnD memakai optimistic update di cache React Query, dan rollback bila RPC gagal (toast error).

### 7.3 Komponen (`src/components/board/`)

- `BoardHeader`: nama, avatar member, filter (assignee, divisi, label, due, "punya saya"), search, view switcher.
- `BoardColumns`: `DndContext`, kolom sortable horizontal, card sortable vertikal antar kolom. Indikator WIP limit.
- `ColumnHeader`: rename, warna, WIP, hapus (PIC).
- `TaskCard`: `#no`, judul, chip divisi, label, due, progres `x/y`, jumlah subtask, badge review, avatar assignee.
- `TaskDetailDialog`: dua panel, panel kiri berisi:
  - `TaskBreadcrumb`, `TaskStatusBar` (tombol Ajukan review / Approve / Reject sesuai hak)
  - `TaskMetaFields` (assignee picker, reviewer, divisi, due, estimasi, label)
  - `TaskDescription`, `TaskExpectedOutput`
  - `TaskSteps` (checklist sortable, menampilkan siapa yang mencentang dan kapan, disabled bila tidak berhak)
  - `TaskSubtree` (pohon expandable, tambah inline, drag untuk reorder/reparent, klik membuka node di dialog yang sama)
  - `TaskAttachments` dan `TaskDailyLogs`
- Panel kanan `TaskDetailDialog`: tab `TaskComments` / `TaskActivityFeed`.
- `MoveTaskMenu`: pindah kolom/board tanpa drag (keyboard & mobile).
- `ReviewDialog`: approve/reject + catatan.
- `WorkloadTable`: user x status, group per divisi, heat color. Klik angka memfilter board.

Komponen lama yang bisa dipakai ulang: `UserAvatar`, `EmptyState`, `DeleteConfirmationModal`, `date-picker-field`, `PresenceDot`, pola `TaskAttachments` dan `TaskComments` (diparameterkan via hook, bukan diduplikasi bila perubahan kecil).

### 7.4 Lib murni (`src/lib/`)

- `taskTree.ts`: `buildTaskTree(rows)`, `flattenVisible(tree, expanded)`, `computeProgress(node)`.
- `position.ts`: `positionBetween(before, after)`, `needsRebalance`.
- `taskPermissions.ts`: `canEditTask`, `canCheckStep`, `canAssign`, `canUnassign`, `canSubmitReview`, `canReview`. Cermin aturan DB, hanya untuk menyembunyikan aksi.

### 7.5 Integrasi daily log

- `TaskFormDialog` dapat field opsional "Task terkait": combobox node yang di-assign ke saya, dengan pencarian `#no` atau judul.
- `DailyReportTable` dan kanban menampilkan chip `#no` yang membuka detail task.
- `TaskDetailDialog` menampilkan daftar log harian tertaut.
- Dashboard: widget workload ringkas dari `v_task_workload`.

## 8. Error handling

- Pesan error RPC/trigger memakai `raise exception using errcode = 'P0001', message = '<kalimat untuk user>'`. Client menampilkannya di toast apa adanya.
- DnD gagal: rollback posisi + toast.
- Konflik edit bersamaan: last-write-wins per field. Realtime me-refresh data, dan activity feed menunjukkan siapa yang mengubah.

## 9. Testing

**`supabase/tests/security_smoke.sql`**, kasus baru:
- Non-assignee mencentang step: ditolak.
- Assignee ancestor mencentang step child: diizinkan.
- Assign user non-member project: ditolak.
- Unassign oleh bukan `assigned_by`/PIC: ditolak.
- UPDATE langsung `status = 'done'`: ditolak.
- `submit_review` dengan step belum selesai atau `expected_output` kosong: ditolak.
- Assignee approve task sendiri: ditolak.
- Root masuk kolom done saat status bukan `done`: ditolak.
- Reparent yang membuat siklus: ditolak.
- Insert langsung ke `t_task_activity`: ditolak.

**Vitest**: `taskTree`, `position`, `taskPermissions`.

**Manual**: `pnpm dev`. Cek DnD kolom/card/step/subtree, realtime di dua tab dengan dua user, alur assign > centang > review > approve/reject > done, notifikasi, dan tampilan mobile.

## 10. Di luar scope

Sprint/iteration management, time tracking per sesi, dependency antar task (blocks/blocked-by), recurring task, custom field, template board, export. Bisa ditambah kemudian di atas model ini.

## 11. Urutan implementasi (milestone)

1. Migrasi master (divisi, member_role, feature `board`) + board/kolom/task/assignee/steps + helper + RLS + trigger + smoke test.
2. RPC move/reparent/review + activity + notifikasi + view progress/workload.
3. Lib murni + test.
4. Halaman boards, board dengan DnD, dan detail card (meta, steps, subtree).
5. Komentar, lampiran, activity feed, review dialog.
6. My Tasks, Workload, integrasi daily log, dashboard widget, GUIDELINE update.
