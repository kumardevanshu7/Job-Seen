# JobSeen Security Fixes — Kya Kiya Aur Kyun

Yeh document uss security audit ka follow-up hai jo JobSeen codebase pe kiya gaya tha. Har fix ke saath simple explanation hai — **kya problem thi, kya kiya, aur yeh important kyun hai** — taaki aap apne future vibe-coded projects mein bhi yeh patterns follow kar sakein.

Yeh guide un logon ke liye likha gaya hai jo Firebase/Firestore jaisa backend-as-a-service use karte hain aur AI se code likhwate hain. Concepts generic hain — kisi bhi app pe apply hote hain.

---

## Sabse Important Baat Samjho Pehle

Jab aapka app directly browser se Firebase/Firestore ko call karta hai (jaisa JobSeen karta hai), toh **aapka client-side code security nahi hai**. React component mein `if (isOwner)` likhna sirf UI ke liye hai — koi bhi browser console khol ke, ya Firestore SDK directly use karke, uss check ko bypass kar sakta hai.

**Real security hamesha server-side rule mein honi chahiye** — yahan `firestore.rules` file mein. Yeh file decide karti hai ki database mein kaun kya read/write kar sakta hai, chahe client code kuch bhi kahe.

Is audit mein sabse bada issue yehi tha: UI checks the rahi thi ("connected users hi dekh sakte hain"), lekin actual Firestore rules sab authenticated users ko sab kuch dekhne de rahi thi.

---

## 1. Jobs — Sab Log Sabka Data Dekh Sakte The

**Problem:** Firestore rule mein likha tha `resource.data.ownerUID != request.auth.uid` — yeh condition har us job ke liye true hai jo aapki nahi hai. Matlab practically **koi bhi logged-in user kisi bhi user ki saari jobs read kar sakta tha**, chahe unki connection ho ya na ho.

**Fix:** Rule ko badla — ab sirf teen log job read kar sakte hain:
- Job ka owner
- Admin
- Woh users jo owner se **connected** hain (verified via Firestore, not client claim)

**Kyun important hai:** UI mein "connected users only" likhna sirf appearance hai. Agar backend rule loose hai, toh attacker Firebase SDK se directly query bhejkar sab data nikaal sakta hai — UI dikhata hi nahi, par data leak ho jaata hai. **Rule hamesha UI se zyada strict ya barabar honi chahiye, kabhi loose nahi.**

---

## 2. Connections Aur Friend Requests — Koi Bhi Fake Connection Bana Sakta Tha

**Problem:** Firestore rule sirf yeh check karti thi ki user logged-in hai — kisi bhi do users ke beech fake "connection" document create kiya ja sakta tha. Isse attacker apne aapko kisi aur user se "connected" dikha sakta tha aur unki private jobs access kar sakta tha.

Documents random IDs (`addDoc`) se banaye jaate the, jisse duplicate/race conditions bhi ho sakti thi — jaise ek hi request do baar accept ho jaana.

**Fix:**
- **Deterministic IDs** use kiye — jaise `uidA__uidB` (sorted). Ab ek pair ke beech sirf ek hi connection/request document ban sakta hai, naturally duplicate rok jaata hai.
- Connection creation ko sirf tab allow kiya jaata hai jab ek **accepted friend request** already exist karta ho — yeh check Firestore rule ke `getAfter()` function se transaction ke andar hi verify hota hai.
- Sender/receiver fields immutable banaye — koi bhi request ke baad `senderUID` ya `receiverUID` change nahi kar sakta.

**Kyun important hai:** Jab bhi aapke app mein "User A aur User B ka rishta" jaisi cheez ho (friends, followers, connections), uska ID **predictable/deterministic** rakho aur uska creation kisi **verified event** (jaise accepted request) se link karo. Random IDs se aapka data model unpredictable ho jaata hai aur rules likhna mushkil ho jaata hai.

---

## 3. Notifications — Koi Bhi Fake Notification Bhej Sakta Tha

**Problem:** Koi bhi authenticated user arbitrary `senderUID`, fake naam, aur fake receiver ke saath notification create kar sakta tha. Isse impersonation aur spam dono possible the.

**Fix:** Notification creation ab strictly validate karta hai:
- `senderUID` request bhejne wale ke apne UID se match kare
- Ek corresponding pending friend request already exist kare
- Sender ka naam/username unke apne public profile se match kare (koi fake naam nahi daal sakta)

**Kyun important hai:** Jab bhi ek user doosre user ko kuch "bhejta" hai (notification, message, invite), rule mein verify karo ki data authentic hai — sirf format check karna kaafi nahi, **origin verify karna** zaroori hai.

