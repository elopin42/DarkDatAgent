"""[7] One H session: the agent does the task in the software, in a local Chrome.

The task is either an invoice row of data/factures.csv (the demo Dolibarr task), a new invoice
typed on the project page (--invoice, same sentence and same database check, kept in the run as
`invoice`), or a free sentence (--task) for any software. The agent is the one registered by 60_register.py for
this video (arm `skill`) or the one without skill (arm `none`). The session is capped at
--max-steps and --max-time; the answer must follow the Result schema.

Writes work/runs/<run_id>.json as soon as the session starts (status, live view), then
again at the end with the answer, metrics and share link, then the SQL verdict (80_verify).

Usage: python scripts/70_run_one.py <video_id> (--row 1 | --invoice '{"fournisseur": …}' | --task "…") [--arm skill|none]
       [--variant old-voice] [--revision 1|latest] [--max-steps 40] [--max-time 600] [--run-id …]

The run keeps `piege` (the house rule the CSV row tests) and `skill_revision` (from the
session's dependency_revisions; null for arm `none`).
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import List, Optional

from common import ROOT, RUNS, invoice, is_demo_dolibarr, load_env, need_env, project, read_json, skill_revision_of, work_dir

sys.path.insert(0, str(ROOT / "scripts"))
verify_mod = __import__("80_verify")

DEMO_LOGIN = ("agent", "agent-demo-2026")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def invoice_task(row, url):
    """The task sentence. A `tva` trap row does not name the rate: the agent only knows it from
    the internal video's house rule (modif.md §1.2)."""
    tva = "" if row.get("piege") == "tva" else f", TVA {row['tva']:g} %"
    return (f"Crée une facture fournisseur dans Dolibarr : fournisseur « {row['fournisseur']} », "
            f"référence fournisseur « {row['ref_fournisseur']} », date {row['date']}, "
            f"une ligne libre « {row['libelle']} » à {row['montant_ht']:.2f} € HT{tva}. "
            f"Valide la facture. Commence par {url}.")


def custom_invoice(text):
    """An invoice typed on the project page, in the shape of a data/factures.csv row: same task sentence,
    same database check, no house rule."""
    data = json.loads(text)
    row = {k: str(data.get(k) or "").strip() for k in ("fournisseur", "ref_fournisseur", "date", "libelle")}
    if not all(row.values()):
        raise SystemExit("--invoice needs fournisseur, ref_fournisseur, date, libelle, montant_ht and tva")
    return {**row, "montant_ht": float(data["montant_ht"]), "tva": float(data["tva"]), "notes": "", "piege": ""}


def with_revision(agent_ref, revision):
    """`name:N` with the revision asked for: an int pins it, "latest" keeps the one in agent.<variant>.json
    (60_register.py rewrites it at every revision, so it is the newest), None leaves it as is."""
    if revision in (None, "latest"):
        return agent_ref
    return f"{agent_ref.rsplit(':', 1)[0]}:{int(revision)}"


def make_result_model():
    from pydantic import BaseModel, Field

    class Result(BaseModel):
        created: bool = Field(description="the record was created")
        invoice_ref: str = Field(default="", description="reference shown by the software for the created record, empty if none")
        supplier_name: str = Field(default="", description="third party actually used, empty if none")
        total_ttc: float = Field(default=0, description="total after tax shown, 0 if none")
        validated: bool = Field(default=False, description="the record was validated (final status)")
        drift: Optional[List[str]] = Field(default=None, description="steps of the skill that no longer matched the screen, one per difference, empty list if none")
        notes: Optional[str] = Field(default=None, description="anything the user must know")

    return Result


def make_free_result_model():
    """The answer of a free task: no invoice fields, so a task about anything else is not steered towards invoices."""
    from pydantic import BaseModel, Field

    class FreeResult(BaseModel):
        created: bool = Field(description="the task created or changed a record in the software")
        reference: str = Field(default="", description="reference the software shows for that record, empty if none")
        drift: Optional[List[str]] = Field(default=None, description="steps of the skill that no longer matched the screen, one per difference, empty list if none")
        notes: Optional[str] = Field(default=None, description="what was done or found, in one or two sentences; the answer itself when the task is a question")

    return FreeResult


START_WAITS = [20, 40, 60, 90]  # seconds between attempts to open a session, about 3.5 min in all
CHROME_DEBUG = "http://127.0.0.1:9222/json/version"  # the Chrome the SDK drives (hai_agents_local.browser)


