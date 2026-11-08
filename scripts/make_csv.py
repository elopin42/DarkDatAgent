"""data/factures.csv: 30 supplier invoices for the demo Dolibarr (docs/SETUP.md, block 9).

Rows 1 to 8 are the bench rows (never used for tuning), 9 to 30 are for tuning. The column
`piege` names the house rule a row tests, said out loud in the internal video and never in
the task sentence: `doublon` (two "Transports Lemaire", take the one with a SIREN), `tva`
(Café du Coin is always at 5.5 % VAT), or empty. Bench trap rows: 3 (doublon), 4 and 8 (tva).

Usage: python scripts/make_csv.py
"""
import csv
import random

from common import CSV, ROOT

BENCH = [
    (1, "Papeterie Nord", "PN-2026-0412", "2026-10-03", "Ramettes A4 x20", 184.00, 20, "", ""),
    (2, "Hébergeur Alpha", "HA-77812", "2026-10-05", "Serveur octobre", 59.00, 20, "", ""),
    (3, "Transports Lemaire", "TL-3391", "2026-10-07", "Livraison palette", 240.00, 20, "doublon de tiers, prendre celui avec SIREN", "doublon"),
    (4, "Café du Coin", "CDC-118", "2026-10-09", "Café réunions, octobre", 86.40, 5.5, "TVA 5,5 %", "tva"),
    (5, "Fournitures Sud", "FS-20931", "2026-10-12", "Cartouches d’encre", 132.50, 20, "", ""),
    (6, "Papeterie Nord", "PN-2026-0457", "2026-10-15", "Classeurs, 40", 96.00, 20, "", ""),
    (7, "Hébergeur Alpha", "HA-77950", "2026-10-18", "Nom de domaine", 14.99, 20, "", ""),
    (8, "Café du Coin", "CDC-131", "2026-10-21", "Plateaux-repas", 212.00, 5.5, "TVA 5,5 %", "tva"),
]
SUPPLIERS = {
    "Papeterie Nord": ("PN-2026-", ["Enveloppes C4 x500", "Stylos, boîte de 50", "Post-it x12", "Agrafeuses x3"], 20),
    "Hébergeur Alpha": ("HA-", ["Serveur novembre", "Sauvegarde mensuelle", "Certificat SSL", "Stockage 1 To"], 20),
    "Transports Lemaire": ("TL-", ["Livraison colis", "Transport palette x2", "Course express"], 20),
    "Café du Coin": ("CDC-", ["Café réunions, novembre", "Viennoiseries", "Plateaux-repas x6"], 5.5),
    "Fournitures Sud": ("FS-", ["Toner noir", "Papier photo", "Câbles réseau x10", "Écran 24 pouces"], 20),
}


def main():
    rng = random.Random(716)
    rows = list(BENCH)
    names = list(SUPPLIERS)
    for i in range(9, 31):
        name = names[(i - 9) % len(names)]
        prefix, labels, vat = SUPPLIERS[name]
        ref = f"{prefix}{rng.randint(1000, 9999)}" if not prefix.endswith("-2026-") else f"{prefix}{rng.randint(500, 999):04d}"
        # Dolibarr refuses an invoice dated in the future ("la date ne peut pas être dans le futur"):
        # every row stays in October 2026, before the hackathon.
        day = 1 + (i * 7) % 28
        piege = "tva" if vat == 5.5 else ("doublon" if name == "Transports Lemaire" else "")
        notes = {"tva": "TVA 5,5 %", "doublon": "doublon de tiers, prendre celui avec SIREN"}.get(piege, "")
        rows.append((i, name, ref, f"2026-10-{day:02d}", rng.choice(labels), round(rng.uniform(12, 480), 2), vat, notes, piege))
    CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "fournisseur", "ref_fournisseur", "date", "libelle", "montant_ht", "tva", "notes", "piege"])
        for r in rows:
            w.writerow([r[0], r[1], r[2], r[3], r[4], f"{r[5]:.2f}", f"{r[6]:g}", r[7], r[8]])
    print(f"wrote {CSV.relative_to(ROOT)}: {len(rows)} rows")


if __name__ == "__main__":
    main()
