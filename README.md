# SportsBuddy

Sports Buddy — a sports matchmaking platform for university students.

- **Team**: Falcons (Group 12)
- **Course**: EE308FZ Software Engineering
- **CSDN Team Account**: https://blog.csdn.net/2601_97187573

## Repository Structure

```
SportsBuddy/
├── WORKLOG.md              # team work log (add a row for every change)
├── assignment2/            # Assignment 2 — Team Formation & Topic Selection
│   ├── blog/               # team blog (markdown source)
│   ├── docs/               # Requirements Specification V2.2
│   └── slides/             # topic selection presentation
├── assignment3/            # Assignment 3 — Requirement Analysis
│   ├── blog/               # new blog post (markdown)
│   ├── srs/                # SRS V3.0 (Word + PDF)
│   ├── diagrams/           # UML class diagram, ER diagram, etc.
│   ├── prototypes/         # interface prototypes (Figma exports, images)
│   └── slides/             # requirements analysis presentation
└── src/                    # source code (added in the development phase)
```

## How to contribute

See [CONTRIBUTING.md](CONTRIBUTING.md). Each member uploads their work to the folder
that matches their role. Put files in the right folder and open a pull request.

## Testing

Backend tests run against an in-memory SQLite database, no setup required.

```bash
cd src/backend
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest                     # 76 tests: 12 per-issue acceptance files + E2E flow
python -m ruff check .               # code standard check (0 errors)
python tools/race_probe.py           # DEF-01 regression probe (exit 0 = capacity holds)
```

UI end-to-end test (real backend + real headless browser, covers login → review):

```bash
# 1) backend on :8000 with a throwaway database
cd src/backend
SPORTMATE_DATABASE_URL=sqlite:///./e2e.db python -m uvicorn main:app --port 8000
# 2) static frontend on :5178 (another terminal)
cd src/frontend && node tools/server.mjs
# 3) drive the browser, screenshots land in docs/e2e/
node src/frontend/tools/e2e.mjs --out=docs/e2e
```

> 若你的环境使用 `py` 启动器，把上面的 `python` 换成 `py` 即可。
> Windows 下设置环境变量用 `$env:SPORTMATE_DATABASE_URL="sqlite:///./e2e.db"`。

Test reports:

- [`docs/test-report-2026-11-28.md`](docs/test-report-2026-11-28.md) — regression after the DEF-01/DEF-02 fixes
- [`docs/e2e/e2e-report-2026-11-28.md`](docs/e2e/e2e-report-2026-11-28.md) — UI E2E run and the defects it found
- [`docs/alpha-test-report-2026-11-24.md`](docs/alpha-test-report-2026-11-24.md) — first Alpha test round
