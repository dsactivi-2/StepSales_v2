import { workflow, node, trigger, newCredential, expr, sticky } from '@n8n/workflow-sdk';

const BASE = { __rl: true, mode: 'id', value: 'appLXW1HK6fe213yO', cachedResultName: 'StepSales' };
const T_CONFIG = { __rl: true, mode: 'id', value: 'tblF7wK3OESuyDoFJ', cachedResultName: 'Config' };
const T_LEADS = { __rl: true, mode: 'id', value: 'tblaT64e3mBSfULhx', cachedResultName: 'Leads' };
const T_PAKETE = { __rl: true, mode: 'id', value: 'tblKplkdKcvxC3Lvy', cachedResultName: 'Pakete' };
const T_ANGEBOTE = { __rl: true, mode: 'id', value: 'tblysTSwcnTCjcd9p', cachedResultName: 'Angebote' };
const T_FU = { __rl: true, mode: 'id', value: 'tblTnWina3R6xUidx', cachedResultName: 'Follow-ups' };
const MAIL_WF = { __rl: true, mode: 'id', value: '9uPWJkD0fqWwTC2R', cachedResultName: 'StepSales – Mail senden' };
const AT = { airtableTokenApi: newCredential('StepSales Airtable') };

const weekdays10 = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Weekdays 10:00', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 10 * * 1-5' }] }, misfirePolicy: 'skip' } },
  output: [{ json: {} }]
});

const loadConfig = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Load config',
    executeOnce: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_CONFIG, returnAll: true, options: { fields: ['Schlüssel', 'Wert'] } },
    credentials: AT
  },
  output: [{ json: { id: 'recli0zv1aj9tP1fK', 'Schlüssel': 'fu_abstand_tage', 'Wert': '2,4,7' } }]
});

const findOffers = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find sent offers',
    executeOnce: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_ANGEBOTE, returnAll: true, filterByFormula: "AND({Status}='sent', {Gesendet am}!=BLANK())", options: { fields: ['Angebot-ID', 'Gesendet am', 'Gültig bis', 'Lead', 'Paket'] } },
    credentials: AT
  },
  output: [{ json: { id: 'recOFFER000000001', 'Angebot-ID': 'call-TEST-0001:create_offer:2', 'Gesendet am': '2026-11-20T10:00:00.000Z', 'Gültig bis': '2026-11-27', Lead: ['recTESTLEAD000001'], Paket: ['recPAKET000000002'] } }]
});

const findFollowups = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find follow-ups',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_FU, returnAll: true, filterByFormula: "OR({Stufe}='offer', {Stufe}='fu1', {Stufe}='fu2', {Stufe}='fu3')", options: { fields: ['FU-ID', 'Stufe', 'Status', 'Empfänger', 'Angebot', 'Gesendet am'] } },
    credentials: AT
  },
  output: [{ json: { id: 'recFU000000000001', 'FU-ID': 'call-TEST-0001:send_followup:3', Stufe: 'offer', Status: 'sent', 'Empfänger': 'anna@example.com', Angebot: ['recOFFER000000001'] } }]
});

const findLeads = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find open leads',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, returnAll: true, filterByFormula: "AND(NOT({DNC}), OR({Status}='proposal_pending', {Status}='negotiating', {Status}='verbally_closed'))", options: { fields: ['Status', 'DNC'] } },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001', Status: 'proposal_pending' } }]
});

const findPackages = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'List packages',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_PAKETE, returnAll: true, options: { fields: ['Name'] } },
    credentials: AT
  },
  output: [{ json: { id: 'recPAKET000000002', Name: 'Paket M' } }]
});

const plan = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Plan due follow-ups',
    notes: 'Je Angebot höchstens ein FU pro Lauf; FUn erst nach FUn-1; FU2 nur solange das Angebot gültig ist.',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const flat = (j) => Object.assign({ id: j.id }, j.fields || j);
