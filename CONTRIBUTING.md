# Contributing Guide — Falcons / SportsBuddy

This repo is the shared workspace for all team deliverables. Upload your work to the
folder that matches your task.

## 1. Where to put your files

| Folder | Deliverable | Owner (group) |
| --- | --- | --- |
| `assignment3/blog/` | Assignment 3 blog post (markdown) | Team lead (Huang Zhiyuan) |
| `assignment3/srs/` | SRS V3.0 — Word **and** PDF | Backend group + Product group |
| `assignment3/diagrams/` | UML class diagram, ER diagram, flow diagrams | Backend group + Cai Yaohua |
| `assignment3/prototypes/` | Interface prototypes (Figma export, PNG/JPG) | Product group + Frontend group |
| `assignment3/slides/` | Requirements analysis presentation (PPTX + PDF) | Frontend group (layout) + all |
| `assignment2/` | Previous assignment (archived) | — |
| `src/` | Source code | Frontend / Backend groups |

## 2. Two ways to upload

### Option A — Web upload (for documents / non-coding members)

1. Go to the target folder on GitHub.
2. Click **Add file → Upload files**.
3. Drag your file in, write a short commit message (e.g. `add SRS user-scenario chapter`).
4. Commit directly to `main` (or create a branch and open a PR).

### Option B — Git + Pull Request (preferred for code and markdown)

```bash
git clone https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy.git
cd SportsBuddy
git checkout -b feat/<your-name>-<task>
# ...add your files...
git add .
git commit -m "add <what you did>"
git push -u origin feat/<your-name>-<task>
```

Then open a **Pull Request** on GitHub. At least one teammate reviews and merges.

## 3. Rules

- **Do not edit someone else's file without telling them.** If you need to change it,
  say so in the group chat first.
- **One task, one branch, one PR** — keeps history clear.
- Do **not** force-push to `main` or delete others' files.
- Keep filenames in English (e.g. `srs-v3.0.docx`) so everyone can read them.
- Mark unfinished parts with `【TODO】` instead of leaving them blank.

## 4. Progress tracking

Tasks are tracked on the org project board. Move your card when you start and finish.
