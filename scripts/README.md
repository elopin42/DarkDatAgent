# Le pipeline

Un script par étape, d'après `docs/ARCHITECTURE.md` (branche `docs/kickoff`).
Chaque script se relance seul et écrase sa sortie. Les sorties vont dans
`work/<video_id>/`, que le site lit sans jamais y écrire. `data/` et `work/`
ne sont pas commités.

## Installer

```bash
make                       # installe tout (Django, gladiaio-sdk, yt-dlp) et ouvre le site
```

Le plus simple : le site, page `/start/`, lance tout le pipeline pour une
vidéo via `scripts/run_project.py` et montre l'avancement. Les commandes
ci-dessous servent à lancer une étape à la main.

Les clés se saisissent sur le site : http://127.0.0.1:8000/setup/. La page les écrit dans `.env` à la racine
(droits 600, jamais commité) et ne les réaffiche jamais, seulement leurs 4
derniers caractères. Elle peut les tester auprès de Gladia et de H. Elle ne
répond qu'aux requêtes venues de la machine elle-même. Clés :
`GLADIA_API_KEY`, `HAI_API_KEY`. Un script
à qui il manque une clé s'arrête et renvoie vers cette page.

## Dolibarr de démo

```bash
make dolibarr        # lance Dolibarr 22 + MariaDB, attend qu'il réponde, pré-remplit
make chrome          # Chrome de l'agent sur Dolibarr, port 9222, profil ~/.hai/chrome-profile
make dolibarr-sql    # shell SQL sur la base
make dolibarr-stop   # arrête (les données restent dans data/)
make dolibarr-reset  # efface la base et repart de zéro (demande confirmation)
```

http://localhost:8080. Comptes : `admin` / `admin`, et `agent` /
`agent-demo-2026` (non admin ; Dolibarr 22 exige 12 caractères). Le
pré-remplissage (`scripts/dolibarr/seed.php`, idempotent) met l'interface en
français, crée `agent` avec les seuls droits utiles (tiers : lire, créer,
voir tous ; factures fournisseurs : lire, créer, valider ; produits : lire)
et 6 tiers fournisseurs :

| Fournisseur | SIREN fictif |
|---|---|
| Papeterie Nord | |
| Hébergeur Alpha | |
| Transports Lemaire | 812345676 |
| Transports Lemaire (le doublon) | |
| Café du Coin | |
| Fournitures Sud | 845671239 |

La base écoute sur `127.0.0.1:3306` (`dolidbuser` / `dolidbpass`, base
`dolidb`) pour `80_verify.py`.

## Étapes 1 à 5 : de la vidéo au skill

```bash
make prep                          # vidéo 2021, JZMgB1UItkk, en français
make prep ID=U0W0qySjzvY LANG_=en  # variante anglaise
```

Ou étape par étape :

| Script | Entrée | Sortie |
|---|---|---|
| `10_download.sh [id …]` | id YouTube (sans argument : les 4 vidéos) | `data/videos/<id>.mp4` |
| `20_transcribe.py <id> [--lang fr] [--fresh]` | la vidéo | `gladia.json` (réponse brute), `transcript.json` |
| `30_keyframes.py <id> [--threshold 0.08] [--gap 1] [--every 5]` | la vidéo | `frames/*.jpg`, `frames.json`, `showinfo.log` |
| `40_storyboard.py <id>` | `transcript.json`, `frames.json` | `storyboard.json`, `storyboard.images.json` |
| `50_induce.py <id> [--images-only] [--max-images 60] [--task …] [--fresh] [--dry-run]` | `storyboard.json`, `frames/` | `induce.<variante>.json` (réponse brute), `understanding.<variante>.json`, `SKILL.<variante>.md` |

Formats :

