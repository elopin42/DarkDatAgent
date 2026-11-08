"""Data layer for the site.

The top of this file is SAMPLE DATA, shown until the bench has a real run. The public
functions at the bottom read the real pipeline outputs as soon as report/bench.csv has a
verified run, without touching views or templates:

    storyboard()  <- work/<video_id>/storyboard.json
    skill(key)    <- work/<video_id>/SKILL.<variant>.md
    runs()        <- report/bench.csv + work/runs/<run_id>.json
    drift()       <- report/drift.md

Numbers match the provisional ones in docs/LANDING.md.
"""
import hashlib
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")

VIDEO = {
    "id": "JZMgB1UItkk",
    "title": "Tutorial 17, Supplier invoices",
    "channel": "Dolibarr ERP & CRM",
    "published": "February 5, 2021",
    "published_short": "Feb 5, 2021",
    "duration": 420,
    "language": "French",
    "license": "Creative Commons Attribution",
    "frames": 38,
    "url": "https://www.youtube.com/watch?v=JZMgB1UItkk",
}

RECENT = {
    "id": "saturday-1107",
    "title": "Video shot on Saturday, Dolibarr 22",
    "published": "November 7, 2026",
    "published_short": "Nov 7, 2026",
    "duration": 168,
    "frames": 21,
}

# [4] storyboard.json for the 2021 video. The narration is French: `fr` is the
# Gladia transcript, `en` is shown on the site.
STORYBOARD = [
    {"t": 8, "frame": "0001.jpg", "fr": "Bonjour, dans ce tutoriel on va voir comment saisir une facture fournisseur dans Dolibarr.", "en": "Hello, in this tutorial we’ll see how to enter a supplier invoice in Dolibarr."},
    {"t": 24, "frame": "0003.jpg", "fr": "Il faut d’abord que le tiers existe, et qu’il soit bien coché comme fournisseur.", "en": "First, the third party must exist and be ticked as a supplier."},
    {"t": 41, "frame": "0007.jpg", "fr": "On clique sur Fournisseurs, puis Factures fournisseurs, puis Nouvelle facture.", "en": "Click Fournisseurs, then Factures fournisseurs, then Nouvelle facture."},
    {"t": 55, "frame": "0009.jpg", "fr": "On choisit le tiers dans la liste déroulante.", "en": "Pick the third party from the drop-down list."},
    {"t": 72, "frame": "0011.jpg", "fr": "La référence fournisseur, c’est le numéro qui est écrit sur la facture papier.", "en": "The supplier reference is the number printed on the paper invoice."},
    {"t": 90, "frame": "0013.jpg", "fr": "La date de facturation et les conditions de règlement se remplissent toutes seules.", "en": "The invoice date and payment terms fill themselves in."},
    {"t": 112, "frame": "0016.jpg", "fr": "On clique sur Créer brouillon.", "en": "Click Créer brouillon (create draft)."},
    {"t": 140, "frame": "0019.jpg", "fr": "Maintenant on ajoute une ligne. Ici je prends une ligne libre, sans produit.", "en": "Now add a line. Here I use a free-text line, with no product."},
    {"t": 168, "frame": "0022.jpg", "fr": "On met le libellé, le prix unitaire hors taxe et le taux de TVA.", "en": "Enter the description, the unit price before tax and the VAT rate."},
    {"t": 195, "frame": "0025.jpg", "fr": "On clique sur Ajouter. Les totaux HT et TTC se mettent à jour.", "en": "Click Ajouter. The totals before and after tax update."},
    {"t": 220, "frame": "0028.jpg", "fr": "Tant qu’elle est en brouillon, on peut encore tout modifier.", "en": "While it is a draft, everything can still be changed."},
    {"t": 245, "frame": "0031.jpg", "fr": "Quand tout est bon, on clique sur Valider, et on confirme.", "en": "When everything is right, click Valider and confirm."},
    {"t": 270, "frame": "0034.jpg", "fr": "La facture prend sa référence définitive et passe au statut Validée.", "en": "The invoice gets its final reference and moves to the Validée status."},
]

_MAPPING = [
    ("fournisseur", "Tiers (third party)"),
    ("ref_fournisseur", "Réf. fournisseur"),
    ("date", "Date de facturation"),
    ("libelle", "Free-text line description"),
    ("montant_ht", "P.U. HT (unit price before tax)"),
    ("tva", "TVA (VAT)"),
]

