"""API keys of the pipeline, kept in .env at the project root and edited from /keys/.

This is the only thing the site writes. Values are never sent back to the browser:
the page shows whether a key is set and its last 4 characters.
"""
import json
import os
import re
import urllib.error
import urllib.request

from django.conf import settings

ENV_PATH = settings.BASE_DIR / ".env"

KEYS = [
    {
        "name": "GLADIA_API_KEY",
        "label": "Gladia",
        "use": "Transcribes the tutorial voice (step 2).",
        "where": "app.gladia.io, API keys",
        "url": "https://app.gladia.io/",
        "optional": False,
    },
    {
        "name": "HAI_API_KEY",
        "label": "H Company",
        "use": "Understands the tutorial and writes the skill (Models API, step 5), then runs the agent (Agents API, steps 6 and 7).",
        "where": "platform.hcompany.ai, Settings, API keys",
        "url": "https://platform.hcompany.ai/settings/api-keys",
        "optional": False,
    },
]
NAMES = {k["name"] for k in KEYS}
REQUIRED = {k["name"] for k in KEYS if not k["optional"]}
VALID = re.compile(r"^[\x21-\x7e]{8,512}$")  # printable, no spaces, no newline


def read():
    """Every KEY=value in .env, as a dict."""
    out = {}
    if not ENV_PATH.exists():
        return out
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.removeprefix("export ").split("=", 1)
        out[key.strip()] = value.strip().strip("\"'")
    return out


def _write(values):
    """Rewrite .env, keeping comments and unknown lines, readable by the owner only."""
    lines = ENV_PATH.read_text().splitlines() if ENV_PATH.exists() else []
    done, out = set(), []
    for line in lines:
        key = line.strip().removeprefix("export ").split("=", 1)[0].strip()
        if key in values:
            if values[key] is not None and key not in done:
                out.append(f"{key}={values[key]}")
            done.add(key)
        else:
            out.append(line)
    out += [f"{k}={v}" for k, v in values.items() if v is not None and k not in done]
    ENV_PATH.write_text("\n".join(out) + "\n" if out else "")
    os.chmod(ENV_PATH, 0o600)


def save(name, value):
    if name not in NAMES:
        raise ValueError(f"unknown key {name}")
    if not VALID.match(value):
        raise ValueError("8 to 512 printable characters, no spaces")
    _write({name: value})


def remove(name):
    if name in NAMES:
        _write({name: None})


def status():
    env = read()
    return [{**k, "set": bool(env.get(k["name"])), "tail": env.get(k["name"], "")[-4:]} for k in KEYS]


def _get(url, headers):
    req = urllib.request.Request(url, headers={**headers, "User-Agent": "yesterdays-tutorial/1"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read(2000)
    except urllib.error.HTTPError as e:
        return e.code, b""
    except (urllib.error.URLError, TimeoutError) as e:
        return None, str(e).encode()


def check(name):
    """Ask the provider whether the key works. Returns (ok: bool | None, message)."""
    value = read().get(name)
    if not value:
        return None, "not set"
    if name == "GLADIA_API_KEY":
        code, _ = _get("https://api.gladia.io/v2/pre-recorded?limit=1", {"x-gladia-key": value})
    elif name == "HAI_API_KEY":
        code, body = _get("https://api.hcompany.ai/v1/models", {"Authorization": f"Bearer {value}"})
        if code == 200:
            try:
                ids = [m["id"] for m in json.loads(body).get("data", [])]
                return True, "accepted, models: " + (", ".join(ids) or "none listed")
            except (ValueError, KeyError, TypeError):
                return True, "accepted"
    else:
        return None, "no automatic check for this one"
    if code is None:
        return None, "provider unreachable, check the network"
    if code in (401, 403):
        return False, f"rejected (HTTP {code})"
    if 200 <= code < 300:
        return True, "accepted"
    return None, f"unexpected answer (HTTP {code})"