---

## 4. User Data — Email Aur Private Info Sabko Dikh Rahi Thi

**Problem:** `users/{uid}` collection mein email, aur ek weak "delete PIN hash" tha, lekin rule `allow read: if isAuth()` thi — matlab **har logged-in user kisi bhi user ka email dekh sakta tha**.

**Fix:** Data ko **do collections mein split kiya**:
- `users/{uid}` — private data (email). Sirf owner ya admin isse read kar sakta hai.
- `publicProfiles/{uid}` — public data (username, display name, photo). Yeh sab logged-in users read kar sakte hain, kyunki app ko social features (search, chat, jobs share) ke liye yeh chahiye.
- `usernames/{username}` — ek chhota "registry" collection jo username → uid map karta hai, taaki username uniqueness guaranteed ho (race condition ke bina).

**Kyun important hai:** Yeh ek **bahut common pattern** hai jo har app mein use hona chahiye: **"public" data aur "private" data ko alag documents/collections mein rakho.** Kabhi bhi ek document mein private field (email, phone, address, payment info) aur public field (username, bio) mix mat karo — kyunki jaise hi aapko public data expose karna padega (jo social apps mein hota hi hai), private data bhi leak ho jaayega.

---

## 5. Delete PIN — Yeh Security Nahi Thi, Sirf Illusion Thi

**Problem:** App mein ek "4-digit secret code" tha jo job delete karne se pehle maanga jaata tha. Lekin:
- Sirf 10,000 possible combinations (0000–9999) — trivially guessable
- Iska hash bhi usi document mein store tha jo sab log read kar sakte the
- Firestore rules mein koi enforcement nahi tha — koi bhi Firestore SDK se directly `deleteJob()` call kar sakta tha, PIN ke bina

**Fix:** PIN system ko **poori tarah hata diya** aur ek simple confirmation dialog (jo already app mein tha — `ConfirmModal`) use kiya. Real protection ab Firestore rule se aata hai: **sirf job ka owner (ya admin) delete kar sakta hai** — yeh verify hota hai server-side, PIN se nahi.

**Kyun important hai:** Yeh ek zaroori lesson hai — **"lagta hai secure" aur "actually secure" alag cheezein hain.** Agar security check sirf client-side UI mein hai (jaise ek modal jo PIN maangta hai), aur backend usse enforce nahi karta, toh woh security **decoration** hai, protection nahi. Asli security control hamesha aisi jagah honi chahiye jahan attacker usse bypass na kar sake — yaani server/rules mein.

---

## 6. Chat — Koi Bhi Kisi Se Bhi Chat Shuru Kar Sakta Tha

**Problem:** Chat ka access sirf iss baat pe based tha ki current user ka UID chat ke document-ID mein (jaise `uid1_uid2`) present hai ya nahi. Isse koi bhi user, kisi bhi doosre user ka UID jaan ke, unse chat shuru kar sakta tha — bina connection ke bhi.

ID ko `_` (underscore) se split kiya jaata tha, jo fragile approach hai.

**Fix:**
- Chat document mein ab explicit `participants` field hai (array of two UIDs)
- Rule verify karti hai ki dono participants **actually connected** hain (`connections` collection check karke)
- Message create karne se pehle sender ka UID aur uska public username verify hota hai
- Message ka sirf `read` status change ho sakta hai, aur sirf receiver ussे change kar sakta hai (sender apna message khud "read" mark nahi kar sakta)

**Kyun important hai:** Jab bhi aapke app mein "private conversation" jaisi feature ho, uska access control **relationship verification** pe based hona chahiye (jaise "yeh dono connected hain"), na ki sirf "yeh dono ka naam URL/ID mein hai" jaisi weak logic pe.

---

## 7. Admin Access — Client Variable Se Admin Check Ho Rahi Thi

**Problem:** App yeh check karta tha `if (uid === PUBLIC_SUPER_ADMIN_UID)` — aur yeh UID ek **public environment variable** mein tha, jo browser ke JavaScript bundle mein visible hota hai. Koi bhi browser dev tools khol ke yeh UID dekh sakta tha. (Firestore rules mein bhi ek separate hardcoded UID tha jo client wale se sync nahi tha.)

**Fix:** Admin status ab **Firebase Custom Claims** se aata hai — yeh ek secure token hai jo sirf Firebase Admin SDK (trusted server environment) se set kiya ja sakta hai, browser se nahi. Client sirf `getIdTokenResult(user)` call karke apne token mein `admin: true` claim check karta hai. Firestore rules bhi same `request.auth.token.admin == true` check karti hain.

