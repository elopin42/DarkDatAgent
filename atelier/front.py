"""Serve the DarkDatAgent front (soussol-v2/dist, built by `make front`) on the same origin as Django.

GET requests that match a built page or asset are answered from dist/. Everything else (POST of the forms,
/api/state.json, pages without a static file, dist/ missing) falls through to the Django views, so the site
still works without the front built. The CSRF token is injected into the static forms so they can POST."""
import mimetypes
import re

from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.middleware.csrf import get_token
from django.shortcuts import redirect

DIST = settings.BASE_DIR / "soussol-v2" / "dist"
FORM = re.compile(r'(<form\b[^>]*method="post"[^>]*>)', re.I)
# The local app: its pages in dist/ are snapshots (one hard-coded project, no key status, no pipeline state,
# no detected software). Django keeps them so the app still works; the showcase pages come from the front.
APP = ("/start/", "/welcome/", "/setup/", "/keys/", "/new/", "/projects/")


TAGS = re.compile(r'<(?:script type="module"[^>]*src="/assets/[^"]+"></script>|link rel="stylesheet"[^>]*href="/assets/[^"]+">)')


def assets():
    """The hashed script and stylesheet tags of the built app pages, for the Django templates of the local app."""
    page = DIST / "start" / "index.html"
    return "\n  ".join(TAGS.findall(page.read_text(encoding="utf-8"))) if page.is_file() else ""


def context(request):
    return {"front_assets": assets()}


def _file_for(path):
    rel = path.strip("/")
    for cand in (DIST / rel, DIST / rel / "index.html") if rel else (DIST / "index.html",):
        if cand.is_file() and DIST in cand.resolve().parents:
            return cand
    return None


class FrontMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "GET" and not request.path.startswith(("/api/", "/static/") + APP):
            file = _file_for(request.path)
            if file is not None:
                if file.suffix != ".html":
                    return FileResponse(open(file, "rb"), content_type=mimetypes.guess_type(file.name)[0] or "application/octet-stream")
                if request.path != "/" and not request.path.endswith("/") and (DIST / request.path.strip("/")).is_dir():
                    return redirect(request.path + "/")
                html = file.read_text(encoding="utf-8")
                if FORM.search(html):
                    token = f'<input type="hidden" name="csrfmiddlewaretoken" value="{get_token(request)}">'
                    html = FORM.sub(lambda m: m.group(1) + token, html)
                return HttpResponse(html)
        return self.get_response(request)