- `transcript.json` : `[{"sentence", "start", "end", "confidence"}]`
- `frames.json` : `[{"file": "0001.jpg", "t": 0.0, "score": 0.11, "reason": "scene"}]`.
  `score` est le changement d'image mesuré par ffmpeg (0 à 1), `reason` vaut
  `scene` (changement d'écran) ou `tick` (image périodique de sécurité).
- `storyboard.json` : `[{"t", "end", "sentence", "frame"}]`. L'image est
  la dernière affichée au début de la phrase.
- `storyboard.images.json` : `[{"t", "frame"}]`, toutes les images, pour le
  bras « images seules ».
- `understanding.<variante>.json` : ce que le modèle de H a compris, structuré :
  `software` (nom, version lue à l'écran), `task` (nom du skill, description,
  but), `preconditions`, `steps` (`t`, `frame`, `intent`, `action`,
  `ui_text` libellés exacts, `expect`, `source` dit/montré/les deux),
  `field_mapping`, `exception_rules`, `final_check`, `not_covered` (ce que
  le tutoriel ne dit ni ne montre), `transcript_fixes` (mots mal entendus,
  corrigés d'après l'écran), `drift_risks` (ce qui a sans doute changé
  depuis la vidéo), `confidence`. `meta` donne le modèle, le nombre de
  requêtes et les jetons.
- `SKILL.<variante>.md` : rendu depuis le JSON, au format de
  `ARCHITECTURE.md` [5] (frontmatter `name`/`description`, Préconditions,
  Étapes, Correspondance des champs, Règles d'exception, Vérification de fin).

## Étape 5 : la compréhension, par la Models API de H

`50_induce.py` envoie le storyboard à `holo4-27b` par tranches de 5 images
(la limite de la Models API) : chaque image clé avec son horodatage, son
type (changement d'écran ou tick) et les phrases dites pendant qu'elle était
à l'écran. Au lieu d'un brouillon Markdown qui s'accumule, le modèle tient
à jour une **compréhension structurée** (JSON) que chaque requête complète
ou corrige ; une dernière requête texte seul la consolide. Le skill est
ensuite rendu depuis ce JSON : le format est toujours bon, seul le contenu
vient du modèle, et le site peut afficher étapes, champs, règles et
corrections de transcription. Réglages :

- `--max-images 60` : on garde d'abord les images visées par une phrase,
  puis les plus gros changements d'écran (`score`). 60 images = 13 requêtes.
  Les phrases d'une image écartée sont rattachées à l'image gardée précédente.
- `--images-only` : bras `old-images`, les images sans la voix (40 images
  suffisent).
- `--model` pour changer de modèle ; si `holo4-27b` est refusé, `h_chat`
  (dans `common.py`) bascule seul sur `holo3-1-35b-a3b`, gratuit, 10
  requêtes par minute.
- `--task "créer et valider une facture fournisseur"` cadre le skill sur une
  seule tâche. Sans cela, le modèle prend la tâche principale du tutoriel et
  renvoie le reste (configuration, paiements, avoirs) dans `preconditions`
  et `not_covered` : le tutoriel 2021 non cadré donnait 47 étapes, l'agent
  en veut 10 à 25. Le site passe `task` de `project.json` s'il existe.
- Compter environ 8 minutes pour 13 requêtes : holo4 raisonne longuement
  avant d'écrire, d'où `max_tokens` à 16 000.
- `--dry-run` donne le nombre de requêtes sans payer. Une réponse qui n'est
  pas du JSON est renvoyée une fois au modèle pour réparation.
- La réponse est gardée dans `induce.<variante>.json` : relancer ne repaie
  pas, `--fresh` redemande.

## Réglages et pièges

- **Gladia ne se paie qu'une fois.** `20_transcribe.py` réutilise
  `gladia.json` s'il existe. `--fresh` redemande.
- **Seuil d'écran à 0,08, pas 0,25.** Sur le screencast 2021, un menu qui
  s'ouvre change peu de pixels : à 0,25, seuls 2 changements d'écran sur
  7 min. À 0,08 avec 1 s d'écart minimum : 106 images dont 47 sur
  changement d'écran. Viser 40 à 120 images pour 7 min.
- **Images à 1280 px de large maximum** : au-delà, le modèle réduit l'image
  et n'y gagne rien.

## Étapes 6 à 9 : l'agent, le run, le verdict, le banc

Le site les enchaîne : `60_register.py` tourne dans le pipeline juste après
l'étape 5, puis la page projet offre « Run the agent » (une facture du CSV ou
une tâche libre, avec ou sans skill) et liste les runs avec leur verdict. À la
main :

```bash
make register ID=JZMgB1UItkk            # 60 : skill + 2 agents dans le catalogue H
make agent-run ID=JZMgB1UItkk ROW=1     # 70 + 80 : une session H, puis le verdict SQL
make agent-run ID=JZMgB1UItkk ROW=1 ARM=none   # le même sans skill
make bench ID=JZMgB1UItkk ARMS=none,skill N=8  # 90 + 95 : le banc complet, reprise possible
make bench-traps ID=JZMgB1UItkk ARMS=none,old-voice,new-voice RECENT=<id vidéo interne> N=8  # les lignes à règle de maison seulement (3, 4, 8)
make bench-traps ID=JZMgB1UItkk ARMS=none,old-voice REPAIR=1   # idem, et le skill est réparé après chaque run avec dérive
make repair ID=JZMgB1UItkk [RUNS_=id1,id2]  # 75 seul : répare le skill old-voice, nouvelle révision
make report                              # 95 seul
```

| Script | Entrée | Sortie |
|---|---|---|
| `56_translate.py <id> [--dry-run]` | `understanding.*.json`, les runs, `report/bench.md`, `report/errors.md` | `translations.en.json` : {original: anglais}, pour l'affichage seulement (le skill de l'agent garde la langue de la vidéo) |
| `60_register.py <id> [--variant old-voice]` | `SKILL.<variante>.md`, `project.json` | skill `tuto-<id>-<variante>` et agents `clerk-<id>-<variante>`, `clerk-none-<id>` chez H ; `agent.<variante>.json` et `agent.json` |
| `70_run_one.py <id> (--row N \| --task "…") [--arm skill\|none] [--variant old-voice] [--revision 1\|latest]` | `agent.json`, `data/factures.csv` | `work/runs/<run_id>.json` (session, réponse, métriques, replay, verdict, `piege`, `skill_revision`) |
| `75_repair.py <id> [--variant old-voice] [--from-runs id1,id2] [--no-register] [--dry-run]` | `understanding.<variante>.json`, les `drift` des runs | `understanding.<variante>.json` (+ `repairs`), `SKILL.<variante>.md` re-rendu, nouvelle révision chez H (`60_register.py`), `work/<id>/repairs.json` |
| `80_verify.py <run_id>` | le run, la base Dolibarr | `verdict`, `sql`, `note` dans le run |
| `90_bench.py <id> [--arms none,old-voice,new-voice,old-images] [--recent <id>] [--n 8] [--rows 1,3 \| --traps] [--repair]` | les deux précédents | `report/bench.csv` (colonnes `piege`, `skill_revision`) |
| `95_report.py [--video-id <id>]` | `bench.csv`, `work/runs/` | `report/bench.md` (lignes à règle de maison d'abord), `bench_traps.json`, `drift.md`, `errors.md` |
| `make_csv.py` | | `data/factures.csv`, 30 factures (1 à 8 pour le banc), colonne `piege` |

Détails :

- **L'agent tourne dans un Chrome de cette machine** (environnement `web`,
  `host: user_device`, `start_url` = l'adresse du logiciel du projet). Le SDK
  H lance Chrome ou Chromium lui-même (profil `~/.hai/chrome-profile`, port
  9222) à la première session. Pour un logiciel autre que la démo, se
  connecter une fois dans cette fenêtre : le profil garde la session. Pour la
  démo, la tâche donne l'identifiant `agent`.
- **Un run = une session H** : `max_steps=40`, `max_time_s=600`, réponse au
  schéma `Result` (`created`, `invoice_ref`, `supplier_name`, `total_ttc`,
  `validated`, `drift[]`, `notes`). Le run est écrit dès le départ (statut,
  `agent_view_url` pour regarder en direct), puis à la fin (`share_url` du
  replay, `steps`, `total_cost_usd`).
- **Le verdict vient de SQL** (`llx_facture_fourn` sur `127.0.0.1:3306`),
  jamais de `answer.created` : `success` si une seule ligne, bon tiers (celui
  avec SIREN en cas de doublon), HT à ±0,01, TVA du CSV, statut 1 ; `partial`
  sinon ; `duplicate` si plusieurs lignes ; `fail` si aucune ; `crash` si la
  session a échoué avant de créer. `unverified` pour une tâche libre ou un
  autre logiciel.
- **Deux agents par vidéo** : `clerk-<id>-<variante>` avec le skill, et
  `clerk-none-<id>` sans, mêmes instructions et même modèle, pour le bras
  « sans tutoriel ». Révisions épinglées `nom:N` dans `agent.json`.
- **Les bras du banc** : `none` (sans skill), `old-voice` (tutoriel 2021,
  images et voix), `old-images` (tutoriel 2021, images seules : `50_induce.py
  <id> --images-only` puis `60_register.py <id> --variant old-images`),
  `new-voice` (une vidéo récente de la même tâche, ajoutée sur /new/ en cochant
  « recent recording » : `project.json` porte `"variant": "new-voice"`, le
  pipeline écrit `SKILL.new-voice.md` et `agent.new-voice.json` ; `--recent`
  pour la choisir à la main). Chaque run garde son bras dans `bench_arm`.
- **Le site lit le banc** dès que `report/bench.csv` a un run vérifié ; avant,
  il montre les données d'exemple de `atelier/data.py` et le dit.
- **Le banc** refait les factures 1 à n dans chaque bras, séquentiellement
  (un seul Chrome). Avant chaque run il supprime en SQL une facture laissée
  par une tentative précédente avec la même référence. `bench.csv` est relu
  au démarrage : un (bras, facture) déjà jugé est sauté, `--fresh` refait tout.
- **Les pièges (`piege` du CSV)** : `doublon` (deux « Transports Lemaire »,
  prendre celui avec SIREN ; ligne 3) et `tva` (Café du Coin toujours à
  5,5 % ; lignes 4 et 8). La règle n'est dite que dans la vidéo interne :
  pour une ligne `tva`, la consigne ne donne pas le taux (`70_run_one.py::
  invoice_task`). `90_bench.py --traps` ne joue que ces lignes parmi 1..n ;
  `95_report.py` les met en tête de `bench.md` avec une phrase par ligne
  (« sans vidéo : mauvais tiers (sans SIREN) / tuto 2021 : idem / vidéo
  interne : bon tiers »), et écrit `bench_traps.json` pour le site.
- **La réparation** : `75_repair.py` rassemble les `drift` des runs
  old-voice, demande au modèle de H (un appel `h_chat`, `max_tokens` 16 000)
  de corriger `steps[].ui_text` et `steps[].action`, re-rend `SKILL.md`,
  relance `60_register.py` (révision N+1, `agent.old-voice.json` suit) et
  journalise dans `work/<id>/repairs.json` (`step`, `before`, `after`,
  `seen_in_runs`, `revision`). Avec `90_bench.py --repair`, cela se fait
  après chaque run old-voice à dérive ; le bras mesuré `old-voice` reste
  épinglé à la révision 1 (`--revision 1`) et un bras `old-voice-repaired`
  suit la dernière révision (`--revision latest`) : `skill_revision` monte,
  `drift_count` descend. `base_revision` dans `agent.<variante>.json` garde
  la première révision.
- Les noms de catalogue sont en minuscules ASCII : `JZMgB1UItkk` devient
  `jzmgb1uitkk`.
