# Falcons — Assignment 3: Requirement Analysis

| Item | Content |
| --- | --- |
| **Course** | EE308FZ Software Engineering — [CSDN community 2601_FZU-MU_SE](https://bbs.csdn.net/forums/2601_MU_SE_FZU) |
| **Assignment Requirement** | [Third assignment — Requirement Analysis](https://bbs.csdn.net/topics/620549144) |
| **Team Name** | Falcons (Group 12) |
| **Assignment Goal** | Refine the requirements specification into a complete SRS (V3.1) — adding user scenarios, the class diagram, interface prototypes, functional descriptions and acceptance/verification criteria — and deliver it together with the requirements-analysis presentation and this blog. |
| **Other References** | *The Method of Construction* (Zou Xin); GB/T 8567-2006 *Computer Software Documentation Guide* (SRS structure); the DES-RSA SRS example provided in the assignment post |

## Contents

1. [Team Division of Labor](#1-team-division-of-labor)
2. [Software Requirements Specification](#2-software-requirements-specification)
3. [Team Organization and Schedule](#3-team-organization-and-schedule)
4. [Team Collaboration](#4-team-collaboration)
5. [Key Points and Challenges](#5-key-points-and-challenges)
6. [References](#6-references)

---

## 1. Team Division of Labor

### 1.1 Team Organization

Falcons has 13 members and one team leader. The team is organised into six functional groups — Project Management, Product Requirements, Frontend Development, Backend Development, Algorithm, and Testing — so that every member owns a clear part of the requirements analysis work.

| Group | Members | Main responsibilities |
| --- | --- | --- |
| Project Management | Huang Zhiyuan (Team Lead) | Schedule, coordination, risk tracking, blog writing, external communication |
| Product Requirements | Zhang Zile, Ye Yifan | User research, user scenarios, SRS writing, interface prototypes |
| Frontend Development | Lin Zijun, Li Zhenhao, Li Haoze, He Jinghao | Interface prototypes, UI consistency, frontend-related functional descriptions |
| Backend Development | Zhang Jingtian, Yu Chenghao, Zhang Xinyu, Xu Boyu | Class diagram, data/functional descriptions, acceptance criteria, Word formatting |
| Algorithm | Cai Yaohua | Matching / reliability module modelling, class-diagram support |
| Testing | Wang Shaojie | Acceptance and verification criteria, SRS consistency checklist |

### 1.2 Division of Labor and Contribution

All 13 members share an equal estimated contribution for this assignment — **about 7.7% each, totaling 100%**. The rating is an estimate; the final proportion is adjusted by the team performance assessment.

| Student ID | Task Description | Contribution |
| --- | --- | --- |
| 832401112 | Huang Zhiyuan — Project management; schedule coordination; blog writing; integration and final review | 7.7% |
| 832401325 | Zhang Zile — User research and user scenarios; SRS writing; interface prototype design | 7.7% |
| 832401321 | Ye Yifan — User scenarios; SRS writing; functional description and prototype review | 7.7% |
| 832401311 | Lin Zijun — Interface prototypes; frontend-related functional description | 7.7% |
| 832401310 | Li Zhenhao — Interface prototypes; UI consistency review | 7.7% |
| 832401309 | Li Haoze — Interface prototypes; frontend functional description | 7.7% |
| 832401307 | He Jinghao — Interface prototypes; interaction description and review | 7.7% |
| 832401323 | Zhang Jingtian — Class diagram; data and functional description; acceptance criteria | 7.7% |
| 832401322 | Yu Chenghao — Class diagram; functional description; SRS Word formatting | 7.7% |
| 832401324 | Zhang Xinyu — Class diagram; acceptance and verification criteria | 7.7% |
| 832401320 | Xu Boyu — Class diagram; acceptance and verification criteria; formatting review | 7.7% |
| 832401302 | Cai Yaohua — Matching and reliability module modelling; class-diagram support | 7.7% |
| 832401219 | Wang Shaojie — Acceptance/verification criteria; SRS consistency checklist and review | 7.7% |

---

## 2. Software Requirements Specification

### 2.1 Document Links

The SRS was further improved from the previous assignment (V2.2 → V3.1). Both the required Word version and a PDF for easier reading are available in the team repository:

- **Word (required)**: [需求规格说明书V3.1.docx](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/blob/main/assignment3/srs/需求规格说明书V3.1.docx)
- **PDF (recommended)**: [需求规格说明书V3.1.pdf](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/blob/main/assignment3/srs/需求规格说明书V3.1.pdf)
- **Requirements-analysis presentation**: [To be added after the PPT is uploaded]

### 2.2 Document Structure and Coverage

The document follows the reference structure required by the assignment and the national SRS guide:

| Section | Coverage |
| --- | --- |
| 1 Introduction | Purpose, project background, references, requirement numbering and priority conventions |
| 2 Overall Description | Objectives, development intention, application scope, product prospects, user roles, assumptions and dependencies, research summary |
| 3 Specific Requirements | Functional requirements M1–M5 (48 requirements) with priorities and business rules |
| 4 Interface Prototype | 12 high-fidelity screens covering login, discovery, activity detail, creation, check-in, management, review and profile |
| 5 Class Diagram | Domain class model (User, Activity, Sign-up, Review, Reliability, etc.) with relationships |
| 6 User Scenarios | 41 use cases / user scenarios describing real usage flows |
| 7 Functional Description and Acceptance | Detailed functional descriptions, input/output formats, acceptance criteria, traceability matrix, change and review process |

### 2.3 Key Artifacts

- **Domain class diagram**: [领域类图](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/blob/main/assignment3/diagrams/领域类图.jpg) (also provided as a version suited for document insertion)
- **Interface prototypes (12 screens)**: [assignment3/prototypes](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/tree/main/assignment3/prototypes)
- **Implementation prototype / source code**: [src/](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/tree/main/src)

The full SRS is not repeated in the presentation; the presentation focuses on the project background, the development content (including the class diagram) and the plan execution.

---

## 3. Team Organization and Schedule

### 3.1 Organization

The team uses a lightweight matrix structure: the team lead coordinates schedules and integration, while each functional group owns its deliverables. Tasks are tracked in folders of the shared GitHub repository and on the group task board.

### 3.2 Schedule

| Stage | Time (planned) | Main work | Deliverable |
| --- | --- | --- | --- |
| Requirements consolidation | Week 1 | Review V2.2, collect real user feedback, split writing tasks | Chapter assignments |
| Document writing | Week 1–2 | User scenarios, class diagram, interface prototypes, functional descriptions, acceptance criteria | SRS V3.0 draft |
| Review and integration | Week 2 | Cross-review, terminology and figure consistency, Word formatting | SRS V3.1 |
| Presentation and submission | Week 2 | Build the PPT, rehearse, publish the blog, upload files | Blog + SRS + PPT |

Specific dates are adjusted according to the course arrangement and the teacher's instructions.

### 3.3 Responsibilities and Workload

Each member's specific responsibility is listed in the division-of-labor table in Section 1.2, and the workload proportion for this document task is **7.7% per member** (equal share, adjusted later by the team performance assessment).

---

## 4. Team Collaboration

### 4.1 Task Allocation

At the start of the assignment, the team lead split the SRS into chapters and mapped them to the six functional groups. Every task had one owner and one reviewer, which avoided duplicated work and unclear responsibility.

### 4.2 Progress Synchronization

- A short online meeting at the beginning of each week confirmed the current progress and the next milestone.
- Completed items were marked on the task board; blockers were raised immediately in the group chat.
- The team lead tracked the critical path (SRS body → class diagram → prototypes → review) and re-assigned work when a part fell behind.

### 4.3 Document Collaboration

- The SRS was written chapter by chapter and merged by the product group, which kept one unified style and terminology.
- The Word document is the single source of truth; the PDF is exported from it for reading.
- All deliverables are stored in the shared GitHub repository under clear folders (`assignment3/srs`, `assignment3/diagrams`, `assignment3/prototypes`, `assignment3/slides`, `assignment3/blog`).
- Every member has write access to the organisation, so files can be uploaded directly, while the folder structure and the contribution guide (`CONTRIBUTING.md`) prevent files from being mixed up.

### 4.4 Communication

Daily coordination happens in the team chat group (QQ/WeChat); technical and document issues are discussed in the GitHub repository and in short online meetings. Questions that affect the whole team are decided in the group rather than in private chats.

### 4.5 Integration and Review

- Each chapter was reviewed by at least one member outside its authoring group.
- The testing member checked the SRS checklist (introduction, user scenarios, class diagram, prototypes, functional description, acceptance criteria, figures, formatting, style).
- The team lead performed the final integration: consistent product name, consistent figure numbering, and a final export of both Word and PDF.

---

## 5. Key Points and Challenges

### 5.1 Key Points

1. **Traceability**: every functional requirement is linked to a use case and to acceptance criteria, so the document can be checked item by item.
2. **Consistency**: the class diagram, the interface prototypes and the functional descriptions must describe the same system; terminology and figure numbering are therefore unified across chapters.
3. **Reader perspective**: the document was reviewed by members who did not write a chapter, to confirm that someone unfamiliar with the project can still understand what the software does.

### 5.2 Challenges and Solutions

| Challenge | Solution |
| --- | --- |
| The previous SRS (V2.2) focused on requirements and had no class diagram or interface prototypes | Added a domain class diagram and 12 high-fidelity prototype screens, then linked them back to the relevant requirements |
| User research in the previous version used simulated data | Clearly marked the data as simulated in the document; planned and started real user interviews/surveys to validate the assumptions |
| Large document with many figures; Word and PDF must stay consistent | Treated Word as the single source of truth and exported the PDF from it; kept figure numbering and captions in one place |
| Product naming differed between documents (the earlier draft used a temporary name) | Unified the product name to **Sports Buddy** across the SRS, presentation and blog |
| Merging chapters written by different members | Fixed a chapter template and a terminology list before writing, then cross-reviewed and merged by the product group |

---

## 6. References

1. Zou Xin. *The Method of Construction*.
2. GB/T 8567-2006 *Computer Software Documentation Guide*.
3. Assignment 3 reference SRS example (DES-RSA hybrid encryption), provided in the assignment post.
4. Team repository: [Falcons-FZU-MU-SE-GROUP12/SportsBuddy](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy)
