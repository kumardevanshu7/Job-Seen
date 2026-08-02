# JobSeen — Deep Project Details (A → Z)

> Personal reference doc for understanding, explaining, and debugging the whole product.  
> Brand: **Arigato Labs** · App: **JobSeen** · Stack: Astro + React + Firebase · Deploy: Vercel

---

## 1. Kya hai yeh project?

**JobSeen** ek personal + social **job-application tracker** hai.

Simple words mein: jab tum roz companies mein apply karte ho (online form, LinkedIn, walk-in call), Excel / Notes mein sab lose ho jata hai. JobSeen mein tum:

- har application save karte ho
- status update karte ho (pending → applied → interview → selected/rejected)
- peers se connect karke unki listings dekh / copy kar sakte ho (permission se)
- phone pe cold-call leads track karte ho (**Brute Force**)
- physical visit ke din ka order plan karte ho (**Walk-in Route**)

Client browser **seedha Firebase** se baat karta hai (Auth + Firestore). Koi custom Node/Express backend API nahi hai.

---

## 2. Need kyun padi? (Problem → Solution)

| Pain | JobSeen ka jawab |
|------|------------------|
| Spreadsheet mein status update bhool jata hai | Inbox + Kanban + status chips |
| Same job dusre friend ne bhi apply kiya — dubara type | Connections + **canCopy** permission + copy job |
| Call karke “no vacancy / switched off” yaad nahi | **Brute Force** call outcomes + interview schedule |
| Walk-in din pe kaunsi company pehle | **Walk-in Route** date + order |
| Delete/edit galati se / kisi ne console se try | **One Password** + Firestore rules proofs |
| Pure private + pure public dono extreme | Private data + public profile + connection-gated reads |

**Interview one-liner:**  
*“I built JobSeen because active job seekers (especially campus/fresher flow in India) juggle online applies, cold calls, and walk-ins — and existing trackers don’t cover that social + calling + route mix with real security.”*

---

## 3. Real life mein kaise kaam aata hai?

1. Subah Google se login → Inbox mein aaj / applied dates filter.
2. Nayi opening mili → **Add Job** (company, role, CTC, apply link, batch, bond, last date).
3. Apply kiya → status **Applied** (appliedAt set).
4. Phone list se companies call → **Brute Force** mein outcome (no response, switched off, resume sent, success + interview time).
5. Kal 3 walk-ins hain → **Walk-in Route** pe date pick, order set, map link open.
6. Friend se connection → Notifications → accept → Messages mein chat; Permissions mein unko **canCopy** do.
7. Unki listing copy → apne Inbox mein `copiedFrom…` ke saath aati hai.
8. Sensitive edit/delete → **One Password** challenge.

---

## 4. High-level architecture (kaise kaam karta hai)

```
Browser (Astro static pages + React islands)
    │
    ├── Firebase Auth (Google popup)
    ├── Firestore (all app data + security rules)
    └── Optional App Check (reCAPTCHA Enterprise)

Deploy: Astro `output: 'static'` → Vercel (rewrites + CSP)
Dev: `astro dev` / `astro dev --background`
```

- **Pages** = Astro routes (`src/pages/...`)
- **UI logic** = React components (`src/components/...`)
- **Data layer** = `src/lib/firestore.ts`, `auth.ts`, `security.ts`, `deletionProtection.ts`
- **Client state** = Nano Stores (`authStore`, `chatStore`, `notificationStore`)
- **Gatekeeping** = `AuthProvider` (login, username setup, admin claim, badges)
- **Truth for security** = `firestore.rules` (UI alone enough nahi)

---

## 5. Tech stack & tools

| Area | Tool |
|------|------|
| Framework | Astro 7 (static) |
| UI | React 19 + `@astrojs/react` |
| Styling | Tailwind CSS 4 + custom CSS variables |
| Icons | lucide-react |
| State | nanostores + `@nanostores/react` |
| Backend | Firebase Auth + Cloud Firestore |
| Optional | Firebase App Check |
| Admin SDK (dev) | firebase-admin (claims / scripts, not runtime client) |
| Hosting | Vercel (+ firebase.json for optional Firebase Hosting of `dist`) |
| PWA bits | `manifest.json`, `sw.js` |
| Version control | Git + GitHub |
| Rules / indexes | `firestore.rules`, `firestore.indexes.json` |
| IDE / AI | Cursor, browser DevTools |

