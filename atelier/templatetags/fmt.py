"""Display formats used across the site."""
from django import template

register = template.Library()

VERDICTS = {"success": "passed", "partial": "partial", "fail": "failed", "duplicate": "duplicate", "crash": "crashed",
            "noop": "already there, nothing created (not counted)", "unverified": "unverified"}


@register.filter
def tc(seconds):
    """Video timecode: 0:41"""
    s = int(round(float(seconds)))
    return f"{s // 60}:{s % 60:02d}"


@register.filter
def usd(n):
    return f"${float(n):,.2f}"


@register.filter
def eur(n):
    return f"€{float(n):,.2f}"


@register.filter
def num(n, digits=0):
    return f"{float(n):,.{int(digits)}f}"


@register.filter
def dur(seconds):
    s = int(round(float(seconds)))
    m, r = divmod(s, 60)
    return f"{m} min {r:02d}" if m else f"{r} s"


@register.filter
def vat(rate):
    return f"{float(rate):g}%"


@register.filter
def verdict(v):
    return VERDICTS.get(v, v)


@register.filter
def percent_of(n, total):
    return 0 if not total else 100 * float(n) / float(total)


@register.filter
def en(text, table):
    """The English display copy of a text (work/<id>/translations.en.json, step 5b), else the text."""
    return table.get(text.strip(), text) if isinstance(text, str) and table else text