**Kyun important hai:** **Koi bhi cheez jo browser ke JavaScript mein hai, woh public hai** — chahe woh "environment variable" naam se hi ho. Admin/role-based access control jaisi sensitive decisions kabhi client-visible data pe based nahi honi chahiye. Iske liye Firebase custom claims, ya server-side session/role systems use karo.

---

## 8. External Links — Job Ke Apply/Map Links Verify Nahi Hote The

**Problem:** Jo links users apne job listings mein daalte the (apply link, map link), unko bina check kiye directly `<a href={...}>` mein daal diya jaata tha. Koi bhi user technically `javascript:...` jaisa dangerous scheme daal sakta tha (halanki React escaping ki wajah se iska real exploit mushkil tha, but yeh best practice violation tha).

**Fix:** Ek naya helper (`safeExternalUrl`) banaya jo:
- URL ko parse karta hai
- Sirf `https://` scheme allow karta hai
- Koi credentials (`user:pass@`) allow nahi karta
- Agar URL invalid hai, toh link render hi nahi hota

Yeh validation ab job creation ke time (Firestore rules mein bhi) aur render karte time (UI mein bhi) dono jagah hoti hai.

**Kyun important hai:** **Kabhi bhi user-provided URL ko directly trust mat karo.** Hamesha uska protocol/scheme validate karo (sirf `https:` allow karo), aur ideally isko **write time pe** (jab data save ho) aur **read time pe** (jab data dikhaya jaaye) dono jagah check karo — kyunki purana data bhi database mein pada ho sakta hai jo pehle se invalid tha.

---

## 9. Data Validation — Firestore Rules Kuch Bhi Accept Kar Leti Thi

**Problem:** Rules sirf yeh check karti thi "user apna khud ka data likh raha hai ya nahi" — lekin **data ke andar kya hai**, uska koi check nahi tha. User chahe toh:
- Job document mein extra random fields daal sakta tha
- `status` field mein koi bhi random string daal sakta tha (jaise "hacked")
- Bahut lamba text daal ke database ko spam kar sakta tha
- `ownerUID` jaisa immutable field update mein change kar sakta tha

**Fix:** Har collection ke liye ek "validation function" likhi (jaise `validJob()`, `validPublicProfile()`, `validMessage()`) jo:
- Sirf allowed fields ko accept karti hai (`hasOnly()`)
- Har field ka type check karti hai (string, number, timestamp, etc.)
- Text fields ki maximum length set karti hai
- `status` jaise fields ko sirf predefined values tak limit karti hai (enum jaisa)
- Immutable fields (jaise `ownerUID`, `createdAt`) ko update mein change hone se rokti hai

**Kyun important hai:** Sirf "authentication" check karna kaafi nahi hai. Aapko yeh bhi control karna hoga ki **authenticated user kya data bhej sakta hai.** Isse aap malformed data, storage abuse, aur unexpected app behavior se bachte hain.

---

## 10. Atomic Operations — Race Conditions Se Duplicate/Broken Data Ban Sakta Tha

**Problem:** Kayi operations mein "pehle check karo, phir likho" (query-then-write) pattern tha. Jaise: username available hai check karo, phir profile banao. Agar do log ek hi second mein same username try karein, dono ko "available" dikh sakta tha, aur dono create ho jaate — duplicate username.

**Fix:** In sensitive operations ko Firestore **transactions** (`runTransaction`) mein wrap kiya — jaise username registration, friend request bhejna, request accept karna, job copy karna. Transaction guarantee karta hai ki check aur write **atomically** (ek saath, bina interruption ke) hoti hai.

**Kyun important hai:** Jab bhi aapka code "pehle padho, phir uske basis pe likho" karta hai, aur woh data **uniqueness** ya **consistency** ke liye important hai (jaise username, ek-baar-hi-hone-wali action), transaction use karo. Nahi toh concurrent requests aapke data ko corrupt kar sakte hain.

---

## 11. Listener Cleanup — Purane Account Ka Data Naye Account Mein Dikh Sakta Tha

**Problem:** Jab user logout karke doosre account se login karta tha, purane account ke real-time listeners (notifications, chat unread count) sahi se band nahi hote the — kyunki JavaScript mein async function ke andar se return kiya hua cleanup function silently ignore ho jaata hai.