const rows = (n) => $(n).all().map((i) => flat(i.json)).filter((r) => r.id);
const cfg = {};
rows('Load config').forEach((r) => { if (r['Schlüssel']) cfg[r['Schlüssel']] = String(r['Wert'] == null ? '' : r['Wert']).trim(); });
const tz = cfg.timezone || 'Europe/Berlin';
const gaps = String(cfg.fu_abstand_tage || '2,4,7').split(',').map((x) => Number(x.trim())).filter((n) => n > 0);
if (gaps.length < 3) throw new Error('Config fu_abstand_tage braucht drei Werte, z. B. 2,4,7');
const today = DateTime.now().setZone(tz).startOf('day');
const open = new Set(rows('Find open leads').map((r) => r.id));
const pkgName = {};
rows('List packages').forEach((p) => { pkgName[p.id] = p['Name']; });
const fus = rows('Find follow-ups');
const out = [];
rows('Find sent offers').forEach((o) => {
  const lead = (o['Lead'] || [])[0];
  if (!lead || !open.has(lead)) return;
  const mine = fus.filter((f) => Array.isArray(f['Angebot']) && f['Angebot'].includes(o.id));
  const offerMail = mine.find((f) => f['Stufe'] === 'offer' && f['Status'] === 'sent' && f['Empfänger']);
  if (!offerMail) return;
  const sentAt = DateTime.fromISO(o['Gesendet am']).setZone(tz).startOf('day');
  const daysSince = Math.floor(today.diff(sentAt, 'days').days);
  const validUntil = o['Gültig bis'] ? DateTime.fromISO(o['Gültig bis'], { zone: tz }).startOf('day') : null;
  const done = (s) => mine.some((f) => f['Stufe'] === s && f['Status'] === 'sent');
  let prevOk = true;
  for (let n = 1; n <= 3; n++) {
    const stage = 'fu' + n;
    if (done(stage)) { prevOk = true; continue; }
    if (!prevOk) break;
    if (daysSince < gaps[n - 1]) break;
    if (n === 2 && validUntil && validUntil < today) { prevOk = true; continue; }
    out.push({ json: {
      zweck: stage,
      lead_id: lead,
      empfaenger: offerMail['Empfänger'],
      fu_id: 'fu:' + o['Angebot-ID'] + ':' + stage,
      angebot_id: o.id,
      vars: {
        paket: pkgName[(o['Paket'] || [])[0]] || '',
        gueltig_bis: validUntil ? validUntil.toFormat('dd.MM.yyyy') : '',
      },
    } });
    break;
  }
});
return out;`
    }
  },
  output: [{ json: { zweck: 'fu1', lead_id: 'recTESTLEAD000001', empfaenger: 'anna@example.com', fu_id: 'fu:call-TEST-0001:create_offer:2:fu1', angebot_id: 'recOFFER000000001', vars: { paket: 'Paket M', gueltig_bis: '27.11.2026' } } }]
});

const sendMail = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Send follow-up',
    parameters: { source: 'database', workflowId: MAIL_WF, mode: 'each', options: { waitForSubWorkflow: true } }
  },
  output: [{ json: { ok: true, data: { fu_id: 'fu:call-TEST-0001:create_offer:2:fu1', status: 'sent' } } }]
});

const note = sticky('## Follow-up-Sequenz (FU1–FU3)\nMo–Fr 10:00 (Europe/Berlin). Für Angebote mit Status "sent" und offenem Lead (proposal_pending, negotiating, verbally_closed; kein DNC).\nAbstände aus Config.fu_abstand_tage (Tage nach Versand des Angebots). Versand über "StepSales – Mail senden"; FU-ID = fu:<Angebot-ID>:fuN (kein Doppelversand).\nAntworten der Kunden werden nicht automatisch ausgewertet – Lead-Status von Hand pflegen.', [weekdays10, loadConfig, plan], { color: 4 });

export default workflow('stepsales-follow-up-sequenz', 'StepSales – Follow-up-Sequenz')
  .add(weekdays10)
  .to(loadConfig)
  .to(findOffers)
  .to(findFollowups)
  .to(findLeads)
  .to(findPackages)
  .to(plan)
  .to(sendMail)
  .add(note)
  .group('Daten laden', [loadConfig, findOffers, findFollowups, findLeads, findPackages], { description: 'Config, versendete Angebote, bisherige Follow-ups, offene Leads, Paketnamen.' });