# [5] induced skills. Dolibarr runs in French, so on-screen labels stay in French.
SKILLS = {
    "old-voice": {
        "label": "2021 tutorial, voice and images",
        "name": "dolibarr-facture-fournisseur-old-voice",
        "revision": 1,
        "source": VIDEO,
        "model": "holo4-27b",
        "inputs": "13 sentences, 38 images, 8 requests",
        "description": "Use when the task is to create and validate a supplier invoice in Dolibarr from given invoice data.",
        "preconditions": ["Dolibarr is open and the session is logged in", "The supplier exists as a third party, Supplier box ticked"],
        "steps": [
            {"t": 41, "text": "Open the “Fournisseurs” menu, then “Factures fournisseurs”"},
            {"t": 41, "text": "Click “Nouvelle facture”"},
            {"t": 55, "text": "Pick the third party from the drop-down list"},
            {"t": 72, "text": "Enter the supplier reference, the number printed on the invoice"},
            {"t": 90, "text": "Check the invoice date, leave payment terms as default"},
            {"t": 112, "text": "Click “Créer brouillon”"},
            {"t": 140, "text": "Add a free-text line: description, unit price before tax, VAT rate"},
            {"t": 195, "text": "Click “Ajouter” and check the totals"},
            {"t": 245, "text": "Click “Valider”, then confirm"},
        ],
        "mapping": _MAPPING,
        "exceptions": [],
        "check": "The invoice shows a final reference and the “Validée” status",
    },
    "new-voice": {
        "label": "Saturday video, voice and images",
        "name": "dolibarr-facture-fournisseur-new-voice",
        "revision": 1,
        "source": RECENT,
        "model": "holo4-27b",
        "inputs": "11 sentences, 21 images, 5 requests",
        "description": "Use when the task is to create and validate a supplier invoice in Dolibarr from given invoice data.",
        "preconditions": ["Dolibarr 22 is open and the session is logged in", "The supplier exists as a third party, Supplier box ticked"],
        "steps": [
            {"t": 12, "text": "Open the “Achats” menu, then “Factures fournisseurs”"},
            {"t": 12, "text": "Click “Nouvelle facture”"},
            {"t": 31, "text": "Pick the third party; if two share the same name, take the one with a SIREN"},
            {"t": 48, "text": "Enter the supplier reference"},
            {"t": 57, "text": "Check the invoice date"},
            {"t": 66, "text": "Click “Créer”"},
            {"t": 80, "text": "Add a free-text line: description, unit price before tax, VAT rate"},
            {"t": 104, "text": "Click “Ajouter” and check the totals"},
            {"t": 131, "text": "Click “Valider”, then “Oui” in the confirmation dialog"},
        ],
        "mapping": _MAPPING,
        "exceptions": [
            {"t": 31, "text": "Two third parties with the same name: take the one with a SIREN"},
            {"t": 86, "text": "Food and catering: VAT is 5.5%, not 20%"},
            {"t": 80, "text": "No product in the catalog: use a free-text line"},
        ],
        "check": "The invoice shows an SI… reference, the “Validée” status and the expected total",
    },
    "old-images": {
        "label": "2021 tutorial, images only",
        "name": "dolibarr-facture-fournisseur-old-images",
        "revision": 1,
        "source": VIDEO,
        "model": "holo4-27b",
        "inputs": "38 images, no sentences, 8 requests",
        "not_run": True,
        "description": "Use when the task is to create a supplier invoice in Dolibarr.",
        "preconditions": ["Dolibarr is open"],
        "steps": [
            {"t": 41, "text": "Open the menu whose label contains “Fournisseurs”"},
            {"t": 41, "text": "Open “Nouvelle facture”"},
            {"t": 55, "text": "Fill in the Tiers field"},
            {"t": 72, "text": "Fill in the Réf. fournisseur field"},
            {"t": 112, "text": "Click the button at the bottom of the form"},
            {"t": 168, "text": "Fill in a line: description, price, VAT, then “Ajouter”"},
            {"t": 245, "text": "Click “Valider”"},
        ],
        "mapping": _MAPPING[:2] + [("montant_ht", "Price")],
        "exceptions": [],
        "check": "The displayed status changes",
    },
}

# data/factures.csv, rows 1 to 8 (the bench rows). `label` is the CSV value the agent types, so it stays as in the CSV.
INVOICES = [
    {"id": 1, "supplier": "Papeterie Nord", "ref": "PN-2026-0412", "date": "2026-10-03", "label": "Ramettes A4 x20", "ht": 184.00, "vat": 20},
    {"id": 2, "supplier": "Hébergeur Alpha", "ref": "HA-77812", "date": "2026-10-05", "label": "Serveur octobre", "ht": 59.00, "vat": 20},
    {"id": 3, "supplier": "Transports Lemaire", "ref": "TL-3391", "date": "2026-10-07", "label": "Livraison palette", "ht": 240.00, "vat": 20, "trap": "two “Transports Lemaire” third parties, only one with a SIREN"},
    {"id": 4, "supplier": "Café du Coin", "ref": "CDC-118", "date": "2026-10-09", "label": "Café réunions, octobre", "ht": 86.40, "vat": 5.5, "trap": "VAT at 5.5%"},
    {"id": 5, "supplier": "Fournitures Sud", "ref": "FS-20931", "date": "2026-10-12", "label": "Cartouches d’encre", "ht": 132.50, "vat": 20},
    {"id": 6, "supplier": "Papeterie Nord", "ref": "PN-2026-0457", "date": "2026-10-15", "label": "Classeurs, 40", "ht": 96.00, "vat": 20},
    {"id": 7, "supplier": "Hébergeur Alpha", "ref": "HA-77950", "date": "2026-10-18", "label": "Nom de domaine", "ht": 14.99, "vat": 20},
    {"id": 8, "supplier": "Café du Coin", "ref": "CDC-131", "date": "2026-10-21", "label": "Plateaux-repas", "ht": 212.00, "vat": 5.5, "trap": "VAT at 5.5%"},
]

