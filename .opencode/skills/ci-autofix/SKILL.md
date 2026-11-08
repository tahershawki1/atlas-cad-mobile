---
name: ci-autofix
description: After every GitHub push, watch CI (pages.yml / android-release.yml), fix failures, re-push, and repeat until every run is green. Never claim done until ci-watch exits 0.
---

# ci-autofix — CI verification + auto-fix loop

Goal: after pushing to GitHub, **verify CI actually passed, fix any failure, push again — and do not stop until 100% green.**

## When to use

Use this skill **every time** after `git push` in this repo (and any repo using this script). Do not report "done" until the loop below ends with `SUCCESS`.

## Preconditions (one-time)

- `tools/ci-watch.py` exists at repo root (`atlas-cad-mobile/tools/ci-watch.py`).
- Auth for GitHub Actions read — pick one:
  - Env token (recommended on this phone, no `gh` CLI needed):
    ```sh
    export GH_TOKEN=ghp_...   # fine-grained PAT: Actions: Read, Contents: Read
    ```
  - Or `gh auth login` (script auto-detects `gh auth token`).
- Repo `origin` points to `github.com:<owner>/<repo>.git` so the script can auto-detect it. Otherwise pass `--repo owner/name`.

## Workflows in this repo

| File | Triggers | What it does |
|---|---|---|
| `.github/workflows/pages.yml` | push to `main` on `atlas-mobile/**`, + manual | `npm ci → test → build → Pages deploy` |
| `.github/workflows/android-release.yml` | `v*` tags, + manual | `npm ci → test → build → cap sync → assembleDebug → release APK` |

Note: a push that touches **nothing** under `atlas-mobile/**` starts **zero** runs. That is not a pass. `ci-watch.py --once` then exits `4`. Only treat `0` (SUCCESS) as green.

## The loop (mandatory, in order)

From repo root (`atlas-cad-mobile/`):

```sh
# 0. Local gate BEFORE push (build-verify skill, sequential)
cd atlas-mobile && npm run typecheck && npm test && npm run build

# 1. Push
cd .. && git push origin main

# 2. Watch CI until it finishes (blocks until completed, timeout 45m)
python3 tools/ci-watch.py --sha "$(git rev-parse HEAD)"
# exit codes: 0 = green, 1 = failed (logs printed), 2 = still running/timeout, 3 = auth, 4 = no run found
```

### If exit `0` → SUCCESS. Stop. Report run URL(s). Done.

### If exit `1` → failure. Do this, then go back to step 0:

1. Read the log tail printed by `ci-watch.py` (failed job + step name + last 300 log lines). Also open `html_url` if needed via `webfetch`.
2. **Reproduce locally first** with the exact same command the failed step ran (e.g. `npm test`, `npm run build`, `./gradlew assembleDebug`). Never guess a fix without a local repro.
3. Classify the failure:
   - **Code/test/type error** → fix source, re-run local gate, commit, push. Continue loop.
   - **Dependency install / CDN flake** (`npm ci`, sharp endpoints) → re-run CI once (`gh run rerun` or new empty commit); if it repeats, check `package.json`/lockfile.
   - **Build error (tsc/vite)** → fix, local `npm run build` must pass before re-push.
   - **Android/Gradle error** → fix, try local `assembleDebug` if memory allows (warn: slow on this phone, may be killed); otherwise fix from logs and re-push.
   - **Secrets/permissions/billing/infra** (e.g. `Resource not accessible`, missing secret, Actions disabled) → **STOP, do not loop.** Report exact error + what the user must do (create secret, grant permission). Cannot be fixed by pushing.
4. Commit with a clear message (`fix(ci): ...`), push, watch again.

### If exit `2` → still running / timeout. Re-run the same watch command (it picks up the same SHA). Do not push anything new while CI is still running.

### If exit `4` → no run found for this SHA. Check: did the push include `atlas-mobile/**`? Was the tag `v*` pushed for android-release? Is the workflow disabled? Fix the trigger, then push again and watch.

## Stop / escalation rules (important)

- **Max 10 fix attempts** per task. After that, summarize every attempt + last failure and stop.
- **Same error 3 times in a row** → stop and report. Do not ping-pong random fixes.
- **Never**: delete or disable a workflow file, comment out tests, `git push --force`, or mark failing steps `continue-on-error` just to go green. Fix the real cause.
- **Never** claim "working" / "deployed" / "release ready" until the relevant workflow exits `0` (Pages for web, android-release for APK).
- During the loop, keep the user updated with: attempt #, failed step, fix applied, new SHA.

## Quick reference

```sh
# watch current HEAD
python3 tools/ci-watch.py
# watch a specific workflow only
python3 tools/ci-watch.py --workflow pages.yml
# machine-readable summary (for agent parsing)
python3 tools/ci-watch.py --json --log-lines 200
```

Loop in one line: **push → ci-watch → (fail → fix → push → ci-watch)* → SUCCESS (exit 0).**
