"""JSON for the DarkDatAgent front (soussol-3d): the same data the pages show, read live.

One read-only endpoint, /api/state.json. The front shows the replay of 7 November when it does not answer."""
from datetime import datetime

from django.http import JsonResponse

from . import data, projects


def state(request):
    runs = []
    for r in data.runs():
        runs.append({k: r.get(k) for k in ("id", "arm", "row", "verdict", "steps", "duration", "cost", "before",
                                           "after", "note", "share_url", "skill_revision")})
        if runs[-1]["arm"] and not isinstance(runs[-1]["arm"], str):
            runs[-1]["arm"] = getattr(runs[-1]["arm"], "get", lambda k, d=None: d)("key", "")
    status = {}
    plist = projects.all_projects()
    if plist:
        st, _ = projects.status(plist[-1]["id"])
        for s in (st or {}).get("steps", []):
            status[s["key"]] = s["state"]
    return JsonResponse({"runs": runs, "status": status, "updated_at": datetime.now().strftime("%H:%M:%S")})