# report/drift.md
DRIFT = [
    {"id": "d1", "step": 1, "t": 41, "was": "“Fournisseurs › Factures fournisseurs” menu", "now": "“Achats › Factures fournisseurs” menu", "seen": 7},
    {"id": "d2", "step": 6, "t": 112, "was": "“Créer brouillon” button", "now": "“Créer” button", "seen": 8},
    {"id": "d3", "step": 9, "t": 245, "was": "“Valider”, then confirm on the page", "now": "“Valider”, then a “Oui / Non” dialog", "seen": 5},
]

ARMS = [
    {"key": "none", "label": "No video", "agent": "dolibarr-clerk-none:1", "skill": None},
    {"key": "old-voice", "label": "2021 tutorial", "agent": "dolibarr-clerk-old-voice:1", "skill": "old-voice"},
    {"key": "new-voice", "label": "Internal video", "agent": "dolibarr-clerk-new-voice:1", "skill": "new-voice"},
    {"key": "old-images", "label": "2021 tutorial, no voice", "agent": "dolibarr-clerk-old-images:1", "skill": "old-images", "not_run": True},
]

# (row, verdict, steps, duration_s, cost_usd, error_code, answer_created, answer_validated, drift ids, note)
_RAW = {
    "none": [
        (1, "partial", 34, 412, 0.12, "", True, True, [], "Invoice left as a draft: the validation dialog was never confirmed"),
        (2, "success", 28, 351, 0.10, "", True, True, [], ""),
        (3, "duplicate", 37, 498, 0.13, "", True, True, [], "Two invoices created, one for each “Transports Lemaire” third party"),
        (4, "fail", 40, 560, 0.14, "no_answer", False, False, [], "Hit the 40-step cap in the line form"),
        (5, "partial", 31, 377, 0.11, "", True, True, [], "Amount entered after tax instead of before tax"),
        (6, "fail", 23, 600, 0.09, "timeout", False, False, [], "Timed out at step 23, could not find the supplier invoices menu"),
        (7, "success", 27, 330, 0.10, "", True, True, [], ""),
        (8, "fail", 29, 402, 0.10, "", True, True, [], "Invoice created for “Café de la Gare” instead of “Café du Coin”"),
    ],
    "old-voice": [
        (1, "success", 19, 248, 0.07, "", True, True, ["d1", "d2"], ""),
        (2, "success", 18, 231, 0.06, "", True, True, ["d1", "d2"], ""),
        (3, "fail", 22, 302, 0.08, "", True, True, ["d1", "d2"], "Picked the third party without a SIREN; the 2021 tutorial doesn’t say which one"),
        (4, "partial", 20, 266, 0.07, "", True, True, ["d1", "d2", "d3"], "VAT left at 20% instead of 5.5%"),
        (5, "success", 19, 240, 0.07, "", True, True, ["d2", "d3"], ""),
        (6, "success", 17, 219, 0.06, "", True, True, ["d1", "d2", "d3"], ""),
        (7, "success", 18, 228, 0.06, "", True, True, ["d1", "d2", "d3"], ""),
        (8, "success", 19, 251, 0.07, "", True, True, ["d1", "d2", "d3"], ""),
    ],
    "new-voice": [
        (1, "success", 16, 205, 0.06, "", True, True, [], ""),
        (2, "success", 16, 198, 0.05, "", True, True, [], ""),
        (3, "success", 18, 236, 0.06, "", True, True, [], "Picked the third party with a SIREN, rule stated at 0:31 in Saturday’s video"),
        (4, "success", 17, 221, 0.06, "", True, True, [], "VAT at 5.5% applied, rule stated at 1:26"),
        (5, "fail", 23, 600, 0.08, "timeout", False, False, [], "Timed out at step 23: Chrome lost the Dolibarr session"),
        (6, "success", 16, 201, 0.05, "", True, True, [], ""),
        (7, "success", 15, 190, 0.05, "", True, True, [], ""),
        (8, "success", 17, 214, 0.06, "", True, True, [], ""),
    ],
}

# What the database holds when it differs from the CSV
_SQL_OVERRIDES = {
    "none-01": {"status": 0},
    "none-05": {"total_ht": 220.80},
    "none-08": {"supplier": "Café de la Gare"},
    "old-voice-03": {"supplier": "Transports Lemaire (no SIREN)"},
    "old-voice-04": {"vat": 20},
}

