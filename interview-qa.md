# JobSeen — Interview Q&A (Short Scripts)

> Bolne ke liye scripts. Zyada tar **short**. Important wale **medium**. Long answers avoid.  
> Style: simple / layman — interviewer quick puche toh ready raho.

---

## A. Project intro (almost always)

### Q1. Apna project batao / What is JobSeen?
**Bolna:**  
“JobSeen ek job-application tracker hai jo maine Arigato Labs ke under banaya. Usme aap online applications save karte ho, status track karte ho, cold-call leads Brute Force mein rakhte ho, walk-in route plan karte ho, aur friends se connect karke unki jobs permission se copy / chat kar sakte ho. Frontend Astro + React hai, backend Firebase Auth aur Firestore.”

### Q2. Kyun banaya?
**Bolna:**  
“Job hunt mein Excel aur notes mess ho jate hain — online apply, phone calls, walk-ins alag alag. Mujhe ek jagah chahiye thi jahan tracking + calling + route + peer sharing ho, aur data secure bhi rahe. Isliye JobSeen banaya.”

### Q3. Real life mein kaun use karega?
**Bolna:**  
“Active job seekers — especially freshers / campus flow — jo roz apply karte hain, companies ko call karte hain, aur walk-in pe jate hain. Dosto ke saath openings share bhi karte hain.”

### Q4. Tech stack kya hai?
**Bolna:**  
“Astro static site, React islands, Tailwind, Nano Stores, Firebase Auth with Google, Firestore, deploy Vercel pe.”

---

## B. Architecture & how it works

### Q5. Architecture kaise hai? Koi backend API?
**Bolna:**  
“Custom REST API nahi hai. Browser seedha Firebase se baat karta hai. Security Firestore rules se hoti hai — rules hi mera server-side gate hain.”

### Q6. Astro kyun, Next kyun nahi?
**Bolna:**  
“Zyada tar app client + Firebase pe chal rahi thi, isliye static Astro + React islands enough the. Build simple, hosting Vercel pe light. Full SSR server ki zarurat nahi padti thi.”

### Q7. State management kaise?
**Bolna:**  
“Nano Stores — auth, chat, notifications. Heavy Redux nahi; lightweight aur React ke saath clean.”

### Q8. Data flow ek example se?
**Bolna:**  
“User Add Job form bharta hai → client validation → Firestore `jobs` pe create → rules check owner → Inbox listener/UI update dikhata hai.”

---

## C. Features (quick fire)

### Q9. Main features kaunse?
**Bolna:**  
“Inbox with list/grid/Kanban, Add Job, Brute Force calling tracker, Walk-in Route, Users + connections, canCopy permissions, chat, notifications, analytics, One Password for sensitive edit/delete.”

### Q10. Brute Force kya hai?
**Bolna:**  
“Cold-call leads ka module — company, phone, call outcome jaise no response, switched off, resume sent, success with interview time, phir selected/rejected.”

### Q11. Walk-in Route kya hai?
**Bolna:**  
“Kis din kaunsi company pehle visit karni hai — date-wise ordered list. Online job ya Brute Force lead dono route pe daal sakte ho.”

### Q12. Social part kaise kaam karta hai?
**Bolna:**  
“Username se user dhundo → connection request → accept → ab unki jobs dekh sakte ho. Copy tabhi jab woh Permissions mein canCopy on kare. Chat bhi sirf connections ke saath.”

### Q13. Kanban kaise?
**Bolna:**  
“Inbox board view — columns by status. Card drag karo, status Firestore mein update.”

---

## D. Schemas / database

### Q14. Database kya use kiya?
**Bolna:**  
“Cloud Firestore — document collections. Schemas TypeScript types aur firestore.rules se define kiye, alag ORM nahi.”

### Q15. Important collections?
**Bolna:**  
“`users`, `publicProfiles`, `usernames`, `jobs`, `bruteForceJobs`, `friendRequests`, `connections`, `permissions`, `notifications`, `chats` + messages, aur One Password ke liye `deletionQuestions`, `deletionSecrets`, `deletionProofs`.”

### Q16. Username unique kaise?
**Bolna:**  
“`usernames/{username}` registry — create pe claim; baad mein change allow nahi. Public profile alag, private email `users` pe.”

### Q17. Copy job duplicate kaise rokta?
**Bolna:**  
“Deterministic ID `copy_{myUid}_{sourceJobId}`. Same source dobara copy try kiya toh pehle se exist karta hai — transaction fail.”

