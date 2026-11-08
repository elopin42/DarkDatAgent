# Project site (Django), pipeline and demo Dolibarr.
# `make` alone installs everything, starts the site and opens it. `make help` lists the targets.

PYTHON  ?= python3
VENV    := .venv
PY      := $(VENV)/bin/python
PORT    ?= 8000
HOST    ?= 127.0.0.1
RUN_DIR := .run
PID     := $(RUN_DIR)/django.pid
LOG     := $(RUN_DIR)/django.log
STAMP   := $(VENV)/.installed

.DEFAULT_GOAL := app
.PHONY: help app install front front-clean translate run start stop restart status logs update check clean fclean pipeline-install prep \
        register agent-run bench bench-traps bench-import repair report dolibarr dolibarr-stop dolibarr-logs dolibarr-sql dolibarr-reset chrome

APP_URL := http://$(HOST):$(PORT)/start/
OPEN    := $(shell command -v xdg-open open 2>/dev/null | head -1)

app: ## Install everything, start the site, open it in the browser (the default)
	@$(MAKE) --no-print-directory start
	@if [ -n "$(OPEN)" ]; then "$(OPEN)" $(APP_URL) >/dev/null 2>&1 & fi
	@echo "Open $(APP_URL)"

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-16s %s\n", $$1, $$2}'

$(PY):
	$(PYTHON) -m venv $(VENV)

$(STAMP): requirements.txt scripts/requirements.txt | $(PY)
	$(PY) -m pip install --quiet --upgrade pip
	$(PY) -m pip install --quiet -r requirements.txt
	@touch $(STAMP)

install: $(STAMP) front ## Create .venv and install dependencies, build the front

# ---- Front (soussol-v2, Vite): built into soussol-v2/dist, served by Django on the same origin.
FRONT     := soussol-v2
FRONT_OUT := $(FRONT)/dist/index.html
NPM       := $(shell command -v npm 2>/dev/null)

$(FRONT)/node_modules/.package-lock.json: $(FRONT)/package.json $(FRONT)/package-lock.json
	cd $(FRONT) && npm ci --no-audit --no-fund