# What the agent does during the live demo (old-voice arm, invoice 1)
DEMO_SCRIPT = [
    {"s": 1, "a": "screenshot of the Dolibarr home page"},
    {"s": 1, "a": "click “Achats”", "drift": "the skill said “Fournisseurs”"},
    {"s": 1, "a": "click “Factures fournisseurs”"},
    {"s": 2, "a": "click “Nouvelle facture”"},
    {"s": 3, "a": "type “{supplier}” in Tiers"},
    {"s": 3, "a": "select “{supplier}” in the list"},
    {"s": 4, "a": "type “{ref}” in Réf. fournisseur"},
    {"s": 5, "a": "read the date: {date}, matches"},
    {"s": 6, "a": "look for the “Créer brouillon” button: not found", "drift": "button renamed “Créer”", "old_only": True},
    {"s": 6, "a": "click “Créer”"},
    {"s": 7, "a": "click “Ligne libre”"},
    {"s": 7, "a": "type “{label}” in Description"},
    {"s": 7, "a": "type “{ht}” in P.U. HT"},
    {"s": 7, "a": "select “{vat}%” in TVA"},
    {"s": 8, "a": "click “Ajouter”"},
    {"s": 8, "a": "read the totals: €{ht} before tax, €{ttc} after tax"},
    {"s": 9, "a": "click “Valider”"},
    {"s": 9, "a": "click “Oui” in the confirmation dialog"},
    {"s": 9, "a": "JSON answer sent, session finished"},
]

PIPELINE = [
    {"n": 1, "what": "Download the video", "how": "yt-dlp, 720p max", "script": "10_download.sh", "out": "data/videos/JZMgB1UItkk.mp4", "url": "storyboard"},
    {"n": 2, "what": "Transcribe the voice", "how": "Gladia solaria-3, timestamped sentences, Dolibarr vocabulary", "script": "20_transcribe.py", "out": "transcript.json · 13 sentences", "url": "storyboard"},
    {"n": 3, "what": "Extract keyframes", "how": "ffmpeg, one image per screen change, plus one every 5 s at least", "script": "30_keyframes.py", "out": "frames/ · 38 images", "url": "storyboard"},
    {"n": 4, "what": "Align sentences and images", "how": "each sentence goes on the screen shown when it starts", "script": "40_storyboard.py", "out": "storyboard.json", "url": "storyboard"},
    {"n": 5, "what": "Induce the skill", "how": "H Models API, holo4-27b, 5 images per request, then one consolidation pass", "script": "50_induce.py", "out": "SKILL.<variant>.md · 3 variants", "url": "skills"},
    {"n": 6, "what": "Register skills and agents", "how": "H Agents API, pinned revisions name:1", "script": "60_register.py", "out": "4 agents in the catalog", "url": "skills"},
    {"n": 7, "what": "Run one session per invoice", "how": "H agent in local Chrome, 40 steps and 10 min max", "script": "70_run_one.py", "out": "work/runs/<run_id>.json", "url": "board"},
    {"n": 8, "what": "Check the database", "how": "reads llx_facture_fourn before and after, never trusts the agent", "script": "80_verify.py", "out": "one verdict per run", "url": "bench"},
    {"n": 9, "what": "Measure and report", "how": "3 arms × 8 invoices, table and drift report", "script": "90_bench.py · 95_report.py", "out": "bench.md · drift.md", "url": "bench"},
]

DECISIONS = [
    ("Saturday 11:30", "Is the 2021 storyboard readable?", "Yes: all 13 sentences land on a real step. We keep the 2021 video, no fallback to plan D1"),
    ("Saturday 12:00", "Is the skill written by Holo4 credible?", "Yes: 9 steps using the on-screen labels. Holo4 stays the skill author"),
    ("Saturday 16:00", "Does the 2021 tutorial help the agent?", "Yes on the pilot, 3 of 3 against 1 of 3 without it. The no-voice arm is postponed"),
]


def _hex(seed: str, n: int) -> str:
    return hashlib.sha1(seed.encode()).hexdigest()[:n]