---

## E. Security (important — medium OK)

### Q18. Security ke liye kya kiya?
**Bolna:**  
“Teen layers socho: Firestore rules default deny; connection + canCopy gates; aur One Password proofs for delete/edit. URLs HTTPS-only. Optional App Check. Vercel pe CSP headers.”

### Q19. Firebase API key public hai — secure kaise?
**Bolna:**  
“Web pe Firebase keys expose hoti hain — ye normal hai. Asli security rules mein hai. Galat user write/read rules block kar deti hain, key se free access nahi milta.”

### Q20. One Password kya hai?
**Bolna:**  
“Settings mein ek question + answer. Answer plain save nahi — SHA-256 digest. Job ya Brute Force delete/edit pe answer maangta hai, same batch mein proof likhta hai, rules verify karti hain. Secrets client read nahi kar sakta.”

### Q21. Rules deploy bhool gaye toh?
**Bolna:**  
“Naya code chalega lekin purani/loose ya mismatched rules pe permission-denied ya worse gap. Isliye `firebase deploy --only firestore:rules` alag se yaad rakhna padta hai.”

### Q22. XSS / malicious link?
**Bolna:**  
“Apply/map links client + rules dono pe HTTPS, credentials wale URLs block. CSP se script injection surface kam.”

---

## F. Auth

### Q23. Login kaise?
**Bolna:**  
“Google popup Firebase Auth se. Pehli baar username set karna padta hai — woh immutable.”

### Q24. Admin kaise?
**Bolna:**  
“Custom claim `admin` token pe. UI se self-admin nahi — Admin SDK se claim set, phir token refresh.”

---

## G. Why this design / tradeoffs

### Q25. Backend kyun nahi likha?
**Bolna:**  
“Scope ke liye BaaS faster tha. Auth, DB, rules Firebase pe. Tradeoff: complex business logic rules mein manage karni padti hai, aur rules carefully likhne padte hain.”

### Q26. Biggest challenge?
**Bolna:**  
“Security rules ko product features ke saath sync rakhna — especially One Password same-batch proofs, canCopy, aur field-level updates bina proof ke sirf status/route allow karna.”

### Q27. Performance ke liye kya kiya?
**Bolna:**  
“Inbox/BF pe load more, cards pe content-visibility, JobForm pe suggestions ke liye unnecessary long listeners avoid, grouping memoize.”

### Q28. Agar scale badhe?
**Bolna:**  
“Listeners aur indexes pe cost aayegi. Tab pagination already hai; aage composite indexes, maybe Cloud Functions for heavy jobs, stricter App Check.”

---

## H. Debugging

### Q29. permission-denied aaye toh kya check?
**Bolna:**  
“Pehle console error, phir Firestore Console data, phir rules published hain ya nahi, One Password/proof, connection/canCopy. Rules Playground se simulate.”

### Q30. Prod pe login nahi ho raha?
**Bolna:**  
“Auth authorized domains mein Vercel domain add hai? Env vars Vercel pe set? Browser console mein unauthorized-domain toh domain fix.”

### Q31. Index error?
**Bolna:**  
“Firestore error link se index create, ya `firestore.indexes.json` deploy.”

---

## I. Knowledge / learning

### Q32. Isse kya seekha?
**Bolna:**  
“Client-trust mat karo — rules socho. Firestore modeling, Google auth, Astro+React hybrid, social graph with permissions, aur product thinking for real job-hunt workflow.”

### Q33. Next improve kya karoge?
**Bolna:**  
“Admin tools complete karunga, walk-in create flag carefully on, App Check tune, maybe notifications richer, aur rules/tests automated.”

---

## J. Rapid 15-sec answers (drill)

| Q | 15-sec |
|---|--------|
| Kya banaya? | Job tracker + BF calls + walk-in route + social copy/chat |
| Stack? | Astro, React, Firebase, Vercel |
| DB? | Firestore |
| Auth? | Google |
| Security? | Rules + One Password + canCopy |
| Deploy? | Vercel static |
| Backend? | No custom API — Firebase |
| Brand? | Arigato Labs |

---

## K. Closing line (end of interview)

**Bolna:**  
“JobSeen maine khud use-case se banaya — tracking mess solve karna tha. Stack simple rakha, lekin security rules aur permission model pe seriously kaam kiya, kyunki job data personal hota hai.”
