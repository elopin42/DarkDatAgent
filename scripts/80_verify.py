"""[8] The verdict of a run comes from the Dolibarr database, never from the agent's answer.

Reads llx_facture_fourn for the supplier reference of the invoice (its row of data/factures.csv, or the
`invoice` typed on the project page): `success` if exactly one
row, right supplier (the one with a SIREN when two share the name), total before tax within
0.01 and status 1 (validated); `partial` if created but not validated or wrong amount or
wrong supplier; `duplicate` if more than one row; `fail` if none; `crash` if the session
failed before answering; `noop` if the invoice already existed before the run and the agent
rightly created nothing (left out of the counts). Rows before/after catch invoices created elsewhere.

`--offline`: recompute the verdict from what the run file already holds (sql, db_rows_before,
db_rows_after), without touching the database. For runs judged with an older version of `judge`.

Only for the demo Dolibarr (database on 127.0.0.1:3306). For other software the verdict
stays `unverified` and the agent's answer is all we have.

Usage: python scripts/80_verify.py <run_id>      (updates work/runs/<run_id>.json)
"""
import argparse
import json
import sys

from common import ROOT, RUNS, invoice

DB = dict(host="127.0.0.1", port=3306, user="dolidbuser", password="dolidbpass", database="dolidb")


def connect():
    import mysql.connector
    return mysql.connector.connect(connection_timeout=5, **DB)


def db_available():
    try:
        connect().close()
        return True
    except ImportError:
        raise  # a missing package is a setup bug (make install), not "Dolibarr is down"
    except Exception:
        return False


def count():
    db = connect()
    cur = db.cursor()
    cur.execute("SELECT COUNT(*) FROM llx_facture_fourn")
    n = cur.fetchone()[0]
    db.close()
    return n


def lookup(ref_supplier):
    db = connect()
    cur = db.cursor(dictionary=True)
    cur.execute("""SELECT f.rowid, f.ref, f.ref_supplier, f.total_ht, f.total_tva, f.total_ttc, f.fk_statut,
                          s.nom AS supplier, s.siren
                   FROM llx_facture_fourn f JOIN llx_societe s ON s.rowid = f.fk_soc
                   WHERE f.ref_supplier = %s ORDER BY f.rowid""", (ref_supplier,))
    rows = cur.fetchall()
    for r in rows:
        cur.execute("SELECT tva_tx, pu_ht, qty, description FROM llx_facture_fourn_det WHERE fk_facture_fourn = %s ORDER BY rang", (r["rowid"],))
        r["lines"] = cur.fetchall()
        for k in ("total_ht", "total_tva", "total_ttc"):
            r[k] = float(r[k] or 0)
        for l in r["lines"]:
            l["tva_tx"], l["pu_ht"], l["qty"] = float(l["tva_tx"] or 0), float(l["pu_ht"] or 0), float(l["qty"] or 0)
    db.close()
    return rows


def clear(ref_supplier):
    """Delete the supplier invoices with this reference (demo database only: the caller checks).
    Invoices with a payment are kept. Returns the Dolibarr refs removed."""
    db = connect()
    cur = db.cursor()
    cur.execute("""SELECT f.rowid, f.ref FROM llx_facture_fourn f
                   WHERE f.ref_supplier = %s AND NOT EXISTS
                     (SELECT 1 FROM llx_paiementfourn_facturefourn p WHERE p.fk_facturefourn = f.rowid)""", (ref_supplier,))
    found = cur.fetchall()
    for rowid, _ in found:
        for sql in ("DELETE FROM llx_facture_fourn_det WHERE fk_facture_fourn = %s",
                    "DELETE FROM llx_facture_fourn_extrafields WHERE fk_object = %s",
                    "DELETE FROM llx_element_element WHERE (fk_target = %s AND targettype = 'invoice_supplier')",
                    "DELETE FROM llx_facture_fourn WHERE rowid = %s"):
            try:
                cur.execute(sql, (rowid,))
            except Exception:
                pass  # a table this Dolibarr version does not have
    db.commit()
    db.close()
    return [ref for _, ref in found]