def _build_runs():
    runs = []
    db_rows = 12
    seq = 13
    clock = datetime(2026, 11, 7, 17, 2, tzinfo=PARIS)
    drift_by_id = {d["id"]: d for d in DRIFT}
    for arm in ("none", "old-voice", "new-voice"):
        for row, verdict, steps, duration, cost, error, created, validated, drift_ids, note in _RAW[arm]:
            inv = INVOICES[row - 1]
            run_id = f"{arm}-{row:02d}"
            over = _SQL_OVERRIDES.get(run_id, {})
            in_db = 2 if verdict == "duplicate" else (1 if created and not error else 0)
            before, after = db_rows, db_rows + in_db
            db_rows = after - 2 if verdict == "duplicate" else after  # duplicates deleted between runs (BENCH.md)
            ref = f"SI2611-{seq:04d}" if in_db else ""
            seq += in_db
            sql = None
            if in_db:
                sql = {
                    "ref": ref,
                    "supplier": over.get("supplier", inv["supplier"]),
                    "total_ht": over.get("total_ht", inv["ht"]),
                    "vat": over.get("vat", inv["vat"]),
                    "status": over.get("status", 1),
                }
            runs.append({
                "id": run_id,
                "arm": arm,
                "row": row,
                "invoice": inv,
                "verdict": verdict,
                "steps": steps,
                "duration": duration,
                "cost": cost,
                "error": error,
                "status": "failed" if error else "completed",
                "started_at": clock,
                "session": f"{_hex(run_id, 8)}-{_hex(run_id + 'x', 4)}",
                "skill_loaded": arm != "none",
                "before": before,
                "after": after,
                "sql": sql,
                "answer": None if error else {
                    "created": created,
                    "invoice_ref": ref,
                    "supplier_name": inv["supplier"],
                    "total_ttc": round(inv["ht"] * (1 + over.get("vat", inv["vat"]) / 100), 2),
                    "validated": validated,
                    "drift": [drift_by_id[d]["now"] for d in drift_ids],
                    "notes": "",
                },
                "drift": drift_ids,
                "note": note,
                "piege": "",
                "skill_revision": None,
                "sql_rows": [],
            })
            clock += timedelta(seconds=duration + 25)
    return runs


RUNS = _build_runs()


# ---------- Real pipeline outputs ----------
#
# As soon as report/bench.csv has a verified run, every page reads the pipeline's files
# instead of the sample above: the runs of bench.csv (work/runs/<run_id>.json), the drift
# the agent reported in the 2021 tutorial arm, the storyboard and the skills written by
# step 5. Without bench.csv the site keeps showing the sample, and says so.

import csv
import json
import re
from collections import Counter

from django.conf import settings

ROOT = settings.BASE_DIR
WORK = settings.WORK_DIR
REPORT = settings.REPORT_DIR
BENCH_CSV = REPORT / "bench.csv"

# Old file names (before the variants were named after the bench arms) and the generic "skill" arm.
VARIANT_ALIASES = {"voice": "old-voice", "images": "old-images"}
ARM_ORDER = ["none", "old-voice", "new-voice", "old-voice-repaired", "old-images"]
ARM_LABELS = {"none": "No video", "old-voice": "2021 tutorial", "new-voice": "Internal video",
              "old-voice-repaired": "2021 tutorial, repaired", "old-images": "2021 tutorial, no voice",
              "skill": "2021 tutorial (before the bench)"}


def _read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def _bench_rows():
    if not BENCH_CSV.exists():
        return []
    with open(BENCH_CSV, newline="", encoding="utf-8") as f:
        return [r for r in csv.DictReader(f) if r.get("verdict")]


def is_sample():
    """True while no real bench run exists: the pages show the sample data."""
    return not _bench_rows()


def _projects():
    out = []
    for path in sorted(WORK.glob("*/project.json")):
        p = _read_json(path)
        if p:
            out.append(p)
    return out


def _variant_of(project):
    return VARIANT_ALIASES.get(project.get("variant", "old-voice"), project.get("variant", "old-voice"))


def _project_for(variant):
    """The video whose skill is that variant: the 2021 tutorial for old-*, a recent recording for new-voice."""
    if variant.startswith("old"):
        return next((p for p in _projects() if p["id"] == VIDEO["id"]), None) or \
            next((p for p in _projects() if _variant_of(p) == "old-voice"), None)
    return next((p for p in _projects() if _variant_of(p) == variant), None)


def _video_id():
    p = _project_for("old-voice")
    return p["id"] if p else VIDEO["id"]


def _bench_arm(row, run):
    """The bench arm of a run: written by 90_bench.py, or derived from an older run file."""
    arm = (run or {}).get("bench_arm") or row.get("arm")
    if arm == "skill":
        arm = VARIANT_ALIASES.get((run or {}).get("variant", "old-voice"), (run or {}).get("variant", "old-voice"))
    return VARIANT_ALIASES.get(arm, arm)


def _csv_invoices():
    """data/factures.csv in the shape the templates use."""
    path = ROOT / "data" / "factures.csv"
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {int(r["id"]): {"id": int(r["id"]), "supplier": r["fournisseur"], "ref": r["ref_fournisseur"],
                               "date": r["date"], "label": r["libelle"], "ht": float(r["montant_ht"]),
                               "vat": float(r["tva"]), "trap": r.get("notes", "")}
                for r in csv.DictReader(f)}


def _num(x, cast=float):
    try:
        return cast(x)
    except (TypeError, ValueError):
        return None


