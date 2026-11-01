# Falcons — Assignment 4: Interface Prototype Design

| Item | Content |
| --- | --- |
| **Course** | EE308FZ Software Engineering — [CSDN community 2601_FZU-MU_SE](https://bbs.csdn.net/forums/2601_MU_SE_FZU) |
| **Assignment Requirement** | [Fourth assignment — Prototype design](https://bbs.csdn.net/topics/620556488) |
| **Team Name** | Falcons (Group 12) |
| **Project Name** | Sports Buddy — a sports matchmaking platform for university students |
| **Assignment Goal** | Design and publish an interactive interface prototype for Sports Buddy, covering the full user journey from login to review, and report the design process, tool, design concepts, difficulties and results. |
| **Other References** | *The Method of Construction* (Zou Xin); GB/T 8567-2006; the team's SRS V3.1 and Assignment 4 requirements |

## Contents

- [Deliverables at a Glance](#deliverables-at-a-glance)
1. [Team Organization and Progress](#1-team-organization-and-progress)
2. [Project Division of Labor](#2-project-division-of-labor)
3. [Interface Prototype Design](#3-interface-prototype-design)
4. [Difficulties and Solutions](#4-difficulties-and-solutions)
5. [Team Collaboration](#5-team-collaboration)
6. [Team Photo and Feelings](#6-team-photo-and-feelings)
7. [References](#7-references)

---

## Deliverables at a Glance

| Deliverable | Link |
| --- | --- |
| Interactive prototype (MoDao) | [Open the prototype](https://modao.cc/proto/Ebn0JeMtntbdoIJ4M1YfJ/sharing?view_mode=device&screen=rbpVZhivzU9Oi3sQI&canvasId=rcVZhizWXA9fQ9c4) |
| Prototype design report PPT | 【待填：PPT 链接】 |
| PPT PDF | 【待填：PPT PDF 链接】 |
| Prototype source / screenshots | [assignment4/prototype](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/tree/main/assignment4/prototype) |
| Testing evidence | [assignment4/testing](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/tree/main/assignment4/testing) |
| Team repository | [Falcons-FZU-MU-SE-GROUP12/SportsBuddy](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy) |

---

## 1. Team Organization and Progress

### 1.1 Organization

Falcons has 13 members and one team leader, organised into six functional groups: Project Management, Product Requirements, Frontend Development, Backend Development, Algorithm, and Testing. For this assignment, the product and frontend groups built the interactive prototype, the backend and algorithm groups supplied the business rules shown in the screens, and the testing group ran the walkthrough.

### 1.2 Roles

| Group | Members | Responsibility in this assignment |
| --- | --- | --- |
| Project Management | Huang Zhiyuan (Team Lead) | Schedule, coordination, blog, integration, submission |
| Product Requirements | Zhang Zile, Ye Yifan | Prototype structure, interaction flow, design concepts |
| Frontend Development | Lin Zijun, Li Zhenhao, Li Haoze, He Jinghao | Screen production, visual consistency, interaction details |
| Backend Development | Zhang Jingtian, Yu Chenghao, Zhang Xinyu, Xu Boyu | Business-rule states (capacity, credit limit, check-in, permissions) |
| Algorithm | Cai Yaohua | Matching and reliability logic, LLM research |
| Testing | Wang Shaojie | Walkthrough, defect list, acceptance |

### 1.3 Progress Schedule

| Stage | Time | Deliverable |
| --- | --- | --- |
| Preparation | 10/26 – 10/27 | Project set-up, screen ownership, flow map |
| Screen production | 10/27 – 10/28 | 12 interactive screens, business-rule states |
| Visual consistency & review | 10/28 – 10/29 | Unified style, defect list, fixes |
| Publication | 10/29 – 10/31 | Public prototype link, testing report |
| Report & submission | 10/31 – 11/01 | Blog, PPT, final submission |

The assignment follows a one-week cycle; specific dates are adjusted according to the course arrangement.

---

## 2. Project Division of Labor

All 13 members share an equal estimated contribution for this assignment — **about 7.7% each, totaling 100%**. The ratio is an estimate and will be adjusted by the team performance assessment.

| Student ID | Work Description | Contribution |
| --- | --- | --- |
| 832401112 | Huang Zhiyuan — Project management, schedule, blog writing, integration and final review | 7.7% |
| 832401325 | Zhang Zile — Prototype project set-up, P-01–P-03, interaction flow, presentation | 7.7% |
| 832401321 | Ye Yifan — Flow/hotspot map, P-04–P-06, interaction details | 7.7% |
| 832401311 | Lin Zijun — P-07–P-08 (check-in, manage activity) | 7.7% |
| 832401310 | Li Zhenhao — P-09–P-10 (my activities, me), visual consistency | 7.7% |
| 832401309 | Li Haoze — P-11 (profile), visual consistency, PPT layout | 7.7% |
| 832401307 | He Jinghao — P-12 (reviews), interaction details, PPT layout | 7.7% |
| 832401323 | Zhang Jingtian — Business-rule states (capacity, credit limit, cancel penalty) | 7.7% |
| 832401322 | Yu Chenghao — Business-rule states, functional description | 7.7% |
| 832401324 | Zhang Xinyu — Check-in / location / permission rules | 7.7% |
| 832401320 | Xu Boyu — Permission rules, walkthrough support | 7.7% |
| 832401302 | Cai Yaohua — Matching and reliability display, LLM research | 7.7% |
| 832401219 | Wang Shaojie — Walkthrough, defect list, acceptance | 7.7% |

---

## 3. Interface Prototype Design

### 3.1 Tool and Links

- **Design tool**: **MoDao (墨刀)** — a specialised prototyping tool. Share link: [Sports Buddy prototype](https://modao.cc/proto/Ebn0JeMtntbdoIJ4M1YfJ/sharing?view_mode=device&screen=rbpVZhivzU9Oi3sQI&canvasId=rcVZhizWXA9fQ9c4)
- **Interactive demo**: the 12 screens are embedded in the MoDao project as interactive HTML pages, so the flow can be opened and demonstrated directly during the defence.
- **Prototype pages**: [assignment4/prototype](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/tree/main/assignment4/prototype)

### 3.2 Design Concepts

The prototype follows the product vision: **"buddy up, easily, well and precisely"**.

1. **Buddy up, easily** — the home page supports one-sentence search (e.g. "Basketball at Qishan campus tonight, beginners OK") and returns ranked activities, so finding a game takes seconds.
2. **Buddy up, well** — check-in, mutual reviews and a credit score make reliable people stand out and reduce no-shows.
3. **Buddy up, precisely** — matching considers sport, campus/time, skill level, distance and the organiser's reliability, and explains *why* an activity matches.

Visual design principles:

- **Mobile-first**: a 390 × 844 phone frame is the primary canvas; the layout also adapts to 320 px, 768 px and 1280 px without horizontal overflow.
- **Warm, energetic palette**: orange as the action colour, dark text on a light background, with clear hierarchy.
- **Low cognitive load**: one primary action per screen, clear status (full / joined / checked in), and explicit feedback after every action.

### 3.3 Design Process

1. **Requirement mapping** — the 12 screens were derived from the SRS (M1–M5) and the 41 use cases.
2. **Information architecture** — login → discovery → activity list → activity detail (participant / organizer) → create → check-in → manage → my activities → me → profile → reviews.
3. **Screen production** — each screen was produced with the assigned owner, then reviewed against the requirement it serves.
4. **Interaction wiring** — buttons, tabs, forms, modals and page transitions were linked into a continuous flow.
5. **Business-rule states** — full capacity, credit score below 60, late cancellation, check-in code/location and permission differences were added as visible states.
6. **Review and regression** — the testing group walked through the flow against the SRS; defects were fixed and re-verified.

### 3.4 Interface Overview (12 screens)

| # | Screen | Purpose |
| --- | --- | --- |
| P-01 | Login / Register | Entry, demo account |
| P-02 | Discovery Home | One-sentence search, recommendations |
| P-03 | Activity List | Filters by sport, time, level, campus |
| P-04 | Activity Detail (participant) | Join, see participants, status |
| P-05 | Activity Detail (organizer) | Manage, see sign-ups |
| P-06 | Create Activity | Time, place, headcount, level |
| P-07 | Check-in | Code or location (300 m) |
| P-08 | Manage Activity | Attendance, cancellation |
| P-09 | My Activities | Organised / joined |
| P-10 | Me | Profile, credit score, settings |
| P-11 | Profile (other user) | Credit and reviews |
| P-12 | Review Partners | Stars and impression tags |

**Main flow**: Login → Discovery → Activity list → Detail → Sign up → Check-in → Review.

### 3.5 Requirements Alignment

| Requirement module | Covered by |
| --- | --- |
| M1 User & authentication | P-01, P-10 |
| M2 Activity publishing | P-06, P-05 |
| M3 Matching & discovery | P-02, P-03 |
| M4 Sign-up & participation | P-04, P-07, P-08, P-09 |
| M5 Reliability & credit | P-04, P-11, P-12 |

### 3.6 Prototype Checklist

- [x] All 12 screens reachable and clickable
- [x] Main flow works end to end
- [x] Business-rule states visible (capacity, credit, cancellation, check-in)
- [x] Responsive at 320 / 768 / 1280 px without horizontal overflow
- [x] Consistent colour, typography and components
- [x] Real-browser verification (108 checks) and end-to-end flow (21 steps)
- [ ] Non-posed team discussion photo 【待填】
- [x] Public prototype link (MoDao)

---

## 4. Difficulties and Solutions

### 4.1 Difficulty 1 — Screen layout collapsed because of a CSS class mismatch

- **Difficulty**: in the interactive prototype, the class name used in CSS (`.proto-screen`) differed from the class name in the HTML (`screen`). The `display: none` rule therefore never applied, and all 12 screens were laid out at the same time.
- **Attempts and result**: the team inspected the computed layout, traced the selector mismatch and unified the class name to `.screen`. **Solved.**
- **Gain**: we learned to verify rendered layout (not just source code) and to keep a single naming convention between design and implementation.

### 4.2 Difficulty 2 — The mobile top bar covered the screens

- **Difficulty**: the media query that hides the top bar on phones was written *before* the base `.proto-chrome { display: flex }` rule, so it was overridden; at 390 px the bar occupied about 130 px.
- **Attempts and result**: the rule order was corrected and the media query moved to the end of the stylesheet; the bar now hides correctly. **Solved.**
- **Gain**: CSS cascade order matters; responsive rules must be verified at real device widths.

### 4.3 Difficulty 3 — A fixed floating button appeared on every screen

- **Difficulty**: the floating action button used `position: fixed`, so it floated above all 12 screens instead of only its own screen.
- **Attempts and result**: the button was scoped under `.screen.is-active`, so it is only visible on the active screen. **Solved.**
- **Gain**: global positioning must be scoped when multiple screens share one page.

### 4.4 Difficulty 4 — Feedback messages and navigation parameters were lost

- **Difficulty**: success/error messages were cleared by the router before being rendered, so login feedback never appeared. In the web app, the login token was not persisted (causing a 401 on the next request) and route parameters were dropped (requests went to `/activities/NaN`).
- **Attempts and result**: a `flashPending` flag was introduced so messages survive navigation; the token is now written to storage on login; route parsing was corrected to pass `activityId` / `userId`. **Solved** and verified in a real browser.
- **Gain**: state that must survive navigation needs an explicit lifecycle, and route parameters need dedicated tests.

### 4.5 Difficulty 5 — Small-screen overflow of the class diagram

- **Difficulty**: the class-diagram page overflowed horizontally by 12 px at 390 px because a grid column had a fixed minimum of 360 px.
- **Attempts and result**: the generator was changed to `minmax(min(360px, 100%), 1fr)` and a `max-width` media query was added, then the diagram was regenerated; the SVG diff was zero. **Solved.**
- **Gain**: layout constraints must be tested at the narrowest supported width.

### 4.6 Gains

- Built an **automated regression suite**: 188 Node checks and 108 real-browser checks (via the DevTools Protocol and headless Edge), covering titles, rendering, `undefined`/`NaN`, overflow and console errors.
- Added an **end-to-end user journey test** (21 steps: login → discover → sign up → check in → review).
- Learned to do **root-cause analysis** instead of patching symptoms, and to keep the prototype, the web app and the share package generated from one source.

---

## 5. Team Collaboration

- **Repository and folders**: all deliverables live in the shared GitHub repository under fixed folders (`assignment4/prototype`, `assignment4/slides`, `assignment4/evidence`, `assignment4/testing`).
- **Work log**: every change is recorded in `WORKLOG.md` (date, member, type, files, summary, assignment), which makes contributions traceable.
- **Task allocation**: each screen and each document has one owner and one reviewer; the lead tracks the critical path.
- **Communication**: daily coordination in the team chat group; issues that affect several groups are decided in the group.
- **Review and integration**: the testing group walked through the prototype against the SRS, produced a defect list, and the owners fixed and re-verified each item; the final share package was regenerated from the same source.

---

## 6. Team Photo and Feelings

### 6.1 Team Photo

![Team discussion (non-posed)](【待填：团队非摆拍讨论照片】)

*Non-posed photo of the team during a discussion.*

### 6.2 Team Feelings and Evaluations

| Member | Role | Comment |
| --- | --- | --- |
| Zhang Zile | Product Requirements | I've had a great experience working with the team so far. Whenever we face challenges, we communicate and discuss them together, each doing our part and collaborating seamlessly. I'm looking forward to us successfully completing the project and wrapping it up smoothly! |
| Ye Yifan | Product Requirements | During the prototype design and overall framework establishment phase, the team repeatedly deliberated on the details of the plan, proactively anticipated potential risks in the development process, and continuously optimized the design concept. The rigorous refinement process reduced potential development risks in the future and made the project plan more reliable and feasible. |
| Lin Zijun | Frontend Development | This is a team that finishes things: they started with a vague idea about campus sports and ended with a product that actually works. |
| Li Zhenhao | Frontend Development | Working on this sports buddy project together is more than just finishing a product for me. Everyone takes charge of their own part, with the backend, product and design teams cooperating closely. We discuss problems together, and anyone who gets stuck gets support from the rest. As a frontend developer, many of my ideas about interfaces and interactions have been refined thanks to our group discussions. The process of iterating and adjusting alongside all of you means more to me than the final result. |
| Li Haoze | Frontend Development | The team demonstrates strong execution capability, transforming an initial, imprecise concept centered on campus sports into a viable and functioning end product |
| He Jinghao | Frontend Development | Our teammates have a strong sense of responsibility. We proactively discuss and adjust plans, enjoy great collaboration, and help one another to finish the SportsBuddy project. |
| Zhang Jingtian | Backend Development | In this software engineering course project, I am fortunate to design SportsBuddy together with all team members. From requirement investigation and discussions on functional solutions to prototype design and module division, everyone has been actively involved and communicated proactively. When facing conflicting requirements or technical challenges, our team can discuss, weigh options and support one another. This collaboration has made me realize that a software project is not an individual task, but an outcome generated through the collision of ideas and mutual cooperation among members. |
| Yu Chenghao | Backend Development | Our team has clear goals and moves at a great pace—from choosing Modao for prototyping to setting up the overall framework, everything feels efficient and gives me a lot of confidence for the upcoming development. |
| Zhang Xinyu | Backend Development | Our team keeps efficient communication during daily development. We regularly synchronize progress on GitHub, fix bugs promptly and adjust our implementation plans in time. Continuous small-step iterations help us steadily push the campus sports project forward. |
| Xu Boyu | Backend Development | Everyone's role is well-defined and our communication is direct; building the initial prototype first and then iterating through feedback gives the whole project a strong sense of direction. |
| Cai Yaohua | Algorithm | Team members have their respective roles. We prioritize delivering the minimum viable prototype and keep refining it based on feedback. The project maintains a manageable pace with clear goals and stays on track. |
| Wang Shaojie | Testing | This team has shown me the power of teamwork. We split tasks clearly, and we always pull together to get through every difficulty. |

**Team summary**: the team kept a clear division of labour and direct communication throughout the assignment. Starting from the shared SRS and the 12-screen prototype, each member owned a screen or a document section, and the testing group verified the flow against the requirements. Iterating on a working prototype instead of a static design gave the team a concrete basis for discussion and reduced the risk before development.

---

## 7. References

1. Zou Xin. *The Method of Construction*.
2. GB/T 8567-2006 *Computer Software Documentation Guide*.
3. Team repository: [Falcons-FZU-MU-SE-GROUP12/SportsBuddy](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy)
4. Assignment 4 requirements: [Fourth assignment — Prototype design](https://bbs.csdn.net/topics/620556488)
