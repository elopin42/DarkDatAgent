"""Find the web software running on this computer, for the "pick the software" step.

Linux: every TCP port listening on localhost or on all interfaces (/proc/net/tcp*).
Elsewhere: a list of usual development ports. Each port is asked for its home page;
the ones that answer HTTP with a page title (or on a usual development port) are offered,
named by their <title>.
"""
import html
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit

COMMON_PORTS = [80, 443, 3000, 3001, 4200, 5000, 5173, 8000, 8069, 8080, 8081, 8888, 9000]
# Not software an agent should use: Chrome debugging, databases, caches.
SKIP_PORTS = {9222, 3306, 5432, 6379, 11211, 27017}
TITLE = re.compile(rb"<title[^>]*>(.*?)</title>", re.I | re.S)
LISTEN = "0A"


def _listening_ports():
    ports = set()
    for name in ("tcp", "tcp6"):
        path = Path("/proc/net") / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines()[1:]:
            cols = line.split()
            if len(cols) < 4 or cols[3] != LISTEN:
                continue
            addr, port = cols[1].rsplit(":", 1)
            # 127.0.0.1, 0.0.0.0, ::1 and :: (hex, little-endian per 32-bit word)
            if addr in ("0100007F", "00000000", "00000000000000000000000001000000", "00000000000000000000000000000000"):
                ports.add(int(port, 16))
    return sorted(ports) if ports else COMMON_PORTS


def probe(url, timeout=1.5):
    """Return the page title if something answers HTTP at url, '' if it answers without a
    title, None if nothing answers."""
    req = urllib.request.Request(url, headers={"User-Agent": "yesterdays-tutorial/1"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(65536)
    except urllib.error.HTTPError as e:
        body = e.read(65536) if e.code < 500 else b""
    except (OSError, ValueError):
        return None
    m = TITLE.search(body)
    return re.sub(r"\s+", " ", html.unescape(m.group(1).decode("utf-8", "replace"))).strip()[:80] if m else ""


def detect(own_port=None):
    """Web software listening on this computer: [{"url", "name", "port"}], sorted by port."""
    ports = [p for p in _listening_ports() if p not in SKIP_PORTS and p != own_port]

    def one(port):
        url = f"http://localhost:{port}" if port != 80 else "http://localhost"
        title = probe(url)
        if title is None or (not title and port not in COMMON_PORTS):
            return None  # untitled services on odd ports are app internals (Discord, IDEs), not software
        return {"url": url, "port": port, "name": title or f"localhost:{port}"}

    with ThreadPoolExecutor(max_workers=16) as pool:
        found = [x for x in pool.map(one, ports[:200]) if x]
    return found


def normalize(text):
    """Turn what the user typed into a URL: 'localhost:3000', ':3000', '3000' -> http://localhost:3000."""
    text = text.strip().rstrip("/")
    if re.fullmatch(r":?\d{2,5}", text):
        return f"http://localhost:{text.lstrip(':')}"
    if text and not re.match(r"^[a-z]+://", text):
        text = "http://" + text
    parts = urlsplit(text)
    if parts.scheme not in ("http", "https") or not parts.netloc or " " in text:
        return None
    return text