def _time(text):
    try:
        return datetime.fromisoformat(text).astimezone(PARIS)
    except (TypeError, ValueError):
        return None


def _real_run(row, run, inv):
    run = run or {}
    sql_rows = run.get("sql") or []
    if isinstance(sql_rows, dict):
        sql_rows = [sql_rows]
    sql_rows = [x for x in sql_rows if isinstance(x, dict)] if isinstance(sql_rows, list) else []
    s0 = sql_rows[0] if sql_rows else None
    sql = None
    if s0:
        lines = s0.get("lines") or []
        sql = {"ref": s0.get("ref", ""), "supplier": s0.get("supplier", ""),
               "total_ht": float(s0.get("total_ht") or 0),
               "vat": float(lines[0].get("tva_tx") or 0) if lines else 0.0,
               "status": 1 if str(s0.get("fk_statut")) == "1" else 0}
    answer = run.get("answer") if isinstance(run.get("answer"), dict) else None  # the agent may answer plain text
    return {
        "id": row["run_id"],
        "arm": _bench_arm(row, run),
        "row": int(row["row_id"]),
        "invoice": inv,
        "verdict": row["verdict"],
        "steps": _num(run.get("steps") or row.get("steps"), int) or 0,
        "duration": _num(run.get("duration_s") or row.get("duration_s")) or 0,
        "cost": _num(run.get("total_cost_usd") or row.get("total_cost_usd")) or 0,
        "error": run.get("error_code") or row.get("error_code") or "",
        "status": run.get("status") or row.get("status") or "",
        "started_at": _time(run.get("started_at") or row.get("started_at")),
        "session": run.get("session_id", ""),
        "skill_loaded": bool(run.get("skill_loaded")),
        "before": run.get("db_rows_before"),
        "after": run.get("db_rows_after"),
        "sql": sql,
        "answer": answer,
        "drift_texts": [d.strip() for d in (run.get("drift") or (answer or {}).get("drift") or []) if d and d.strip()],
        "drift": [],
        "note": run.get("note") or row.get("note") or "",
        "share_url": run.get("share_url") or row.get("share_url") or "",
        "agent": run.get("agent", ""),
        "task": run.get("task", ""),
        "variant": run.get("variant", ""),
        "piege": run.get("piege") or row.get("piege") or "",
        "skill_revision": _num(run.get("skill_revision") if run.get("skill_revision") is not None else row.get("skill_revision"), int),
        "sql_rows": sql_rows,
        "skill_ref": ", ".join(f"{d['name']}:{d['revision']}" for d in
                               ((run.get("dependency_revisions") or {}).get("skills") or [])),
    }


def invoice_task(inv, piege=""):
    """The task sentence of a run that did not keep it (older run files): the same French sentence
    as scripts/70_run_one.py::invoice_task, with the software address of the project. A `tva`
    trap row does not name the rate."""
    p = _project_for("old-voice") or {}
    url = (p.get("software") or {}).get("url") or "http://localhost:8080"
    tva = "" if piege == "tva" else f", TVA {inv['vat']:g} %"
    return (f"Crée une facture fournisseur dans Dolibarr : fournisseur « {inv['supplier']} », "
            f"référence fournisseur « {inv['ref']} », date {inv['date']}, "
            f"une ligne libre « {inv['label']} » à {inv['ht']:.2f} € HT{tva}. "
            f"Valide la facture. Commence par {url}.")


def _understanding(variant):
    """understanding.<variant>.json written by 50_induce.py (or the older skill.<variant>.json)."""
    p = _project_for(variant)
    if not p:
        return None, None
    work = WORK / p["id"]
    names = [variant] + [old for old, new in VARIANT_ALIASES.items() if new == variant]
    for name in names:
        u = _read_json(work / f"understanding.{name}.json")
        if u:
            return p, u
    return p, None


def _real_skill(variant):
    p, u = _understanding(variant)
    if not u:
        return None
    meta = u.get("meta") or {}
    names = [variant] + [old for old, new in VARIANT_ALIASES.items() if new == variant]
    reg = next((r for r in (_read_json(WORK / p["id"] / f"agent.{n}.json") for n in names) if r), {})
    src = {**VIDEO} if variant.startswith("old") else {
        "title": p["source"].get("name") or f"YouTube {p['source'].get('id', '')}",
        "published_short": (p.get("created_at") or "")[:10], "duration": 0}
    inputs = f"{meta.get('images', '?')} images" + (f", {meta['sentences']} sentences" if meta.get("sentences") else ", no sentences")
    inputs += f", {meta.get('requests', '?')} requests"
    return {
        "label": ARM_LABELS.get(variant, variant) + (", voice and images" if variant.endswith("voice") else ""),
        "name": (u.get("task") or {}).get("name", ""),
        "revision": reg.get("revision", 1),
        "source": src,
        "model": meta.get("model", ""),
        "inputs": inputs,
        "description": (u.get("task") or {}).get("description", ""),
        "preconditions": [x.get("text", "") for x in u.get("preconditions") or []],
        "steps": [{"t": s.get("t") or 0, "text": s.get("action", ""), "frame": s.get("frame", "")} for s in u.get("steps") or []],
        "mapping": [(m.get("input", ""), m.get("field", "")) for m in u.get("field_mapping") or []],
        "exceptions": [{"t": r.get("t") or 0, "text": r.get("rule", "")} for r in u.get("exception_rules") or []],
        "check": "; ".join(u.get("final_check") or []),
        "video_id": p["id"],
    }