**Fix:** `AuthProvider` component ko rewrite kiya taaki har listener ka cleanup function explicitly track ho aur account change hone pe (ya component unmount hone pe) sahi se call ho. Ek "generation counter" bhi add kiya jo purane, "stale" async operations ko naye state ko overwrite karne se rokta hai.

**Kyun important hai:** Real-time apps mein (jo Firestore listeners use karte hain), yeh ensure karna zaroori hai ki jab user change ho, **saare purane listeners explicitly band ho jaayein.** Nahi toh memory leak, galat UI data, ya (worse) ek user ka data doosre user ki screen pe dikhne jaisa privacy issue ho sakta hai.

---

## 12. Security Headers Aur App Check — Extra Layers of Defense

**Fix:**
- `firebase.json` aur `vercel.json` mein browser security headers add kiye — `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, etc.
- Firebase **App Check** ka optional setup add kiya, jo verify karta hai ki requests **actually aapki app** se aa rahi hain, na ki kisi script/bot se.

**Kyun important hai:** Yeh "defense in depth" hai — matlab agar ek layer fail ho jaaye, doosri layer phir bhi protect kare. Security headers browser-level attacks (clickjacking, XSS) se bachate hain. App Check automated abuse/scraping se bachata hai. Yeh dono **rules ka replacement nahi hain** — yeh unke upar extra protection hain.

---

## Deployment Ke Liye Zaroori Steps (Bahut Important!)

Yeh saare code changes ho gaye hain, lekin **kuch steps aapko manually karne padenge** taaki yeh production mein sahi se kaam karein:

1. **Firebase Admin Claim set karo:** Custom claim (`admin: true`) sirf Firebase Admin SDK se set ho sakta hai — ek script chalao (Node.js) jo aapke admin UID ko yeh claim de. `.env` mein `PUBLIC_SUPER_ADMIN_UID` ab use nahi hoga, isliye woh variable hata sakte hain.
2. **Firestore Rules deploy karo:** `firebase deploy --only firestore:rules` chalao.
3. **Legacy data ko Admin SDK se migrate karo:** Browser ke normal reads ke andar privileged migration write mat chalao. Missing document ko read karna bhi strict rules mein deny ho sakta hai, aur optional connection loading poore login ko tod sakti hai. JobSeen ab legacy connection IDs ko browser memory mein normalize karta hai; database backfill trusted Admin SDK script se karna safer hai. Profile ka compatibility migration abhi available hai, lekin bulk production migration ke liye Admin SDK backfill prefer karo.
4. **App Check optional hai:** Agar aap `PUBLIC_FIREBASE_APPCHECK_SITE_KEY` set nahi karte, toh client App Check skip karta hai. **Lekin Firebase Console mein Firestore enforcement ON hai toh valid App Check token ke bina har valid Firestore request bhi `permission-denied` ho sakti hai.** Pehle production domain/key configure karke valid-request metrics verify karo, uske baad enforcement enable karo.
5. **Firestore Emulator se test karo:** Deploy karne se pehle `firebase emulators:start` use karke rules ko local mein test karo, especially yeh scenarios: doosre ka job dekhna (fail hona chahiye), fake connection banana (fail hona chahiye), doosre ke liye notification banana (fail hona chahiye).

---

## Vibe Coding Karte Waqt Kis Kis Baat Ka Dhyan Rakhna Hai (Aur Kyun)

Aap aur bhi apps banayenge jahan AI se code likhwayenge. Yahan woh checklist hai jo har naye project mein **default habit** banni chahiye:

### 1. Client-side check kabhi security nahi hoti
`if (isOwner)` React mein likhna sirf better UX ke liye hai. **Asli permission check hamesha backend/rules/server mein honi chahiye.** Agar aapka backend Firebase hai, toh Firestore/Storage Security Rules likhna optional step nahi hai — yeh sabse zaroori step hai.

### 2. "Kya yeh sabko dikh sakta hai?" — har naye collection/table ke liye pucho
Jab bhi naya data model banao, khud se pucho: "Agar koi random logged-in user directly database query kare, toh kya woh yeh data dekh sakta hai?" Agar answer "haan" hai aur data private hona chahiye tha, toh rule galat hai.

### 3. Public data aur private data ko shuru se hi alag rakho
Email, phone number, payment info — yeh sab kabhi bhi ek aise document mein mat rakho jo kisi aur reason se publicly readable ho (jaise username lookup ke liye). Do collections banao: public profile, private account.

### 4. Random IDs vs deterministic IDs samjho
Jab bhi data ek "relationship" represent karta hai (A-B connection, A-B chat, A ne B ko request bheji), uska ID predictable/deterministic rakhne ki koshish karo (jaise sorted UIDs joined together). Isse duplicate rokna aasan hota hai, aur rules likhna simpler hota hai.

### 5. "Weak security > No security" ek myth hai
4-digit PIN, simple hash, ya koi "obfuscation" trick — yeh false confidence deta hai. Agar backend usse enforce nahi karta, toh yeh security nahi hai, sirf ek extra click hai. Behtar hai ki aap seedha bata do ki yeh sirf ek "confirmation step" hai, security claim mat karo.

### 6. Secrets aur environment variables ka fark samjho
`PUBLIC_` prefix wale environment variables (Astro/Next.js/Vite mein common pattern) **browser mein expose hote hain.** Kabhi bhi admin UID, secret keys, ya kisi bhi sensitive value ko `PUBLIC_` variable mein mat daalo. Agar kisi cheez ko "secret" rakhna hai, woh sirf server-side code (Cloud Functions, API routes) mein honi chahiye.

### 7. User input ko hamesha validate karo — dono taraf se
Jab user URL, text, ya koi bhi data submit kare:
- **Write karte time validate karo** (form submission pe)
- **Read/render karte time bhi validate karo** (kyunki purana ya corrupted data database mein pehle se ho sakta hai)

URL ke case mein: sirf `https://` allow karo, kabhi `javascript:` ya doosre schemes allow mat karo.