def judge(row, found, before, after, session_failed=False):
    """(verdict, note) from the CSV row and what the database holds."""
    if session_failed and not found:
        return "crash", "the session failed before creating anything"
    if len(found) > 1:
        return "duplicate", f"{len(found)} invoices with reference {row['ref_fournisseur']}"
    if not found:
        return "fail", "no invoice with this supplier reference" + (f" ({after - before} other rows appeared)" if after > before else "")
    if before and after <= before:  # the invoice was there before this run: it created nothing
        # Not a failure of the agent: its instructions say "never create the same record twice",
        # the invoice was already there and it stopped. The run measures nothing, so it is `noop`
        # and the reports leave it out of the counts.
        return ("crash" if session_failed else "noop"), "nothing created by this run: an invoice with this reference already existed and the agent did not duplicate it"
    f = found[0]
    problems = []
    if f["supplier"] != row["fournisseur"]:
        problems.append(f"supplier is “{f['supplier']}”")
    elif row.get("piege") == "doublon" and not f["siren"]:
        problems.append("the third party without a SIREN was picked")
    if abs(f["total_ht"] - row["montant_ht"]) > 0.01:
        problems.append(f"total before tax is {f['total_ht']:.2f}")
    rates = {l["tva_tx"] for l in f["lines"]}
    if f["lines"] and rates != {row["tva"]}:
        problems.append("VAT rate is " + ", ".join(f"{r:g}%" for r in sorted(rates)))
    if f["fk_statut"] == 0:
        problems.append("still a draft")
    if after - before > 1:
        problems.append(f"{after - before} rows created")
    if problems:
        return "partial", "; ".join(problems)
    return "success", ""


def expected(run):
    """The invoice a run had to create: its row of data/factures.csv, or the one typed on the project page."""
    if isinstance(run.get("invoice"), dict):
        return run["invoice"]
    return invoice(run["row"]) if run.get("row") is not None else None


def verify(run):
    """Fill verdict, sql, db_rows_after in a run dict. Returns the run."""
    row = expected(run)
    if row is None:
        run["verdict"], run["note"] = "unverified", "free task: no database check"
        return run
    if not db_available():
        run["verdict"], run["note"] = "unverified", "Dolibarr database not reachable on 127.0.0.1:3306"
        return run
    found = lookup(row["ref_fournisseur"])
    run["db_rows_after"] = count()
    run["sql"] = [{k: v for k, v in f.items()} for f in found]
    failed = run.get("status") not in ("completed",)
    run["verdict"], run["note"] = judge(row, found, run.get("db_rows_before") or 0, run["db_rows_after"], failed)
    return run


def rejudge(run):
    """Same as verify(), from the run file alone: no database."""
    if expected(run) is None or run.get("sql") is None or run.get("db_rows_after") is None:
        return run
    found = [x for x in run["sql"] if isinstance(x, dict)] if isinstance(run["sql"], list) else []
    failed = run.get("status") not in ("completed",)
    run["verdict"], run["note"] = judge(expected(run), found, run.get("db_rows_before") or 0, run["db_rows_after"], failed)
    return run


def main():
    p = argparse.ArgumentParser()
    p.add_argument("run_id")
    p.add_argument("--offline", action="store_true", help="recompute the verdict from the run file, without the database")
    a = p.parse_args()
    path = RUNS / f"{a.run_id}.json"
    if not path.exists():
        sys.exit(f"{path.relative_to(ROOT)} not found")
    run = (rejudge if a.offline else verify)(json.loads(path.read_text()))
    path.write_text(json.dumps(run, ensure_ascii=False, indent=2, default=str) + "\n")
    print(f"{a.run_id}: {run.get('verdict') or 'no verdict (the run never finished)'}" + (f" ({run['note']})" if run.get("note") else ""))


if __name__ == "__main__":
    main()