$(FRONT_OUT): $(FRONT)/node_modules/.package-lock.json $(shell find $(FRONT)/src $(FRONT)/tools $(FRONT)/index.html -type f 2>/dev/null) report/bench.csv $(wildcard work/*/translations.en.json)
	cd $(FRONT) && npm run build

front: ## Build the front (soussol-v2) if its sources changed; needs node and npm
	@if [ -n "$(NPM)" ]; then $(MAKE) --no-print-directory $(FRONT_OUT); \
	else echo "npm not found: the site falls back to the Django templates (install Node to build $(FRONT))"; fi

front-clean: ## Remove the front build
	rm -rf $(FRONT)/dist

run: $(STAMP) front ## Run the site in the foreground (Ctrl+C to stop)
	$(PY) manage.py runserver $(HOST):$(PORT) --insecure

start: $(STAMP) front ## Run the site in the background
	@mkdir -p $(RUN_DIR)
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		echo "Already running (pid $$(cat $(PID))) on http://$(HOST):$(PORT)"; \
	else \
		nohup $(PY) manage.py runserver $(HOST):$(PORT) --insecure > $(LOG) 2>&1 & echo $$! > $(PID); \
		sleep 1; echo "Started on http://$(HOST):$(PORT) (pid $$(cat $(PID)), log $(LOG))"; \
	fi

stop: ## Stop the background site
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		pkill -P $$(cat $(PID)) 2>/dev/null; kill $$(cat $(PID)); echo "Stopped (pid $$(cat $(PID)))"; \
	else \
		echo "Not running"; \
	fi
	@rm -f $(PID)

restart: ## Stop then start the background site
	@$(MAKE) --no-print-directory stop
	@$(MAKE) --no-print-directory start

status: ## Say whether the background site is running
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then \
		echo "Running (pid $$(cat $(PID))) on http://$(HOST):$(PORT)"; \
	else \
		echo "Not running"; \
	fi

logs: ## Follow the background site log
	@tail -f $(LOG)

update: ## Pull the code, update dependencies, migrate, collect static, restart if running
	git pull --ff-only
	@$(MAKE) --no-print-directory install
	$(PY) manage.py migrate --noinput
	$(PY) manage.py collectstatic --noinput --verbosity 0
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then $(MAKE) --no-print-directory restart; fi

check: $(STAMP) ## Django's system checks, then what the pipeline and the runs need
	$(PY) manage.py check
	$(PY) scripts/preflight.py --for pipeline
	$(PY) scripts/preflight.py --for run

ID ?= JZMgB1UItkk
LANG_ ?= fr

pipeline-install: install ## Same as install (kept for old habits)

prep: ## Steps 1 to 4 for one video: make prep ID=JZMgB1UItkk [LANG_=en]
	scripts/10_download.sh $(ID)
	$(PY) scripts/20_transcribe.py $(ID) --lang $(LANG_)
	$(PY) scripts/30_keyframes.py $(ID)
	$(PY) scripts/40_storyboard.py $(ID)

ROW  ?= 1
ARM  ?= skill
ARMS ?= none,old-voice,new-voice
RECENT ?=
N    ?= 8

register: ## Step 6: the skill and the agents in the H catalog: make register ID=…
	$(PY) scripts/60_register.py $(ID)

agent-run: ## Step 7+8: one run of the agent on an invoice, then the SQL verdict: make agent-run ID=… ROW=1 [ARM=none]
	$(PY) scripts/70_run_one.py $(ID) --row $(ROW) --arm $(ARM)

REPAIR ?=
RUNS_ ?=

bench: ## Step 9: the bench, arms x invoices, resumable: make bench ID=… ARMS=none,old-voice,new-voice [RECENT=<id>] N=8 [REPAIR=1]
	$(PY) scripts/90_bench.py $(ID) --arms $(ARMS) --n $(N) $(if $(RECENT),--recent $(RECENT)) $(if $(REPAIR),--repair)
	$(PY) scripts/95_report.py --video-id $(ID)

bench-traps: ## Step 9, house-rule rows only (piege set among 1..N: 3, 4, 8): make bench-traps ID=… ARMS=… RECENT=<id> N=8 [REPAIR=1]
	$(PY) scripts/90_bench.py $(ID) --arms $(ARMS) --n $(N) --traps $(if $(RECENT),--recent $(RECENT)) $(if $(REPAIR),--repair)
	$(PY) scripts/95_report.py --video-id $(ID)

repair: ## Step 7b: repair the skill from the drift reported, new revision: make repair ID=… [VARIANT=old-voice] [RUNS_=id1,id2]
	$(PY) scripts/75_repair.py $(ID) --variant $(or $(VARIANT),old-voice) $(if $(RUNS_),--from-runs $(RUNS_))

translate: ## Step 5b: English copy, for the pages, of what the agent learned and of the agents' reports (H Models API): make translate ID=…
	$(PY) scripts/56_translate.py $(ID)

bench-import: ## Add the runs made outside the bench (project page, agent-run) to report/bench.csv, then the reports: make bench-import ID=…
	$(PY) scripts/90_bench.py $(ID) --import
	$(PY) scripts/95_report.py --video-id $(ID)

report: ## report/bench.md, drift.md, errors.md from the runs done so far
	$(PY) scripts/95_report.py

# ---- Demo Dolibarr (docker-compose.yml): http://localhost:8080, admin/admin, agent/agent-demo-2026
DOLI_URL := http://localhost:8080
COMPOSE  := docker compose

dolibarr: ## Start the demo Dolibarr, wait until it answers, seed user `agent` and the suppliers
	@mkdir -p data/mariadb data/documents
	$(COMPOSE) up -d
	@printf "Waiting for Dolibarr (first start installs the database, about a minute)"
	@for i in $$(seq 1 120); do \
		code=$$(curl -s -o /dev/null -w '%{http_code}' $(DOLI_URL)/index.php); \
		if [ "$$code" = 200 ] && ! curl -s $(DOLI_URL)/index.php | grep -q 'install/'; then echo " up"; break; fi; \
		printf "."; sleep 2; \
		if [ $$i = 120 ]; then echo; echo "Dolibarr did not answer in 4 min: make dolibarr-logs"; exit 1; fi; \
	done
	@for i in 1 2 3 4 5; do $(COMPOSE) exec -T dolibarr php /seed/seed.php && break; \
		[ $$i = 5 ] && { echo "seed failed: make dolibarr-logs"; exit 1; }; echo "seed failed, retrying in 5 s"; sleep 5; done
	@echo "Dolibarr: $(DOLI_URL)  (admin/admin, agent/agent-demo-2026)"

dolibarr-stop: ## Stop the demo Dolibarr (data kept in data/)
	$(COMPOSE) stop

dolibarr-logs: ## Follow the Dolibarr logs
	$(COMPOSE) logs -f dolibarr

dolibarr-sql: ## Open a SQL shell on the Dolibarr database
	$(COMPOSE) exec mariadb mariadb -udolidbuser -pdolidbpass dolidb

dolibarr-reset: ## Delete the Dolibarr database and documents, then start from scratch
	@printf "Delete data/mariadb and data/documents (all invoices)? [y/N] "; read a; [ "$$a" = y ]
	$(COMPOSE) down
	docker run --rm --entrypoint rm -v "$(CURDIR)/data:/d" mariadb:11 -rf /d/mariadb /d/documents
	@$(MAKE) --no-print-directory dolibarr

CHROME ?= $(shell command -v google-chrome google-chrome-stable chromium chromium-browser 2>/dev/null | head -1)

chrome: ## Open the agent's Chrome on Dolibarr, debug port 9222, profile ~/.hai/chrome-profile
	@[ -n "$(CHROME)" ] || { echo "Chrome not found: make chrome CHROME=/path/to/chrome"; exit 1; }
	@if curl -s http://localhost:9222/json/version >/dev/null; then echo "Chrome already listening on 9222"; else \
		nohup "$(CHROME)" --remote-debugging-port=9222 --user-data-dir="$$HOME/.hai/chrome-profile" $(DOLI_URL) >/dev/null 2>&1 & \
		echo "Chrome started: log in as agent / agent-demo-2026 once, the profile keeps the session"; fi

clean: ## Stop the site, remove .venv, run files, collected static and the front build
	@$(MAKE) --no-print-directory stop
	rm -rf $(VENV) $(RUN_DIR) staticfiles $(FRONT)/dist $(FRONT)/node_modules

fclean: ## clean + remove the Dolibarr containers, volumes, images, data/mariadb, data/documents and db.sqlite3
	@printf "Delete the Dolibarr containers, images, database, documents and the site db.sqlite3? [y/N] "; read a; [ "$$a" = y ]
	@$(MAKE) --no-print-directory clean
	-$(COMPOSE) down -v --remove-orphans
	-docker run --rm --entrypoint rm -v "$(CURDIR)/data:/d" mariadb:11 -rf /d/mariadb /d/documents
	-docker rmi mariadb:11 dolibarr/dolibarr:22
	rm -f db.sqlite3