def _quoted(text):
    return [q.lower() for q in re.findall(r"[«“\"]\s*([^»”\"]+?)\s*[»”\"]", text)]


def _real_bench():
    """Runs of bench.csv, plus the drift catalog built from the 2021 tutorial arm."""
    rows = _bench_rows()
    invs = _csv_invoices()
    out = []
    for row in rows:
        run = _read_json(WORK / "runs" / f"{row['run_id']}.json")
        try:
            inv = invs.get(int(row["row_id"])) or {"id": int(row["row_id"]), "supplier": "", "ref": "", "date": "",
                                                   "label": "", "ht": 0.0, "vat": 0.0, "trap": ""}
        except (TypeError, ValueError):
            continue
        out.append(_real_run(row, run, inv))
    out.sort(key=lambda r: (ARM_ORDER.index(r["arm"]) if r["arm"] in ARM_ORDER else 9, r["row"]))

    old = [r for r in out if r["arm"] == "old-voice"]
    counter = Counter(t for r in old for t in set(r["drift_texts"]))
    k = _real_skill("old-voice")
    steps = (k or {}).get("steps") or []
    catalog = []
    for i, (text, n) in enumerate(counter.most_common(), 1):
        words = _quoted(text)
        step = next((j for j, s in enumerate(steps, 1) if any(w and w in s["text"].lower() for w in words)), None)
        catalog.append({"id": f"d{i}", "step": step, "t": steps[step - 1]["t"] if step else None,
                        "was": steps[step - 1]["text"] if step else "", "now": text, "seen": n})
    ids = {d["now"]: d["id"] for d in catalog}
    for r in out:
        r["drift"] = [ids[t] for t in dict.fromkeys(r["drift_texts"]) if t in ids]
    return out, catalog


def _real_video():
    p = _project_for("old-voice")
    if not p:
        return VIDEO
    frames = _read_json(WORK / p["id"] / "frames.json") or []
    return {**VIDEO, "id": p["id"], "frames": len(frames) or VIDEO["frames"]}


def _real_storyboard():
    p = _project_for("old-voice")
    board = _read_json(WORK / p["id"] / "storyboard.json") if p else None
    if not board:
        return None
    # `fr` is what Gladia heard; there is no English translation of the real transcript.
    return [{"t": s["t"], "frame": s["frame"], "fr": s["sentence"], "en": s["sentence"]} for s in board]


def _real_arms(runs_):
    out = []
    for key in ARM_ORDER:
        n = sum(1 for r in runs_ if r["arm"] == key)
        agent = next((r["agent"] for r in runs_ if r["arm"] == key and r["agent"]), "")
        out.append({"key": key, "label": ARM_LABELS[key], "agent": agent or "—",
                    "skill": None if key == "none" else key.replace("-repaired", ""), "not_run": n == 0})
    return out


# ---------- Public API: real outputs when there are some, the sample otherwise ----------

def video():
    return VIDEO if is_sample() else _real_video()


def frames_video_id():
    """The work/<id>/frames/ folder the storyboard images come from."""
    return _video_id()


def storyboard():
    if is_sample():
        return STORYBOARD
    return _real_storyboard() or STORYBOARD


def skills():
    if is_sample():
        return SKILLS
    real = {v: _real_skill(v) for v in ("old-voice", "new-voice", "old-images")}
    return {v: k for v, k in real.items() if k} or SKILLS


def skill(key):
    return skills().get(key)


def invoices():
    if is_sample():
        return INVOICES
    return list(_csv_invoices().values())[:8] or INVOICES


def drift():
    return DRIFT if is_sample() else _real_bench()[1]


def arms():
    return ARMS if is_sample() else _real_arms(_real_bench()[0])


def arm(key):
    return next((a for a in arms() if a["key"] == key), None)


def runs(arm_key=None):
    all_ = RUNS if is_sample() else _real_bench()[0]
    return [r for r in all_ if arm_key in (None, r["arm"])]


def run(run_id):
    return next((r for r in runs() if r["id"] == run_id), None)