def transient(exc):
    """A start failure worth retrying: rate limit, network, server side. Not auth or a bad request."""
    text = f"{type(exc).__name__} {exc}".lower()
    if any(w in text for w in ("401", "403", "unauthorized", "forbidden", "not found", "invalid")):
        return False
    return any(w in text for w in ("rate", "429", "busy", "timeout", "timed out", "temporar", "connect", "50", "unavailable"))


DEAD_DRIVER = ("invalid session id", "browser has closed the connection", "not connected to devtools",
               "unable to receive message from renderer")


class ChromeWatchdog:
    """Watches the agent's browser during a session. Two ways it dies: the Chrome process goes
    (window closed: port 9222 stops answering), or Chrome stays but the tab's renderer crashes
    and Selenium's session is gone (every command then fails with "invalid session id"). Either
    way the session can only wait for its timeout: cancel it at once and let main() start again.

    It also watches H's step counter: a model call on H's side can hang with no error (seen on
    2026-11-07: first screenshot sent, no answer for 18 min, idle_timeout_s does not catch it).
    No first step within `first_step_s`, or no new step for `stall_s`: same treatment."""

    def __init__(self, handle, every=5, misses=2, dead_commands=2, first_step_s=90, stall_s=120, poll_s=15):
        import logging
        import threading
        self.handle, self.every, self.misses, self.dead_commands = handle, every, misses, dead_commands
        self.first_step_s, self.stall_s, self.poll_s = first_step_s, stall_s, poll_s
        self.lost, self.reason, self._dead = False, "", 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        watchdog = self

        class _DriverErrors(logging.Handler):  # hai_agents_local.bridge logs "command X raised: …"
            def emit(self, record):
                if any(s in record.getMessage().lower() for s in DEAD_DRIVER):
                    watchdog._dead += 1
                    if watchdog._dead >= watchdog.dead_commands:
                        watchdog._give_up("the browser tab stopped answering (Selenium session lost)")

        self._handler = _DriverErrors(level=logging.WARNING)
        self._logger = logging.getLogger("hai_agents_local")

    def _give_up(self, reason):
        if self.lost:
            return
        self.lost, self.reason = True, reason
        print(f"{reason}: cancelling the session", flush=True)
        try:
            self.handle.cancel()
        except Exception:
            pass

    def _alive(self):
        import urllib.request
        try:
            with urllib.request.urlopen(CHROME_DEBUG, timeout=2) as r:
                return r.status == 200
        except OSError:
            return False

    def _stalled(self, state):
        """True once H's step counter has not moved for too long. `state` = [steps, since, last_poll]."""
        now_t = time.time()
        if now_t - state[2] < self.poll_s:
            return False
        state[2] = now_t
        try:
            st = self.handle.status()
        except Exception:
            return False  # a failed poll says nothing about the agent
        if st.status not in ("running", "pending", "starting", None):
            return False
        steps = st.steps or 0
        if steps != state[0]:
            state[0], state[1] = steps, now_t
            return False
        limit = self.first_step_s if steps == 0 else self.stall_s
        if now_t - state[1] >= limit:
            what = "took no first step" if steps == 0 else f"stuck at step {steps}"
            self._give_up(f"H's agent {what} in {round(now_t - state[1])} s (model call hanging on H's side)")
            return True
        return False

    def _loop(self):
        seen, missed = False, 0
        progress = [0, time.time(), time.time()]
        while not self._stop.wait(self.every) and not self.lost:
            if self._stalled(progress):
                return
            if self._alive():
                seen, missed = True, 0
                continue
            missed += 1
            if seen and missed >= self.misses:
                self._give_up("Chrome closed")
                return

    def start(self):
        self._logger.addHandler(self._handler)
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._logger.removeHandler(self._handler)


def restart_agent_chrome():
    """Close the agent's own Chrome (profile ~/.hai/chrome-profile, never the user's browser) so the
    next session gets a fresh one: a crashed tab stays crashed in the old one. The SDK relaunches it."""
    import signal
    import subprocess
    profile = os.path.expanduser("~/.hai/chrome-profile")
    out = subprocess.run(["pgrep", "-f", f"--user-data-dir={profile}"], capture_output=True, text=True).stdout
    for pid in out.split():
        try:
            os.kill(int(pid), signal.SIGTERM)
        except (OSError, ValueError):
            pass
    for _ in range(20):  # wait until the debug port is free, or the SDK would attach to the dying one
        if not ChromeWatchdog._alive(None):
            break
        time.sleep(0.5)


