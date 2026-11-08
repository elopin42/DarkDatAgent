"""Check, in a second, what the pipeline needs before it runs for twenty minutes.

Python packages (installed on the spot from requirements.txt when missing), programs on
the PATH and API keys. Prints what is still missing and how to fix it, exit code 1 if anything is. Called by run_project.py and 70_run_one.py before
they start, and by `make check`.

Usage: python scripts/preflight.py [--for pipeline|run]
"""
import importlib.util
import os
import shutil
import subprocess
import sys

# module to import -> package to install (both in scripts/requirements.txt)
MODULES = {
    "pipeline": {"requests": "requests", "yt_dlp": "yt-dlp", "hai_agents": "hai-agents"},
    "run": {"requests": "requests", "hai_agents": "hai-agents", "hai_drivers": "hai-agents[browser]",
            "mysql.connector": "mysql-connector-python"},
}
PROGRAMS = {"pipeline": ["ffmpeg"], "run": []}
KEYS = {"pipeline": ["HAI_API_KEY", "GLADIA_API_KEY"], "run": ["HAI_API_KEY"]}


def has_module(name):
    try:
        return importlib.util.find_spec(name) is not None
    except ModuleNotFoundError:  # parent package missing ("mysql" for "mysql.connector")
        return False


def problems(kind="pipeline"):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from common import load_env
    load_env()  # keys entered on the site live in .env
    out = []
    missing = [pkg for mod, pkg in MODULES[kind].items() if not has_module(mod)]
    if missing:
        # Repair rather than report: install the pinned requirements into this interpreter.
        req = os.path.join(os.path.dirname(os.path.abspath(__file__)), "requirements.txt")
        print(f"preflight: installing {', '.join(missing)} (scripts/requirements.txt)", flush=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "-r", req], check=False)
        importlib.invalidate_caches()
        missing = [pkg for mod, pkg in MODULES[kind].items() if not has_module(mod)]
    if missing:
        out.append(f"Python packages missing in {sys.prefix}: {', '.join(missing)}. Run: make install")
    for prog in PROGRAMS[kind]:
        if not shutil.which(prog):
            out.append(f"program not found: {prog}. Install it with your package manager")
    for key in KEYS[kind]:
        if not os.environ.get(key):
            out.append(f"{key} is not set. Connect the account on the site's /setup/ page")
    return out


def main():
    kind = sys.argv[sys.argv.index("--for") + 1] if "--for" in sys.argv else "pipeline"
    found = problems(kind)
    for p in found:
        print(f"preflight: {p}", flush=True)
    if found:
        sys.exit(1)
    print(f"preflight ({kind}): ok")


if __name__ == "__main__":
    main()
