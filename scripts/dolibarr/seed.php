<?php
/*
 * Seed the demo Dolibarr (docs/SETUP.md, block 7). Run inside the container by `make dolibarr`:
 *   docker compose exec -T dolibarr php /seed/seed.php
 * Idempotent: running it again creates nothing that already exists.
 *
 * - French interface (the 2021 tutorial and the invoice labels are in French)
 * - non-admin user `agent` / `agent-demo-2026` (Dolibarr 22 wants 12 chars min),
 *   with only the rights the task needs
 * - 5 suppliers; two carry a fictitious SIREN; "Transports Lemaire" exists twice,
 *   only one with a SIREN (the duplicate trap of data/factures.csv)
 */
if (php_sapi_name() !== 'cli') { exit(1); }
$res = include '/var/www/html/master.inc.php';
if (!$res) { fwrite(STDERR, "master.inc.php not found\n"); exit(1); }
require_once DOL_DOCUMENT_ROOT.'/user/class/user.class.php';
require_once DOL_DOCUMENT_ROOT.'/societe/class/societe.class.php';
require_once DOL_DOCUMENT_ROOT.'/core/lib/admin.lib.php';

const AGENT_PASSWORD = 'agent-demo-2026';

function fail($msg) { fwrite(STDERR, "seed: $msg\n"); exit(1); }

$admin = new User($db);
if ($admin->fetch(0, 'admin') <= 0) fail('admin user not found, is the install finished?');
if (method_exists($admin, 'loadRights')) $admin->loadRights(); else $admin->getrights();
$user = $admin;

// French interface for everyone
dolibarr_set_const($db, 'MAIN_LANG_DEFAULT', 'fr_FR', 'chaine', 0, '', $conf->entity);

// ---- user `agent`
$agent = new User($db);
if ($agent->fetch(0, 'agent') <= 0) {
	$agent->login = 'agent';
	$agent->lastname = 'Agent';
	$agent->firstname = 'H';
	$agent->admin = 0;
	$agent->status = 1;
	$agent->entity = $conf->entity;
	if ($agent->create($admin) < 0) fail('create agent: '.$agent->error.' '.implode(', ', $agent->errors));
	echo "user agent created\n";
} else {
	echo "user agent already there\n";
}
// Always (re)set it, so the documented password is the one that works
if ($agent->setPassword($admin, AGENT_PASSWORD) < 0) fail('agent password: '.$agent->error);
echo "agent password: ".AGENT_PASSWORD."\n";

// Rights: see and create third parties, read supplier side, read/create/validate
// supplier invoices, read products. Nothing else, no admin.
$wanted = "(r.module = 'societe' AND (r.perms IN ('lire', 'creer') OR (r.perms = 'client' AND r.subperms = 'voir')))"
	." OR (r.module = 'fournisseur' AND (r.perms = 'lire' OR (r.perms = 'facture' AND r.subperms IN ('lire', 'creer', 'valider'))"
	." OR (r.perms = 'supplier_invoice_advance' AND r.subperms = 'validate')))"
	." OR (r.module = 'supplier_invoice' AND r.perms IN ('lire', 'creer', 'validate'))"
	." OR (r.module = 'produit' AND r.perms = 'lire')";
$sql = "SELECT r.id, r.module, r.perms, r.subperms FROM ".MAIN_DB_PREFIX."rights_def r"
	." WHERE r.entity = ".((int) $conf->entity)." AND ($wanted) ORDER BY r.id";
$resql = $db->query($sql);
if (!$resql) fail('rights: '.$db->lasterror());
$granted = array();
while ($o = $db->fetch_object($resql)) {
	$agent->addrights($o->id);
	$granted[] = $o->module.'.'.$o->perms.($o->subperms ? '.'.$o->subperms : '');
}
if (!$granted) fail('no matching rights: are the Societe and Fournisseur modules enabled?');
echo "agent rights: ".implode(', ', $granted)."\n";

// ---- suppliers: [name, SIREN or '']
$suppliers = array(
	array('Papeterie Nord', ''),
	array('Hébergeur Alpha', ''),
	array('Transports Lemaire', '812345676'),
	array('Transports Lemaire', ''),
	array('Café du Coin', ''),
	array('Fournitures Sud', '845671239'),
);
$france = (int) getCountry('FR', '3');
foreach ($suppliers as $s) {
	list($name, $siren) = $s;
	$sql = "SELECT COUNT(*) AS n FROM ".MAIN_DB_PREFIX."societe WHERE nom = '".$db->escape($name)."'"
		." AND COALESCE(siren, '') = '".$db->escape($siren)."' AND fournisseur = 1";
	$n = (int) $db->fetch_object($db->query($sql))->n;
	$label = $name.($siren ? " (SIREN $siren)" : '');
	if ($n > 0) { echo "supplier $label already there\n"; continue; }

	$soc = new Societe($db);
	$soc->name = $name;
	$soc->fournisseur = 1;
	$soc->client = 0;
	$soc->code_fournisseur = 'auto';
	$soc->country_id = $france;
	$soc->idprof1 = $siren;
	$soc->status = 1;
	if ($soc->create($admin) < 0) fail("create $label: ".$soc->error.' '.implode(', ', $soc->errors));
	echo "supplier $label created\n";
}
echo "seed done\n";
