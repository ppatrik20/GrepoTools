# Grepolis World Endgames & Strategic Mechanics — Official Primary-Source Reference

> **Primary Source Corpus**: Extracted directly from the official InnoGames Grepolis Hungarian Knowledge Base ([support.innogames.com/kb/Grepolis/hu_HU](https://support.innogames.com/kb/Grepolis/hu_HU)) and live Grepolis game client assets (`hu119.grepolis.com` CSS/JS sprite sheets & [src/lib/map/](file:///d:/Dev/Web/Grepolis/src/lib/map/)).
>
> **Strategic Architecture Companion**: See [endgame_strategic_blueprint.md](file:///d:/Dev/Web/Grepolis/docs/endgame_strategic_blueprint.md) for the interactive Team War Room functions, Prisma data models, RBAC permissions, and MapLibre layer designs built on these mechanics.

---

## 1. World Wonders (`A világ csodái`)

**Primary Sources**:
- [A világ csodái (KB #4479)](https://support.innogames.com/kb/Grepolis/hu_HU/4479/A-vil%C3%A1g-csod%C3%A1i)
- [Egy teljes szigetet uralok, amin csoda van. Mi lesz, ha kilépek a szövetségből? (KB #380)](https://support.innogames.com/kb/Grepolis/hu_HU/380/Egy-teljes-szigetet-uralok-amin-csoda-van-Mi-lesz-ha-kil%C3%A9pek-a-sz%C3%B6vets%C3%A9gb%C5%91l)
- [Van lehetőség rá, hogy az általunk megépített világ csodát szövetségként leromboljuk? (KB #609)](https://support.innogames.com/kb/Grepolis/hu_HU/609/Van-lehet%C5%91s%C3%A9g-r%C3%A1-hogy-az-%C3%A1ltalunk-meg%C3%A9p%C3%ADtett-vil%C3%A1g-csod%C3%A1t-sz%C3%B6vets%C3%A9gk%C3%A9nt-leromboljuk)
- [Valakivel megosztom az internetem. Mindketten építhetjünk azonos csodát? (KB #414)](https://support.innogames.com/kb/Grepolis/hu_HU/414/Valakivel-megosztom-az-internetem-Mindketten-%C3%A9p%C3%ADthetj%C3%BCnk-azonos-csod%C3%A1t)
- [Miért támadnak meg szabadság mód során? (KB #603)](https://support.innogames.com/kb/Grepolis/hu_HU/603/Mi%C3%A9rt-t%C3%A1madnak-meg-szabads%C3%A1g-m%C3%B3d-sor%C3%A1n)
- [Mikor zár be egy világ véglegesen? (KB #371)](https://support.innogames.com/kb/Grepolis/hu_HU/371/Mikor-z%C3%A1r-be-egy-vil%C3%A1g-v%C3%A9glegesen-Mik-ennek-a-felt%C3%A9telei)

### 1.1 Era of World Wonders Start Conditions
When a world enters the **Era of World Wonders (`A világ csodáinak korszaka`)**, new player registrations are permanently closed, and alliances compete to construct 7 World Wonders on islands they completely control.

#### Modern System (`A világ csodái - Új`)
The Era of World Wonders begins after a fixed number of days from the world's opening date, determined by **World Speed (`Világ sebessége`)** and **Endgame Speed (`Lassan / Normál / Gyors`)**:

| World Speed | Slow (`Lassan`) | Normal (`Normál`) | Fast (`Gyors`) |
| :---: | :---: | :---: | :---: |
| **1x** | 365 days | 274 days | 183 days |
| **2x** | 310 days | 233 days | 155 days |
| **3x** | 256 days | 192 days | 128 days |
| **4x** | 201 days | 151 days | 101 days |
| **5x** | 146 days | 110 days | 73 days |
| **6x** | 91 days | 69 days | 46 days |

#### Legacy System (`A világ csodái - Régi`)
- World must exist for at least **6 months** (each month = 30 days).
- Sum of the **Top 50 Alliances' points** must reach at least **250,000,000**.
- If not reached after 6 months, a new target is calculated based on world settings; if still not reached by the end of Month 10, the required point threshold decreases every 30 days by **half of the difference** between the current target and the current Top 50 alliance point sum.

---

### 1.2 Island Ownership, Construction & 400-Favor Acceleration Rules
1. **Complete Island Sovereignty**:
   - An alliance must control **100% of all towns** on a large island (20-slot islands with farming villages, `island.type ∈ [1..10, 37..46]`) to start or upgrade a World Wonder.
   - Only Alliance **Founders (`Alapító`)** or **Leaders (`Vezető`)** can select which of the 7 Wonders to construct on an eligible island's construction site (`wbg`). **Once chosen, the Wonder type cannot be changed** ([KB #4479](https://support.innogames.com/kb/Grepolis/hu_HU/4479/A-vil%C3%A1g-csod%C3%A1i), [KB #609](https://support.innogames.com/kb/Grepolis/hu_HU/609/Van-lehet%C5%91s%C3%A9g-r%C3%A1-hogy-az-%C3%A1ltalunk-meg%C3%A9p%C3%ADtett-vil%C3%A1g-csod%C3%A1t-sz%C3%B6vets%C3%A9gk%C3%A9nt-leromboljuk)).
   - World Wonder construction sites are only visible to players with **more than 5,000 points**.
   - Each alliance may only construct **one of each** of the 7 Wonder types simultaneously.
2. **72-Hour Alliance Membership Cooldown**:
   - A player must be a member of the alliance for **at least 72 continuous hours** before they can ship resources or spend Favor (`Áldás` / `Kegyelem`) on any World Wonder ([KB #4479](https://support.innogames.com/kb/Grepolis/hu_HU/4479/A-vil%C3%A1g-csod%C3%A1i)).
   - **Shared Internet Connection Exemption**: Players sharing an internet connection *are* permitted to send resources and Favor to the same World Wonder ([KB #414](https://support.innogames.com/kb/Grepolis/hu_HU/414/Valakivel-megosztom-az-internetem-Mindketten-%C3%A9p%C3%ADthetj%C3%BCnk-azonos-csod%C3%A1t)).
3. **400-Favor Build Time Acceleration**:
   - Once all required Wood, Stone, and Silver for a level are stored at the Wonder site and construction begins, alliance members can accelerate the timer by spending **400 Favor of EVERY god** (400 Zeus + 400 Poseidon + 400 Hera + 400 Athena + 400 Hades + 400 Artemis [+ 400 Aphrodite + 400 Ares]).
   - **50% Cap**: Construction time can only be reduced up to **half (50%) of the total base build time** for that level (e.g., a 1-hour build cannot be reduced below 30 minutes).

#### Resource Costs, Base Build Times & Favor Reduction per Level (Speed 1x)
> **Speed Scaling Rule ([KB #4479](https://support.innogames.com/kb/Grepolis/hu_HU/4479/A-vil%C3%A1g-csod%C3%A1i))**: To calculate required resources on faster worlds, **multiply the Speed 1x resource amounts by the World Speed** (e.g., on Speed 3x, Level 1 requires `200,000 × 3 = 600,000` of each resource, and Level 10 requires `23,800,000 × 3 = 71,400,000` of each resource!).

| Level (`Szint`) | Wood (`Fa`) [1x] | Stone (`Kő`) [1x] | Silver (`Ezüst`) [1x] | Base Build Time (`Idő`) [1x] | Time Reduced per 400-Favor Cast [1x] |WW Points Added (`Σ Points`) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | 200,000 | 200,000 | 200,000 | `01:57:00` | `00:01:40` (100s) | +1 (`1`) |
| **2** | 400,000 | 400,000 | 400,000 | `03:57:00` | `00:02:30` (150s) | +2 (`3`) |
| **3** | 600,000 | 600,000 | 600,000 | `07:37:00` | `00:03:20` (200s) | +3 (`6`) |
| **4** | 1,000,000 | 1,000,000 | 1,000,000 | `13:07:00` | `00:04:10` (250s) | +4 (`10`) |
| **5** | 1,600,000 | 1,600,000 | 1,600,000 | `20:33:00` | `00:05:00` (300s) | +5 (`15`) |
| **6** | 2,800,000 | 2,800,000 | 2,800,000 | `30:00:00` | `00:05:50` (350s) | +6 (`21`) |
| **7** | 4,800,000 | 4,800,000 | 4,800,000 | `41:34:00` | `00:06:40` (400s) | +7 (`28`) |
| **8** | 8,200,000 | 8,200,000 | 8,200,000 | `55:17:00` | `00:07:30` (450s) | +8 (`36`) |
| **9** | 14,000,000 | 14,000,000 | 14,000,000 | `71:13:00` | `00:08:20` (500s) | +9 (`45`) |
| **10** | 23,800,000 | 23,800,000 | 23,800,000 | `89:26:00` | `00:09:10` (550s) | +10 (`55`) |
| **Total (1–10)** | **57,400,000** | **57,400,000** | **57,400,000** | **334h 41m** | — | **55 pts / Wonder** |

---

### 1.3 Partial & Total Destruction, Vacation Mode & Morale Exemptions
1. **Partial Destruction (`A sziget feletti ellenőrzés elvesztése`)**:
   - If an alliance loses control of **one or more towns** on a Wonder island (via enemy conquest, a member leaving/being kicked, or an enemy founding a town on an empty slot), **all stored resources and active construction progress toward the next level are immediately lost**, and construction halts until 100% island control is restored.
   - **Level 10 Breach**: If the island holds a **completed Level 10 Wonder**, losing even a single town on the island **demotes the Wonder to Level 9**, reopening Level 10 completion to rival alliances across the world!
   - **Ghost Town Decay / Account Deletion**: If a town on a Wonder island turns into a ghost town or disappears, the current construction progress/resources are also lost, though if the alliance still owns all remaining towns on the island they can resume construction from the last completed level.
   - **Internal Alliance Town Handovers**: Conquering a Wonder-island town from a **fellow member of the same alliance** does **NOT** count as losing control and does **NOT** interrupt construction or lose resources ([KB #4479](https://support.innogames.com/kb/Grepolis/hu_HU/4479/A-vil%C3%A1g-csod%C3%A1i)).
2. **Total Destruction (`Az egész Sziget elvesztése`)**:
   - A Wonder is completely destroyed (from any level back to 0) only if:
     1. The alliance loses **every single town** on that Wonder island, OR
     2. The alliance is **dissolved (`feloszlatják`)** or merges by dissolving, OR
     3. A single player owns all 20 towns on the Wonder island and leaves the alliance ([KB #380](https://support.innogames.com/kb/Grepolis/hu_HU/380/Egy-teljes-szigetet-uralok-amin-csoda-van-Mi-lesz-ha-kil%C3%A9pek-a-sz%C3%B6vets%C3%A9gb%C5%91l)).
3. **Vacation Mode Disabled on Wonder Islands (`Szabadság mód a világ csoda-szigeteken`)**:
   - On any island where a World Wonder has been started, **Vacation Mode does NOT protect towns on that island** ([KB #4479](https://support.innogames.com/kb/Grepolis/hu_HU/4479/A-vil%C3%A1g-csod%C3%A1i), [KB #603](https://support.innogames.com/kb/Grepolis/hu_HU/603/Mi%C3%A9rt-t%C3%A1madnak-meg-szabads%C3%A1g-m%C3%B3d-sor%C3%A1n)). Enemy players can attack and conquer those towns normally even while the town's owner is on Vacation Mode and unable to log in.
4. **Morale Disabled on Wonder Islands (`Harci szellem`)**:
   - On islands with a World Wonder, **Morale (`Morál`) does NOT apply to the defender** ([KB #4479](https://support.innogames.com/kb/Grepolis/hu_HU/4479/A-vil%C3%A1g-csod%C3%A1i)). Attackers always fight at 100% strength regardless of point differences, preventing alliances from placing tiny low-point accounts on Wonder islands as morale shields.
5. **Peacetime Rules on Wonders (`Békeidő`)**:
   - Wonder level expansions cannot be started during Peacetime, nor can they be started before Peacetime if the completion time would fall inside Peacetime.
   - Favor acceleration cannot be used during Peacetime, nor before Peacetime if the accelerated completion time would fall inside Peacetime.
   - Resource shipments arriving at a Wonder **during Peacetime are automatically returned to the sender town**; shipments arriving outside Peacetime are credited normally.

---

### 1.4 The 7 World Wonders, Bonuses & Official KB Icons

| Code (`wt`) | Hungarian Name | English Name | Completed Alliance Bonus | Official KB Image URL |
| :--- | :--- | :--- | :--- | :--- |
| `pyramid` | **Gízai Nagy Piramis** | Great Pyramid of Giza | **+1,500 Warehouse capacity** in all towns | `https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/c4deaee837d5d1261d24fe131ff5ab04` |
| `gardens` | **Babilon függő kertjei** | Hanging Gardens of Babylon | **+3% Resource production** in all towns | `https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/a53e2a4d14e23879e0856f9d23f1bec3` |
| `statue` | **Szobor Zeusz Olümpia** | Statue of Zeus at Olympia | **+5% Favor production with Zeus** | `https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/8aa927fb1aa1722c2fd332a45da7119c` |
| `temple` | **Artemisz temploma Ephesusban** | Temple of Artemis at Ephesus | **+5% Favor production with ALL gods** | `https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/771a656bb88f399e117f3ceba8832575` |
| `mausoleum` | **A Halikarnasszusz mauzóleum** | Mausoleum at Halicarnassus | **-5% Mythological unit resource costs** | `https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/1e8d7e6b60b2657263823faad60b7d95` |
| `colossus` | **A rhódoszi kolosszus** | Colossus of Rhodes | **-10% Victory Procession (`Diadalmenet`) duration** | `https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/2e1d0781c9abce63f2f764394e73f8ab` |
| `lighthouse` | **Az alexandriai világítótorony** | Lighthouse of Alexandria | **-5% Phoenician Merchant (`Föníciai kereskedő`) costs** | `https://tools-files.innogamescdn.com/support-knowledgebase/article/4479/2d173b6949bc09b6a25e872ad19c7180` |

---

### 1.5 Victory Conditions, Endgame Countdown (`Végidő`) & WW Ranking Points
- **Exclusive Level 10 Lock**: While any number of alliances can build the same Wonder up to **Level 9**, **only ONE alliance in the world can hold Level 10 of a specific Wonder at a time**.
- **Victory (`A Világ Győztese` — 4/7 Wonders)**:
  - The first alliance to complete **4 out of 7** World Wonders to Level 10 wins the world, receives the *"Winner of [World]"* award, **+10% maximum Favor cap** (`500 → 550` base cap), and **+400 bonus WW Ranking Points**.
- **Ruler of the World (`A világ ura` — 7/7 Wonders & Crown)**:
  - Completing all **7 out of 7** World Wonders grants the *"Ruler of [World]"* award and a permanent profile **Crown (`Korona`)** (graded Gold, Platinum, Diamond, or Divine depending on total crowns won across worlds).
- **Endgame Countdown (`Végidő`)**:
  - As soon as the first alliance completes 4/7 Wonders, the Endgame Countdown starts, giving alliances time to battle for the remaining 3 Wonders and top-3 leaderboard positions before the final **14-day Peacetime** and server closure:

| World Speed (`Játék Sebessége`) | Speed Factor (`Tényező`) | Endgame Countdown (`Időtartam`) | Post-Countdown Peacetime |
| :---: | :---: | :---: | :---: |
| **1x** | 1.00 | **60 days** | +14 days |
| **2x** | 0.85 | **51 days** | +14 days |
| **3x** | 0.70 | **42 days** | +14 days |
| **4x** | 0.55 | **33 days** | +14 days |
| **5x** | 0.40 | **24 days** | +14 days |
| **6x** | 0.25 | **15 days** | +14 days |

- **WW Ranking Formula**:
  - Each completed level $L$ of a Wonder grants $L$ points (cumulative $\frac{L(L+1)}{2}$: Level 1 = 1 pt, Level 5 = 15 pts, Level 9 = 45 pts, Level 10 = 55 pts).
  - First alliance to reach 4/7 Level 10 Wonders receives **+400 extra points** (lost if the alliance dissolves). Ties are broken by total Alliance Points.

---

## 2. Domination (`Dominancia`)

**Primary Sources**:
- [Dominancia (KB #4485)](https://support.innogames.com/kb/Grepolis/hu_HU/4485/Dominancia)
- [Előfordulhat, hogy a végső harc béke időre esik? (KB #611)](https://support.innogames.com/kb/Grepolis/hu_HU/611/El%C5%91fordulhat-hogy-a-v%C3%A9gs%C5%91-harc-b%C3%A9ke-id%C5%91re-esik)
- [Miként működik a morál a végső harc során? (KB #612)](https://support.innogames.com/kb/Grepolis/hu_HU/612/Mik%C3%A9nt-m%C5%B1k%C3%B6dik-a-mor%C3%A1l-a-v%C3%A9gs%C5%91-harc-sor%C3%A1n)
- [Befolyásolja a végső harc a szabadságot? (KB #613)](https://support.innogames.com/kb/Grepolis/hu_HU/613/Befoly%C3%A1solja-a-v%C3%A9gs%C5%91-harc-a-szabads%C3%A1got)

### 2.1 Era of Domination Start Times & Valid Islands (`Érvényes szigetek`)
When the **Era of Domination (`Dominancia korszak`)** begins, the server scans outward from the center of the world map (`500, 500`), evaluating player density, and marks **Valid Islands (`Érvényes szigetek`)**:
- **Only Large Islands (`Nagy szigetek` with farming villages, `island.type ∈ [1..10, 37..46]`)** are ever marked as Valid Islands. Small colonizable islands (`type ∈ [11..16, 47..60]`) are excluded.
- **Only towns located on Valid Islands** count toward the world's total Domination denominator and each alliance's Domination percentage.
- **Initial Target Threshold**: **40.00%** of all towns on Valid Islands.

#### Days Until Domination Era Starts & Threshold Reduction Starts ([KB #4485](https://support.innogames.com/kb/Grepolis/hu_HU/4485/Dominancia))

| World Speed | Era Start: Slow (`Lassan`) | Era Start: Normal (`Normál`) | Era Start: Fast (`Gyors`) | Threshold Decay Start: Slow | Threshold Decay Start: Normal | Threshold Decay Start: Fast |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1x** | 300 days | 240 days | 180 days | 600 days | 480 days | 360 days |
| **2x** | 225 days | 180 days | 135 days | 450 days | 360 days | 270 days |
| **3x** | 187.5 days | 150 days | 112.5 days | 375 days | 300 days | 225 days |
| **4x** | 150 days | 120 days | 90 days | 300 days | 240 days | 180 days |
| **5x** | 112.5 days | 90 days | 67.5 days | 225 days | 180 days | 135 days |
| **6x** | 75 days | 60 days | 45 days | 150 days | 120 days | 90 days |

### 2.2 Bi-Weekly Threshold Reduction Formula (`A dominancia követelményének csökkentése`)
If no alliance reaches **40%** by the Threshold Decay Start date (which equals $2 \times \text{Pre-Domination Duration}$), the required Domination percentage decreases **every 14 days** by half the gap between the current threshold and the #1 alliance's Domination % (continuing every 14 days until the difference is `< 2%`):

$$\text{Reduction} = \frac{\text{Current Threshold} - \text{Top Alliance Domination \%}}{2}$$
$$\text{New Threshold} = \text{Current Threshold} - \text{Reduction} = \frac{\text{Current Threshold} + \text{Top Alliance Domination \%}}{2}$$

*Official KB Example*: If the current target is `40%` and the #1 alliance holds `30%` on the decay date, the reduction is `(40% - 30%) / 2 = 5%`, setting the new target to **35%**.

---

### 2.3 Last Stand (`Végső harc` / `Utolsó állás`), Vacation Vulnerability & Peacetime
Once an alliance reaches the required Domination threshold, it becomes eligible to trigger **Last Stand (`Végső harc`)**:
- **14-Day Activation Grace Period**: The alliance has **14 days** to manually activate Last Stand; if not activated manually, it starts automatically after 14 days.
- **Last Stand Holding Duration by World Speed**:

| World Speed (`Világ Sebessége`) | Required Continuous Last Stand Duration (`Időtartam`) |
| :---: | :---: |
| **1x** | **28 days** |
| **2x** | **21 days** |
| **3x** | **17.5 days** |
| **4x** | **14 days** |
| **5x** | **10.5 days** |
| **6x** | **7 days** |

- **Instant Deactivation on Breach**: If the alliance's Domination percentage drops below the target threshold at any moment during Last Stand, Last Stand **immediately deactivates** and cannot be reactivated until the alliance climbs back above the threshold.
- **Vacation Mode Override During Last Stand ([KB #4485](https://support.innogames.com/kb/Grepolis/hu_HU/4485/Dominancia), [KB #613](https://support.innogames.com/kb/Grepolis/hu_HU/613/Befoly%C3%A1solja-a-v%C3%A9gs%C5%91-harc-a-szabads%C3%A1got))**:
  - For the alliance holding Last Stand, **Vacation Mode (`Szabadság mód`) has NO protective effect**—all towns (and specifically all towns on Valid Islands) belonging to members of the Last Stand alliance become **100% attackable**, even if the player activated Vacation Mode before Last Stand began!
  - If Last Stand is broken, Vacation Mode protection immediately resumes for those players.
- **Morale During Last Stand ([KB #612](https://support.innogames.com/kb/Grepolis/hu_HU/612/Mik%C3%A9nt-m%C5%B1k%C3%B6dik-a-mor%C3%A1l-a-v%C3%A9gs%C5%91-harc-sor%C3%A1n))**:
  - Unlike World Wonder islands, **Morale (`Morál`) remains active and unchanged** during Last Stand.
- **Peacetime During Last Stand ([KB #4485](https://support.innogames.com/kb/Grepolis/hu_HU/4485/Dominancia), [KB #611](https://support.innogames.com/kb/Grepolis/hu_HU/611/El%C5%91fordulhat-hogy-a-v%C3%A9gs%C5%91-harc-b%C3%A9ke-id%C5%91re-esik))**:
  - Last Stand cannot be manually or automatically started during Peacetime (auto-start is postponed until Peacetime ends).
  - If Last Stand was already active before Peacetime started, all towns become unattackable during Peacetime and the **Last Stand timer is extended by the exact duration of the Peacetime**.
- **No Winner Rotation**: Only members inside the winning alliance when Last Stand completes receive the victory rewards and profile helm icon; rotating members in/out for rewards is impossible ([KB #4485](https://support.innogames.com/kb/Grepolis/hu_HU/4485/Dominancia)).

---

## 3. Olympus (`Olimposz`)

**Primary Source**:
- [Olimposz (KB #4482)](https://support.innogames.com/kb/Grepolis/hu_HU/4482/Olimposz)

### 3.1 Core Temple Rules (`Templomok alapvető szabályai`)
In Olympus worlds, the map size is constrained, all islands are open to colonization from Day 1, and alliances fight over **Small Temples (`Kis templomok`)**, **Portal Temples (`Portál templomok`)**, **Large Temples (`Nagy templomok`)**, and **Mount Olympus (`Olimposz`)**:
1. **Neutral NPC Garrisons**: All temples start as neutral towns occupied by NPC defense armies.
2. **No 48-Hour Colony Ship Limit**: Alliances conquer temples just like normal towns, **except the 48-hour maximum Colony Ship travel time does NOT apply to temples**!
3. **Alliance-Only Conquest & Caps**: Players without an alliance cannot conquer temples. Each alliance can only hold a capped number of Small Temples and at most **2 Large Temples**.
4. **God Myth-Unit Support Rule**: Every temple is dedicated to a specific god and can be supported by regular units plus **mythological units of that temple's assigned god**.
5. **24-Hour Post-Conquest Shield**: Immediately upon conquest, a **24-hour protection shield** is cast over the temple, making it immune to all attacks for 24 hours.
6. **No Spying, No Resources, No Spells**: Temples **cannot be spied on**, contain **no lootable resources**, and **cannot have divine spells cast on them**.
7. **100% Public Garrison Visibility**: **All units stationed inside any temple are ALWAYS visible to all other players in the world!**
8. **Cannot Be Abandoned**: Once conquered, a temple cannot be voluntarily abandoned by the owning alliance.

---

### 3.2 The 4 Phases of an Olympus World (`4 szakasz`)

| World Speed | Phase 2: Small Temples Start (Days from World Start) — `Lassan / Normál / Gyors` | Phase 3: Large Temples Start (Days from World Start) — `Lassan / Normál / Gyors` | Phase 4: Olympus Stage Threshold (Days after Large Temples Spawn)* — `Lassan / Normál / Gyors` | Olympus Spawn Delay (`X` Hours after all 8 Large Temples conquered or max Phase 3 length) |
| :---: | :---: | :---: | :---: | :---: |
| **1x** | 60 / 45 / 30 days | 210 / 170 / 130 days | 40 / 35 / 30 days | **240 hours** (10 days) |
| **2x** | 51 / 38 / 25 days | 178 / 144 / 110 days | 34 / 29 / 25 days | **204 hours** (8.5 days) |
| **3x** | 42 / 31 / 21 days | 147 / 119 / 91 days | 28 / 24 / 21 days | **168 hours** (7 days) |
| **4x** | 33 / 24 / 16 days | 115 / 93 / 71 days | 22 / 19 / 16 days | **132 hours** (5.5 days) |
| **5x** | 24 / 18 / 12 days | 84 / 68 / 52 days | 16 / 14 / 12 days | **96 hours** (4 days) |
| **6x** | 15 / 11 / 7 days | 52 / 42 / 32 days | 10 / 8 / 7 days | **60 hours** (2.5 days) |

*\*Note: Phase 4 (Olympus Stage) triggers as soon as **all 8 Large Temples are conquered** OR the Phase 3 duration threshold is reached, whichever comes first, followed by the `X`-hour spawn countdown.*

---

### 3.3 The 8 Large Temples & Fixed Alliance Bonuses (`Nagy templom bónuszok`)
At the start of Phase 3, **8 Large Temples** (one for each of the 8 gods) spawn equidistantly around the outer rim of the world map. **Every alliance can hold at most 2 Large Temples.** Their bonuses are fixed across all servers:

| Large Temple God | Bonus 1 | Bonus 2 | Bonus 3 | Bonus 4 |
| :--- | :--- | :--- | :--- | :--- |
| **Zeus (`Zeusz`)** | `+50` Population in all cities | **+15% Attack power** for all Mythological units | *Lightning Bolt* burns **15–40%** of target city's Favor | **+10% Defense** for all Naval units |
| **Hera (`Héra`)** | `+50` Population in all cities | **-40% Recruitment time** | *Happiness* reduces City Festival duration by **25%** | — |
| **Poseidon (`Poszeidón`)** | `+50` Population in all cities | **+15% Attack & Defense** for all non-myth Naval units | *Earthquake* increases naval build time by **+75% for 2 hours** | — |
| **Athena (`Athéné`)** | `+50` Population in all cities | **+20% Favor production** in all cities | *Heroic Power* grants **+12% additional attack** to all units | — |
| **Artemis (`Artemisz`)** | `+50` Population in all cities | **-40% Recruitment resource cost** for all units | *Illusion* reduces target city's defense power by **-20% for 1 hour** | — |
| **Aphrodite (`Aphrodité`)** | `+50` Population in all cities | **-20% Mythological unit recruitment cost** | *Charity Festival* reduces Victory Procession cost by **-25%** | — |
| **Ares (`Árész`)** | `+50` Population in all cities | **+10% Attack power** for all Naval units | *Ares' Sacrifice* generates **+50% more Fury (`Düh`)** | **+15% Movement speed** for all units |
| **Hades (`Hádész`)** | `+50` Population in all cities | **+10% Attack & Defense** for all non-myth units | *Plague* increases Barracks recruitment time by **+75%** | — |

---

### 3.4 Olympus Hold Duration, Teleportation (`Ugrás`), Curse (`Olimposz átka`) & Portal Temples

1. **Holding Duration vs. Teleportation Cycle ([KB #4482](https://support.innogames.com/kb/Grepolis/hu_HU/4482/Olimposz))**:
   - Because the maximum time Olympus stays at a single coordinate before teleporting is shorter than the required cumulative victory hold time, **an alliance must conquer and hold Olympus multiple times across jumps**:

| Endgame Pace | Required Cumulative Hold Time (`Megtartási napok`) | Olympus Teleport Cycle (`Teleportálás napok`) |
| :---: | :---: | :---: |
| **Fast (`Gyors`)** | **38 days** | Every **15 days** |
| **Normal (`Normál`)** | **50 days** | Every **20 days** |
| **Slow (`Lassan`)** | **63 days** | Every **25 days** |

   - **What Happens When Olympus Teleports**:
     - Olympus moves to a new random coordinate within map boundaries.
     - **All units stationed in Olympus are immediately teleported back to their home towns.**
     - The gods refill Olympus with a **brand-new neutral NPC army**.
     - Each alliance's accumulated hold time is preserved until they re-conquer Olympus.
2. **The Curse of Olympus (`Olimposz átka` — `-5%` Garrison Attrition)**:
   - From the moment neutral NPC units are cleared, every unit stationed inside Olympus suffers the **Olympus Curse (`Olimposz átka`)**, which **periodically kills 5% of all defending units inside Olympus's walls**.
   - Holding Olympus therefore requires continuous naval and land reinforcement relays so the garrison is not wiped out by divine attrition before enemy strikes land.
3. **Portal Temples (`Portál templomok`)**:
   - Special Small Temples that grant no buff during Phases 2–3, but become **direct gateways to Olympus** in Phase 4.
   - Any member of the alliance controlling a Portal Temple can send attacks or reinforcements through the Portal to Olympus.
   - **Total Travel Time**:
     $$T_{\text{total}} = T(\text{City} \rightarrow \text{Portal Temple}) + T_{\text{portal teleport fixed hours}}$$
   - **One-Way Restriction**: Portals operate **only in one direction (toward Olympus)**. Troops returning or recalled from Olympus **do NOT return via the portal**—they travel the full direct map distance from Olympus back to their home city!
4. **Olympus Peacetime Rules (`Szezonális békeidő`)**:
   - Small and Large Temples behave like normal cities (unattackable during Peacetime).
   - **Mount Olympus disappears completely during Peacetime**:
     - If an alliance owned Olympus when Peacetime started, ownership is stripped, the Olympus Curse stops, hold-time accumulation pauses, and all stationed troops return to their home cities. When Peacetime ends, Olympus respawns ownerless with **no NPC units**.
     - If Olympus was neutral but already cleared before Peacetime, it respawns with no units; if neutral and uncleared, it respawns with its pre-Peacetime NPC garrison.

---

## 4. Artifacts (`Ereklyék` — Cross-World Endgame Rewards)

**Primary Source**: [Ereklyék (KB #5807)](https://support.innogames.com/kb/Grepolis/hu_HU/5807/Erekly%C3%A9k)

Artifacts (`Ereklyék` / `Műtárgyak`) are permanent account-level items awarded at the end of a world's endgame that apply their passive bonus across **all future worlds** played by that player (up to **Max Level 30** per Artifact).

### 4.1 Complete Artifact Catalog

| Hungarian Name | English Equivalent | Passive Bonus per Artifact Level | Max Bonus (Level 30) | Official KB Image URL |
| :--- | :--- | :--- | :--- | :--- |
| **Ezüst kantharosz** | Silver Kantharos | **-1% Farming Village upgrade cost & time** per level | `-30%` cost & time | `https://tools-files.innogamescdn.com/support-knowledgebase/article/5807/fe4d76a0fc5d113670c480a6a8b6e317` |
| **Ambrózia** | Ambrosia | **+6% Bonus resource production on Small Islands** per level | `+180%` small island bonus | `https://tools-files.innogamescdn.com/support-knowledgebase/article/5807/5e561a002176afc384788675acbef500` |
| **Palladion** | Palladium | **-1.4% City Foundation (`Alapítás`) time** per level | `-42%` foundation time | `https://tools-files.innogamescdn.com/support-knowledgebase/article/5807/ac81240dc63203c3bf1a9a201d65cd45` |
| **Athéné bőségszarva** | Athena's Cornucopia | **+1.2% Warehouse storage capacity** in all cities per level | `+36%` warehouse cap | `https://tools-files.innogamescdn.com/support-knowledgebase/article/5807/f884c82a89388a8da17d252add06394c` |
| **Zeusz szikrája** | Zeus's Spark | **+3 Maximum Favor capacity** for all gods per level | `+90` max Favor cap | `https://tools-files.innogamescdn.com/support-knowledgebase/article/5807/81714339b8349567e59d54fe8a68f9f5` |
| **Az arany gyapjú** | The Golden Fleece | **-1.2% Hero training/leveling cost** per level | `-36%` hero cost | `https://tools-files.innogamescdn.com/support-knowledgebase/article/5807/1bd440d5b7c0f6c0c88f5f2817ce2830` |
| **Mitikus idomár kehely** | Mythical Tamer Chalice *(World Masters Exclusive)* | **-0.5% Mythological unit recruitment cost** per level | `-15%` myth unit cost | `https://tools-files.innogamescdn.com/support-knowledgebase/article/5807/6db4f70cc3302fd586f5c6bf6bfe31cc` |

### 4.2 Artifact Level Distribution Matrix
At world closure, Artifact levels are awarded based on **Alliance Final Endgame Rank** plus **Individual Player Contribution Rank** within the Top 8 alliances:
- **Base Alliance Award (All Members)**:
  - **1st Place Alliance**: `+4 Artifact Levels`
  - **2nd Place Alliance**: `+2 Artifact Levels`
  - **3rd Place Alliance**: `+1 Artifact Level`
- **Additional Top-Contributor Bonus**:
  - **Rank 1 Alliance**: Top 1–10 players receive `+1 Level` (Total `5` levels)
  - **Rank 2 Alliance**: Top 1–8 players receive `+1 Level` (Total `3` levels)
  - **Rank 3 Alliance**: Top 1–5 players receive `+1 Level` (Total `2` levels)
  - **Rank 4 & 5 Alliances**: Top 1–3 players receive `+1 Level`
  - **Rank 6, 7 & 8 Alliances**: Top #1 player receives `+1 Level`

---

## 5. Additional Strategic Mechanics from the Official Support KB

### 5.1 Morale Minimum Floor Formula ([KB #5910](https://support.innogames.com/kb/Grepolis/hu_HU/5910/Mor%C3%A1l))
When attacking a smaller player on a Morale-enabled world, attacker strength is multiplied by Morale:
$$\text{Morale} = \min\left(100\%, \max\left(\text{MinFloor}(\text{DefenderCities}), \left[\left(\frac{\text{DefenderPoints}}{\text{AttackerPoints}}\right) \times 3 + 0.3\right] \times 100\%\right)\right)$$
However, **Morale never drops below a minimum floor determined by the number of cities controlled by the defender** (capped at `80%` for `11+` cities):

| Defender City Count | Minimum Morale Floor (`Minimális morál`) |
| :---: | :---: |
| **1 city** | **30%** |
| **2 cities** | **35%** |
| **3 cities** | **40%** |
| **4 cities** | **45%** |
| **5 cities** | **50%** |
| **6 cities** | **55%** |
| **7 cities** | **60%** |
| **8 cities** | **65%** |
| **9 cities** | **70%** |
| **10 cities** | **75%** |
| **11+ cities** | **80%** |

### 5.2 Ghost Towns (`Szellemvárosok`) in Revolt vs. Siege Worlds ([KB #372](https://support.innogames.com/kb/Grepolis/hu_HU/372/Hogyan-h%C3%B3d%C3%ADtsak-meg-egy-m%C3%A1sik-v%C3%A1rost))
- **Revolt (`Lázadás`) Worlds**: Ghost towns have no governor to revolt against—players **do NOT need to stir a revolt** or even have *Conquest (`Hódítás`)* researched in the launching city! If a Colony Ship arrives and survives the naval/land battle (with an open Culture Slot), the Ghost Town is **captured instantaneously upon arrival**.
- **Siege (`Ostrom` / `Régi hódítási rendszer`) Worlds**: Ghost towns require a normal timed Siege (`Ostrom`) just like player-owned cities.

### 5.3 Battle Point Farming Villages (`Harci pontos falvak` — [KB #3512](https://support.innogames.com/kb/Grepolis/hu_HU/3512/Harci-pontos-falvak-megszerz%C3%A9se))
Only Large Islands (`island.type ∈ [1..10, 37..46]`) have 6 Farming Villages. Unlocking them costs global Battle Points (`Harci pontok`):
- **1st Village**: `2 BP` | **2nd Village**: `8 BP` | **3rd Village**: `10 BP` | **4th Village**: `30 BP` | **5th Village**: `50 BP` | **6th+ Village (across all islands)**: `100 BP`.

---

## 6. Official InnoGames CDN Sprite & Map Asset Catalog

The following live asset URLs were extracted from the official Grepolis client stylesheets (`https://hu119.grepolis.com/cache/css/merged/game_0.css` .. `game_9.css`) and Knowledge Base pages for direct use in our MapLibre `TacticalLayerRegistry` and Endgame War Room UI:

### 6.1 World Map City Skins & Endgame Overlays (`gphu.innogamescdn.com`)
| Asset Purpose | Day Sprite URL | Night Sprite URL |
| :--- | :--- | :--- |
| **Default Towns Sprite** | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_default_ec44efa.png` | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_default_night_3bc02a1.png` |
| **World Wonder Winner City Skin** | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_world_wonder_872354a.png` | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_world_wonder_night_de7b6f4.png` |
| **Domination Winner City Skin** | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_domination_b8671f2.png` | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_domination_night_abd2d36.png` |
| **Olympus Winner City Skin** | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_olympus_66b0d5e.png` | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_olympus_night_b68b555.png` |
| **Portal Temple Map Skin** | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_portal_d99b3b9.png` | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_portal_night_98d6ea7.png` |
| **Ghost Town Map Skin** | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_ghost_town_9566845.png` | `https://gphu.innogamescdn.com/images/game/autogenerated/map/towns/town_skins/city_skin_ghost_town_night_4c26ba3.png` |
| **Colonization Slot (`inv_spo`)** | `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/colo_map_icon_city_day_f16df6c.png` | `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/colo_map_icon_city_night_c37c29b.png` |
| **Wonder Foundation Spot (`wbg`)** | `https://gphu.innogamescdn.com/images/game/map/wonder_building_spot_2.16.png` | — |

### 6.2 Olympus Map Temples, Shields & UI Sprites (`gphu.innogamescdn.com`)
- **All Map Temples Sprite Sheet (`small_temple_*`, `large_temple_*`, `olympus_temple`)**:
  - `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/sprite_images/olympus_map_temples_18d4fe0.png`
- **Temple Protection Shield Overlays (Map)**:
  - **Mount Olympus Shield**: `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/olympus_shield_22775c9.png`
  - **Small Temple / City Blessing Shield**: `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/city_shield_blessing_a222cce.png`
  - **Large Temple Zeus Shield**: `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/large_temple_zeus_shield_2c14ba5.png`
  - **Large Temple Poseidon Shield**: `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/large_temple_poseidon_shield_15aaf34.png`
  - **Large Temple Hera Shield**: `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/large_temple_hera_shield_f66018b.png`
  - **Large Temple Athena Shield**: `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/large_temple_athena_shield_89be67b.png`
  - **Large Temple Hades Shield**: `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/large_temple_hades_shield_bd8347d.png`
  - **Large Temple Artemis Shield**: `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/large_temple_artemis_shield_a6a3281.png`
  - **Large Temple Aphrodite Shield**: `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/large_temple_aphrodite_shield_259d05b.png`
  - **Large Temple Ares Shield**: `https://gphu.innogamescdn.com/images/game/autogenerated/map/town_overlay/large_temple_ares_shield_ed6fd73.png`
- **Large Temple Info Banners (War Room Cards)**:
  - Zeus: `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/single_images/large_temple_info_zeus_efd1ace.png`
  - Poseidon: `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/single_images/large_temple_info_poseidon_55c1199.png`
  - Hera: `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/single_images/large_temple_info_hera_358d141.png`
  - Athena: `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/single_images/large_temple_info_athena_873a8a3.png`
  - Hades: `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/single_images/large_temple_info_hades_47bf628.png`
  - Artemis: `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/single_images/large_temple_info_artemis_57bdc88.png`
  - Aphrodite: `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/single_images/large_temple_info_aphrodite_fb472f4.png`
  - Ares: `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/single_images/large_temple_info_ares_3b11f7a.png`
  - Small Temple Info: `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/single_images/small_temple_info_6935093.png`
  - Olympus Overview Banner: `https://gphu.innogamescdn.com/images/game/autogenerated/olympus/single_images/overview_olympus_dc9b6ad.png`

### 6.3 Domination, World Wonders & Artifact Sprite Sheets (`gphu.innogamescdn.com`)
- **Domination Valid Island Marker (KB)**: `https://tools-files.innogamescdn.com/support-knowledgebase/article/4485/92c2064815426a0af838c1d2d4ac312e`
- **Domination UI Sprite Sheet ( includes `DOMINATION_AREA_MARKER`)**: `https://gphu.innogamescdn.com/images/game/autogenerated/domination/sprite_images/domination_d3e215b.png`
- **Domination Last Stand Background**: `https://gphu.innogamescdn.com/images/game/autogenerated/domination/single_images/dominance_last_stand_bg_870c8ba.jpg`
- **World Wonders Trade Icon**: `https://gphu.innogamescdn.com/images/game/autogenerated/world_wonders/ww_trade_2.70.png`
- **World Wonders Profile Crowns**: `https://gphu.innogamescdn.com/images/game/autogenerated/profile/wonders/profile_crowns_df3b8a8.png`
- **Artifacts Sprite Sheet**: `https://gphu.innogamescdn.com/images/game/autogenerated/world_masters/sprite_images/world_masters_artifacts_fc9cae1.png`