**Env (`.env` / Vercel):**

- `PUBLIC_FIREBASE_API_KEY`
- `PUBLIC_FIREBASE_AUTH_DOMAIN`
- `PUBLIC_FIREBASE_PROJECT_ID`
- `PUBLIC_FIREBASE_STORAGE_BUCKET`
- `PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `PUBLIC_FIREBASE_APP_ID`
- `PUBLIC_FIREBASE_APPCHECK_SITE_KEY` (optional)

---

## 6. Features / modules (functions list)

### Auth & profile
- Google sign-in (`/login`)
- Username setup (immutable, `a-z0-9_`, 3–20)
- Public profile vs private user doc
- Sign out
- Admin gate via custom claim `admin` (`/admin`)

### Inbox (Home)
- List / multi-column grid / Kanban board
- Tabs: all / mine / copied
- Date filter: by added vs applied
- Status updates (incl. drag on board)
- Load-more pagination for performance
- Job detail route (`/job?id=` / `/jobs/:id` rewrite)

### Add Job
- Online job form (company, role, location, CTC, apply link, applied via, batch, bond, last date, employment type, internship months, PPO, N/A options where designed)
- Feature flag: walk-in create from Add Job currently **off** (`WALK_IN_ADD_JOB_ENABLED`)

### Brute Force Jobs
- Manual create + JSON import (batch)
- Call outcomes (not_called, no_response, wrong_number, switched_off, resume_sent, success, …)
- Interview mode/time; reschedule rules; selected/rejected decision
- Status chips with counts + filter
- Edit/delete protected by One Password
- Add lead to Walk-in Route

### Walk-in Route
- Day-wise route (`routeDate`)
- Ordered stops (`routeOrder`, `onRoute`)
- Add from existing jobs or BF leads (BF creates/updates `jobs/brute_route_…`)
- Map links

### Social
- User search (`/users`)
- Connection request / accept / decline
- Notifications
- Peer job view (`/users/[username]`)
- **Permissions**: per-connection `canCopy`
- Copy job (deterministic copy id; duplicate blocked)

### Chat
- DMs only with connections
- Unread badges
- Message create + mark read

### Settings
- Account basics
- **One Password** (1 question + 1 answer digest) for destructive / sensitive ops
- Permissions page

### Analytics
- Status / daily style views for own tracking

### Explore
- Arigato Labs about / legal surface

### Performance / UX extras
- `content-visibility` on cards
- Memoized grouping where needed
- Suggestion fetch one-shot in JobForm
- Feature flags in `src/lib/features.ts`

---

## 7. Routes map

| Path | Purpose |
|------|---------|
| `/login` | Google login |
| `/` | Inbox |
| `/add-job` | Create online job |
| `/walk-in` | Walk-in Route |
| `/brute-force` | Brute Force leads |
| `/analytics` | Analytics |
| `/users` | Find / connect users |
| `/users/[username]` | Peer profile jobs (rewrite → `_shell`) |
| `/job?id=` / `/jobs/:id` | Job details |
| `/chat` | Messages |
| `/notifications` | Connection requests |
| `/settings` | Settings + One Password |
| `/settings/permissions` | canCopy toggles |
| `/explore` | Brand / about |
| `/admin` | Admin-only shell |

---

## 8. Schemas — kaunse collections, kahan se bane

Schemas **code + rules se define** hue hain — alag ORM/Prisma nahi.

- Types & writers: `src/lib/firestore.ts` (+ related libs)
- Enforce shape / access: `firestore.rules`
- Query indexes: `firestore.indexes.json`
- Design process: product need → TypeScript types → create/update helpers → rules that match those writes

### 8.1 Identity

**`users/{uid}`** (private)  
`email`, `createdAt`, `updatedAt`

**`publicProfiles/{uid}`**  
`uid`, `username`, `displayName`, `photoURL`, `createdAt`, `updatedAt`

**`usernames/{username}`**  
`uid`, `createdAt` — unique username registry

### 8.2 Jobs — `jobs/{jobId}`

Important fields:  
`ownerUID`, `ownerUsername`, `company`, `role`, `location`, `ctc`, `applyLink`, `appliedVia`, `appliedViaOther`, `batch[]`, `bond`, `lastDate`, `copiedFromUID`, `copiedFromUsername`, `createdAt`, `status`, `appliedAt`, `statusUpdatedAt`, `reminderDismissedAt`, `cancelReason`, `jobType` (`online` | `walkin`), `mapLink`, `nearestMetro`, `routeOrder`, `onRoute`, `routeDate`, `employmentType`, `internshipMonths`, `ppo`

**Status values:**  
`pending`, `applied`, `in_progress`, `no_response`, `rejected`, `selected`, `interview_done`, `fraud`, `cancelled`

Special IDs:  
- Copy: `copy_{targetUID}_{sourceJobId}`  
- BF on route: `brute_route_{ownerUID}_{leadId}`

### 8.3 Brute Force — `bruteForceJobs/{leadId}`

`ownerUID`, `ownerUsername`, `company`, `phone`, `location`, `mapLink`, `role`, `callOutcome`, `decision`, `successAt`, `interviewMode`, `interviewAt`, `interviewRescheduledAt`, `statusHistory[]`, `createdAt`, `updatedAt`

**callOutcome examples:** `not_called`, `no_response`, `wrong_number`, `incoming_not_allowed`, `no_vacancies`, `not_connected`, `switched_off`, `resume_sent`, `success`  
**decision:** `pending` | `selected` | `rejected`

### 8.4 Social / chat

| Collection | Role |
|------------|------|
| `friendRequests/{uidA__uidB}` | pending / accepted / declined |
| `connections/{uidA__uidB}` | accepted pair |
| `permissions/{owner__to__grantee}` | `canCopy` |
| `notifications/{requestId}` | connection request alerts |
| `chats/{pairId}` | thread meta (`lastText`, `lastSenderUID`, …) |
| `chats/{chatId}/messages/{id}` | message body |

### 8.5 One Password

| Collection | Notes |
|------------|--------|
| `deletionQuestions/{uid}` | question text (owner can read) |
| `deletionSecrets/{uid}` | `answerDigest` SHA-256 — **client cannot read** |
| `deletionProofs/{uid}/targets/{kind}__{targetId}` | short-lived same-batch proof — **client cannot read** |

Default: `match /{document=**}` deny.

---

## 9. Security — kya steps, kaise liye

### Why
Firestore client-side exposed keys ke saath chal sakta hai; **rules = real backend ACL**. UI hide karna = security nahi.

### Steps taken

1. **Least privilege rules** — owner / connected peer / admin; default deny.
2. **Connection-gated job reads** — random user dusre ka job dump nahi dekh sakta.
3. **canCopy** — copy create tabhi jab `permissions` doc `canCopy == true`.
4. **One Password** — answer server pe plain nahi; SHA-256 digest. Delete/edit sensitive fields require same Firestore **batch** mein fresh `deletionProof` matching digest + version + `createdAt == request.time`.
5. **URL hardening** — apply/map links: HTTPS, no credentials (`user@host`), client `safeExternalUrl` + rules `httpsOrEmpty`.
6. **Chat** — only connected participants; `lastSenderUID` must be auth user; read receipts only by recipient.
7. **Deterministic IDs** — friend/connection pair IDs sorted UIDs — spoofy random IDs kam.
8. **Username immutability** — registry + rules after create.
9. **CSP / headers** on Vercel (XSS surface down); COOP-friendly for Google popup.
10. **Optional App Check** — bots / stolen keys misuse kam karne ke liye (env site key).
11. **Admin via custom claims** — not a public toggle in UI.

### How One Password works (flow)

1. User Settings mein Q + A set karta hai → question stored, answer → digest in `deletionSecrets`.
2. Delete/edit pe modal → user answer → client digest nikalta hai.
3. Batch: write proof doc + mutate job/BF doc.
4. Rules verify proof exists, digest matches secret, version matches, fresh timestamp.
5. Client secrets/proofs **read** nahi kar sakta — steal-and-reuse harder.

---

## 10. Auth flow (step-by-step)

1. `/login` → Google popup.
2. Authenticated → `/` under `AuthProvider`.
3. Load `publicProfiles`; legacy migrate if needed.
4. No username → `UsernameSetup` blocking UI.
5. Subscribe notifications + chat unread for connections.
6. Admin routes check `claims.admin`.
7. Sign-out → Firebase signOut → `/login`.

---

## 11. Important product flows (short)

**Online job:** form → validate HTTPS apply link → `createJob` → Inbox.

**Status change:** update `status` (+ `appliedAt` when applied); Kanban drag same path.

**Copy job:** connected + `canCopy` → transaction create `copy_…` doc → fail if duplicate.

**BF success:** set interview future time + mode → later selected/rejected; edit fields need One Password proof (`…_edit`).

**Route:** pick date → set `onRoute` / `routeOrder` / `routeDate`; BF lead may mirror into `jobs`.

---

## 12. Debugging playbook (fault aaye toh)

| Symptom | Check |
|---------|--------|
| Login popup fail / unauthorized domain | Firebase Auth → Authorized domains (`localhost`, Vercel host) |
| `permission-denied` on write | Rules published? One Password set? Proof in same batch? Field list allowed without proof? |
| Copy fails | Connection exists? `permissions` `canCopy` true? Already copied id? |
| Chat empty / can’t send | Both in `connections`? Participants array correct? |
| Missing index error | Console link → create index; or `firestore.indexes.json` deploy |
| Data “wrong” in UI | Firestore Console source of truth; listener errors in browser console |
| Admin page denied | Custom claim `admin` set + token refresh |
| Build ok, prod Firebase blank | Vercel `PUBLIC_*` env missing / wrong project |
| Google popup blocked | COOP/CSP headers; browser console |
| App Check hard fail locally | Site key / enforcement mode; disable enforce while developing |
| One Password “wrong” | Digest mismatch / question version changed / rules not deployed |

**Order of debug:** Browser console → Network → Firebase Console data → Rules Playground → Vercel logs/env → recent `firestore.rules` deploy.

Deploy rules reminder:

```bash
firebase deploy --only firestore:rules
```

---

## 13. Knowledge / skills isse milte hain

- Full-stack-ish app **bina custom API** (BaaS thinking)
- Firestore data modeling (pair IDs, copy IDs, denormalized usernames)
- **Security rules as backend** — batch proofs, field-level update constraints
- Auth (Google, custom claims, username registry)
- Astro islands + React hybrid
- Client state with Nano Stores
- Social graph: requests → connections → permissions → chat
- Product design for job-hunt workflows (online + call + walk-in)
- Deploy: static hosting + SPA-ish rewrites on Vercel
- Performance: pagination, content-visibility, avoid heavy listeners
- Threat modeling: client cannot be trusted; digest secrets; HTTPS link hygiene

---

## 14. Limitations / honest gaps (interview-ready)

- No dedicated server business logic beyond Firebase rules
- Admin user-management UI largely placeholder
- Online JSON import helpers exist in lib; UI may not expose all of them
- Walk-in create from Add Job currently feature-flagged off
- App Check optional / must be tuned carefully
- Real-time cost/scale depends on Firestore listeners & indexes
- Rules deploy alag step — code ship ≠ rules ship

---

## 15. Folder map (orientation)

```
src/pages/          → routes
src/components/     → React UI (jobs, auth, social, settings, …)
src/lib/            → firebase, firestore, auth, security, deletionProtection, features
src/stores/         → nanostores
src/layouts/        → AppLayout
firestore.rules     → security source of truth
firestore.indexes.json
public/             → PWA, icons, offline
```

---

## 16. Quick “elevator” summary

**JobSeen** = Arigato Labs ka job-hunt OS: track online applications, cold-call leads, plan walk-in days, connect with peers under permissioned copy + chat — secured by Firestore rules and One Password proofs, shipped as Astro static + React on Vercel with Firebase Auth/Firestore.