def summary(arm_key):
    """Counts per arm. `noop` runs (the invoice already existed, the agent rightly created nothing)
    measure nothing: they stay in the run list but out of n and of every count."""
    all_ = runs(arm_key)
    rs = [r for r in all_ if r["verdict"] != "noop"]
    n = len(rs)

    def count(*vs):
        return sum(1 for r in rs if r["verdict"] in vs)

    def avg(field):
        return sum(r[field] for r in rs) / n if n else 0

    return {
        "n": n,
        "success": count("success"),
        "partial": count("partial"),
        "fail": count("fail", "duplicate", "crash"),
        "noop": len(all_) - n,
        "steps": avg("steps"),
        "duration": avg("duration"),
        "cost": avg("cost"),
        "skill_loaded": sum(1 for r in rs if r["skill_loaded"]),
        "self_wrong": sum(1 for r in rs if r["answer"] and r["answer"].get("created") and r["verdict"] != "success"),
    }


# ---------- House-rule traps, repairs, audit ----------

PIEGE_RULES = {"doublon": "If there are two Transports Lemaire, take the one with a SIREN.",
               "tva": "Café du Coin invoices are always at 5.5% VAT."}
PIEGE_LABELS = {"doublon": "Duplicate supplier", "tva": "VAT rate"}


def _json_list(path):
    data = _read_json(path)
    return data if isinstance(data, list) else []


_SENTENCE_EN = [("bon tiers (celui avec SIREN)", "right supplier (the one with a SIREN)"),
                ("TVA 5,5 % appliquée", "5.5 % VAT applied"), ("facture conforme", "invoice correct"),
                ("mauvais tiers (sans SIREN)", "wrong supplier (no SIREN)"), ("mauvais tiers", "wrong supplier"),
                ("rien créé", "nothing created"), ("mauvaise TVA", "wrong VAT"), ("mauvais montant HT", "wrong amount before tax"),
                ("restée en brouillon", "left as a draft"), ("non vérifié", "not verified"), ("pas de run", "no run"), ("créée en double", "created twice"),
                ("session plantée", "session crashed"), ("saisie incomplète", "incomplete entry")]


def _sentence_en(text):
    """The pipeline writes the trap sentences in French (report/bench.md); the site is in English."""
    for fr, en in _SENTENCE_EN:
        text = text.replace(fr, en)
    return text


def traps():
    """House-rule trap rows: report/bench_traps.json, or built from the runs that carry a `piege`."""
    given = _json_list(REPORT / "bench_traps.json")
    out = []
    labels = {a["key"]: a["label"] for a in arms()}
    for t in given:
        if not isinstance(t, dict) or not t.get("piege"):
            continue
        cells = []
        given_arms = t.get("arms") if isinstance(t.get("arms"), dict) else {}
        for key in sorted(given_arms, key=lambda k: ARM_ORDER.index(k) if k in ARM_ORDER else 9):
            c = given_arms[key] if isinstance(given_arms[key], dict) else {}
            cells.append({"arm": key, "label": labels.get(key, ARM_LABELS.get(key, key)), "verdict": c.get("verdict", ""),
                          "run_id": c.get("run_id", ""), "sentence": _sentence_en(c.get("sentence", ""))})
        out.append({"row": t.get("row"), "piege": t["piege"], "cells": cells})
    if out or is_sample():
        return out
    by_row = {}
    for r in runs():
        if r.get("piege"):
            by_row.setdefault((r["row"], r["piege"]), []).append(r)
    for (row, piege), rs in sorted(by_row.items()):
        cells = [{"arm": r["arm"], "label": labels.get(r["arm"], r["arm"]), "verdict": r["verdict"],
                  "run_id": r["id"], "sentence": r["note"]} for r in sorted(rs, key=lambda r: ARM_ORDER.index(r["arm"]) if r["arm"] in ARM_ORDER else 9)]
        out.append({"row": row, "piege": piege, "cells": cells})
    return out


def repairs(pid):
    return [x for x in _json_list(WORK / pid / "repairs.json") if isinstance(x, dict)]


def audit(pid):
    return [x for x in _json_list(WORK / pid / "audit.json") if isinstance(x, dict)]


def translations(pid):
    """{original: English} for the text the project page shows (scripts/56_translate.py), {} before it ran."""
    table = _read_json(WORK / pid / "translations.en.json")
    return table if isinstance(table, dict) else {}


def skill_revision(pid, variant, repairs_, project_runs):
    """Current skill revision: the latest repair, else the revision the latest run loaded, else agent.json."""
    revs = [_num(x.get("revision"), int) for x in repairs_]
    revs = [r for r in revs if r is not None]
    if revs:
        return max(revs)
    for r in project_runs:
        for d in ((r.get("dependency_revisions") or {}).get("skills") or []):
            if isinstance(d, dict) and str(d.get("name", "")).endswith(variant):
                rev = _num(d.get("revision"), int)
                if rev is not None:
                    return rev
    agent = _read_json(WORK / pid / "agent.json") or {}
    return _num(agent.get("skill_revision"), int) if isinstance(agent, dict) else None


def audit_shown(rows):
    return sum(1 for x in rows if x.get("checked_by") == "hand") >= 2