def save(path, run):
    path.write_text(json.dumps(run, ensure_ascii=False, indent=2, default=str) + "\n")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video_id")
    p.add_argument("--row", type=int, help="row of data/factures.csv (the demo Dolibarr task)")
    p.add_argument("--task", help="a free task sentence for any software")
    p.add_argument("--invoice", help="a new invoice as JSON (fournisseur, ref_fournisseur, date, libelle, montant_ht, tva), "
                   "run and checked in the database like a row")
    p.add_argument("--arm", choices=["skill", "none"], default="skill")
    p.add_argument("--variant")
    p.add_argument("--revision", help="agent revision to use: an integer pins it (bench arm old-voice: 1), "
                   "`latest` follows the newest registered one (arm old-voice-repaired)")
    p.add_argument("--max-steps", type=int, default=40)
    p.add_argument("--max-time", type=int, default=600)
    p.add_argument("--run-id")
    p.add_argument("--chrome-retry", action="store_true", help=argparse.SUPPRESS)  # set when the run restarts itself
    a = p.parse_args()
    if not a.row and not a.task and not a.invoice:
        sys.exit("give --row N, --invoice '{…}' or --task \"…\"")

    load_env()
    from preflight import problems
    missing = problems("run")
    if missing:
        sys.exit("setup incomplete: " + " · ".join(missing))
    need_env("HAI_API_KEY")
    from hai_agents import Client

    work = work_dir(a.video_id)
    proj = project(a.video_id)
    url = proj["software"]["url"]
    reg_path = work / (f"agent.{a.variant}.json" if a.variant else "agent.json")
    if not reg_path.exists():
        sys.exit(f"no {reg_path.name} in work/{a.video_id}: run 60_register.py first")
    reg = read_json(reg_path)
    agent_ref = with_revision(reg["agent_ref"], a.revision) if a.arm == "skill" else reg["none_agent_ref"]

    row = invoice(a.row) if a.row else custom_invoice(a.invoice) if a.invoice else None
    task = a.task or invoice_task(row, url)
    if is_demo_dolibarr(url):
        task += f" Si une page de connexion apparaît, identifiant « {DEMO_LOGIN[0]} », mot de passe « {DEMO_LOGIN[1]} »."

    RUNS.mkdir(parents=True, exist_ok=True)
    run_id = a.run_id or f"{a.video_id}-{a.arm}-{a.row or 'task'}-{datetime.now().strftime('%m%d-%H%M%S')}"
    path = RUNS / f"{run_id}.json"
    # The demo task is "create this invoice": an earlier run that already created it would make
    # every new run a fail. On the demo Dolibarr only, remove it first so a row can be replayed.
    # Never for an invoice typed by the user: one already there is theirs, the verdict says `noop`.
    cleared = []
    if a.row and is_demo_dolibarr(url) and verify_mod.db_available():
        cleared = verify_mod.clear(row["ref_fournisseur"])
        if cleared:
            print(f"removed the invoice(s) {', '.join(cleared)} left by an earlier run of this row", flush=True)
    run = {
        "id": run_id, "project": a.video_id, "arm": a.arm, "variant": reg["variant"], "row": a.row, "task": task,
        "agent": agent_ref, "software": proj["software"], "status": "starting", "started_at": now(),
        "piege": (row or {}).get("piege") or "", "skill_revision": None, **({"invoice": row} if a.invoice else {}),
        "db_rows_before": verify_mod.count() if (row and verify_mod.db_available()) else None,
        "cleared_before": cleared, "chrome_retry": a.chrome_retry,
    }
    save(path, run)
    (RUNS / f"{run_id}.pid").write_text(str(os.getpid()))  # the site checks it to tell a live run from a dead one
    print(f"run {run_id}: agent {agent_ref}", flush=True)

    client = Client()
    Result = make_result_model() if row else make_free_result_model()
    t0 = time.time()
    # H rate-limits opening sessions (two runs in a row is enough): wait and try again instead of failing.
    for attempt, wait in enumerate(START_WAITS + [None], 1):
        try:
            handle = client.start_session(agent=agent_ref, messages=task, answer_schema=Result,
                                          max_steps=a.max_steps, max_time_s=a.max_time, idle_timeout_s=30, timezone="Europe/Paris")
            break
        except Exception as e:
            if wait is None or not transient(e):
                run.update(status="failed", error=f"could not start the session: {e}", error_code="environment_error", finished_at=now())
                save(path, run)
                raise SystemExit(run["error"])
            print(f"H is busy ({str(e)[:120]}); trying again in {wait} s (attempt {attempt + 1})", flush=True)
            run.update(status="starting", note=f"H is busy, trying again in {wait} s")
            save(path, run)
            time.sleep(wait)
    run.pop("note", None)
    run.update(session_id=handle.id, status="running")
    try:
        s = handle.get()
        run["agent_view_url"] = s.agent_view_url
    except Exception:
        pass
    save(path, run)
    print(f"session {handle.id} {run.get('agent_view_url') or ''}", flush=True)

    # Follow the session so the run file shows progress (steps) while it runs.
    result, raw_answer = None, None
    watchdog = ChromeWatchdog(handle)
    watchdog.start()
    try:
        result = handle.wait_for_completion(timeout_seconds=a.max_time + 120)
    except Exception as e:
        run["error"] = f"{type(e).__name__}: {e}"
        raw_answer = getattr(e, "raw", None)  # AnswerValidationError keeps the answer the agent gave
        if raw_answer is None and not watchdog.lost:
            try:  # giving up locally must not leave the session running on H (it holds a quota slot)
                handle.cancel()
            except Exception:
                pass
    finally:
        watchdog.stop()
        try:
            st = handle.status()
            run.update(status=st.status, steps=st.steps, error=st.error or run.get("error"), error_code=st.error_code, outcome=st.outcome)
        except Exception:
            run.setdefault("status", "failed")
        if result is not None:
            fc = result.final_changes
            ans = result.answer
            run["answer"] = ans.model_dump() if hasattr(ans, "model_dump") else ans
            run["outcome"] = result.outcome or run.get("outcome")
            run["error_code"] = result.error_code or run.get("error_code")
            if fc is not None and fc.metrics is not None:
                run["steps"] = fc.metrics.steps if fc.metrics.steps is not None else run.get("steps")
                run["total_cost_usd"] = fc.metrics.total_cost
            for ev in result.events or []:  # the last metrics update carries the cost
                m = getattr(getattr(ev, "data", None), "metrics", None)
                if m is not None and m.total_cost is not None:
                    run["total_cost_usd"], run["steps"] = m.total_cost, m.steps or run.get("steps")
        if run.get("answer") is None and raw_answer is not None:
            run["answer"] = raw_answer
        try:
            s = client.sessions.get_session(handle.id)
            run["agent_revision"] = s.agent_revision
            if run.get("answer") is None and s.latest_answer is not None:
                run["answer"] = s.latest_answer
            if s.status.status in ("completed", "failed", "timed_out", "interrupted"):
                run["status"] = s.status.status
            extra = getattr(s, "model_extra", None) or {}
            run["dependency_revisions"] = extra.get("dependency_revisions")
            req = s.request.agent
            skills = getattr(req, "skills", None) if not isinstance(req, str) else None
            run["skill_loaded"] = bool(skills) if skills is not None else (a.arm == "skill")
        except Exception:
            run["skill_loaded"] = a.arm == "skill"
        if isinstance(run.get("answer"), dict) and run["answer"].get("drift") is None:
            run["answer"]["drift"] = []
        if run.get("answer") is not None and run.get("status") in ("idle", "completed"):
            run["status"] = "completed"  # one-shot task: an answer ends it
            run.pop("error", None)
        try:
            share = client.sessions.share_session(handle.id).share_url
            run["share_url"] = share if share.startswith("http") else "https://agp.eu.hcompany.ai" + share
        except Exception:
            pass
        run.update(finished_at=now(), duration_s=round(time.time() - t0))
        answer = run.get("answer") or {}
        run["drift"] = answer.get("drift") or [] if isinstance(answer, dict) else []
        run["skill_revision"] = skill_revision_of(run)
        save(path, run)
        try:
            client.close()
        except Exception:
            pass

    if watchdog.lost and not a.chrome_retry and not (isinstance(run.get("answer"), dict) and run["answer"].get("created")):
        # Chrome went away mid-run, or H's model hung: the session cannot recover. Start it again
        # once, same run id; the SDK opens a fresh Chrome for the new session.
        print(f"{watchdog.reason}: starting the run again", flush=True)
        run.update(status="starting", note=f"{watchdog.reason}: starting the run again")
        save(path, run)
        restart_agent_chrome()
        os.execv(sys.executable, [sys.executable, *sys.argv, "--chrome-retry", "--run-id", run_id])

    if watchdog.lost:
        run["error"] = watchdog.reason + (" (again after a restart)" if a.chrome_retry else "")
    verify_mod.verify(run)
    save(path, run)
    print(f"{run['status']} in {run['duration_s']} s, {run.get('steps')} steps, verdict {run['verdict']}"
          + (f" ({run['note']})" if run.get("note") else ""))
    print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