### 8. Race conditions ke baare mein socho
"Pehle check karo, phir likho" pattern (jaise "yeh username available hai kya, phir create karo") mein hamesha race condition ka risk hota hai. Jab bhi uniqueness ya "exactly once" jaisi guarantee chahiye, database transactions use karo.

### 9. Roles/admin access ko custom claims ya server session se control karo
Kisi bhi "is this user an admin" jaisi check ko client-visible data (UID comparison, localStorage flag) pe based mat karo. Firebase custom claims, ya server-side session/role system use karo.

### 10. AI se code likhwate waqt security explicitly maango
AI models (jaise main) default mein working code generate karte hain, lekin security edge cases miss kar sakte hain jab tak explicitly na kaha jaaye. Har naye feature ke baad yeh questions pucho:
- "Kya yeh Firestore rule mein bhi enforce ho raha hai, ya sirf UI mein?"
- "Agar koi attacker directly API/database call kare, kya woh isse bypass kar sakta hai?"
- "Kya yeh private data kisi aisi jagah expose ho raha hai jahan hona nahi chahiye?"

### 11. Deploy se pehle emulator/test environment mein rules test karo
Firebase Emulator Suite free hai aur local mein Firestore rules test karne deta hai bina production data risk kiye. Har major rules change ke baad, kam se kam manually try karo "doosre user ka data access karne ki koshish" jaisa attack scenario — dekho ki woh fail hota hai ya nahi.

---

*Yeh document JobSeen codebase ke security audit (July 2026) ke baad likha gaya. Isko apne future projects ke liye reference guide ki tarah use karo.*

---

## 13. Security-question Deletion Protection

**Requirement:** Standard aur Brute Force job delete karne se pehle user ka configured question poocha jaaye aur correct answer required ho.

**Secure implementation:** Isko client-only comparison nahi banaya gaya. Question `deletionQuestions/{uid}` mein self-readable hai, lekin normalized answer ka SHA-256 digest `deletionSecrets/{uid}` mein hai aur client us document ko read/list nahi kar sakta. Delete ke waqt client ek target-specific proof aur job deletion ko **same Firestore batch** mein bhejta hai. Rules `getAfter()` se verify karti hain ki proof ka digest/version unreadable secret se match kare aur proof ka `createdAt` current `request.time` ho. Isliye purana proof replay karke ya modal bypass karke direct owner delete request bhejna reject hota hai. Admin custom claim recovery ke liye bypass retain karta hai.

**Change protection:** Question/answer change karne ke liye current answer ka fresh same-batch proof required hai. Secret version increment hota hai, isliye old version ke proofs invalid ho jaate hain. App mein client-side “forgot answer” reset nahi hai; trusted admin recovery required hai.

**Limitations:** Yeh app-defined destructive-action safeguard hai, Firebase login reauthentication ya account password ka replacement nahi. Security questions naturally guessable ho sakte hain, Firestore Rules rate limiting provide nahi karti, aur SHA-256 password hashing algorithm nahi hai. Isliye minimum 8-character non-obvious answer rakha gaya hai. High-risk app mein Firebase reauthentication aur trusted backend with rate limiting/preferably memory-hard password hashing stronger option hai.
