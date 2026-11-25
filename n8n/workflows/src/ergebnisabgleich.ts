import { workflow, node, trigger, newCredential, expr, sticky } from '@n8n/workflow-sdk';

const BASE = { __rl: true, mode: 'id', value: 'appLXW1HK6fe213yO', cachedResultName: 'StepSales' };
const T_CONFIG = { __rl: true, mode: 'id', value: 'tblF7wK3OESuyDoFJ', cachedResultName: 'Config' };
const T_LEADS = { __rl: true, mode: 'id', value: 'tblaT64e3mBSfULhx', cachedResultName: 'Leads' };
const T_ANRUFE = { __rl: true, mode: 'id', value: 'tblOX9jhoT5mr49jh', cachedResultName: 'Anrufe' };
const T_TERMINE = { __rl: true, mode: 'id', value: 'tbl4lisj3qqeg8fwV', cachedResultName: 'Termine' };
const AT = { airtableTokenApi: newCredential('StepSales Airtable') };
const ID_MATCH = { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['id'], schema: [{ id: 'id', displayName: 'id', required: false, defaultMatch: true, display: true, type: 'string', readOnly: true, removed: false }] };

const every10min = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Every 10 min (Mo-Fr 8-20)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '*/10 8-19 * * 1-5' }] }, misfirePolicy: 'skip' } },
  output: [{ json: {} }]
});

const loadConfig = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Load config',
    executeOnce: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_CONFIG, returnAll: true, filterByFormula: "{Schlüssel}='max_call_seconds'", options: { fields: ['Schlüssel', 'Wert'] } },
    credentials: AT
  },
  output: [{ json: { id: 'recnFTqCvdMi5A9Ab', 'Schlüssel': 'max_call_seconds', 'Wert': '600' } }]
});

const findStale = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find calls without result',
    executeOnce: true,
    parameters: {
      resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_ANRUFE, returnAll: true,
      filterByFormula: expr("AND({Ergebnis}=BLANK(), {Start}!=BLANK(), IS_BEFORE({Start}, DATEADD(NOW(), -{{ Math.ceil((Number((($json.fields || $json)['Wert'])) || 600) / 60) + 15 }}, 'minutes')))"),
      options: { fields: ['Call-ID', 'Start', 'Lead', 'Agent'] }
    },
    credentials: AT
  },
  output: [{ json: { id: 'recCALL0000000001', 'Call-ID': 'call-TEST-0001', Start: '2026-11-26T09:00:00.000Z', Lead: ['recTESTLEAD000001'] } }]
});

const buildCalls = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build call updates',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const now = DateTime.now();
return $input.all().map((i) => Object.assign({ id: i.json.id }, i.json.fields || i.json)).filter((r) => r.id).map((r) => ({ json: {
  id: r.id,
  'Ergebnis': 'failed',
  'Zusammenfassung': 'Kein Ergebnis vom Agenten gemeldet – vom Ergebnisabgleich gesetzt (' + now.setZone('Europe/Berlin').toFormat('dd.MM.yyyy HH:mm') + ')',
  'Konfidenz': 'low',
} }));`
    }
  },
  output: [{ json: { id: 'recCALL0000000001', Ergebnis: 'failed', Zusammenfassung: 'Kein Ergebnis', Konfidenz: 'low' } }]
});

const updateCalls = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Mark calls failed',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_ANRUFE, columns: ID_MATCH, options: { typecast: true } },
    credentials: AT
  },
  output: [{ json: { id: 'recCALL0000000001' } }]
});

const buildLeads = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build lead updates',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const when = DateTime.now().setZone('Europe/Berlin').toFormat('dd.MM.yyyy HH:mm');
const seen = new Set();
const out = [];
$('Find calls without result').all().forEach((i) => {
  const r = Object.assign({ id: i.json.id }, i.json.fields || i.json);
  const lead = Array.isArray(r['Lead']) ? r['Lead'][0] : null;
  if (!lead || seen.has(lead)) return;
  seen.add(lead);
  out.push({ json: { id: lead, 'Reserviert bis': null, 'Wählbar': false, 'Fehlernotiz': when + ' Anruf ' + (r['Call-ID'] || '') + ' ohne Ergebnis – bitte prüfen' } });
});
return out;`
    }
  },
  output: [{ json: { id: 'recTESTLEAD000001', 'Reserviert bis': null, Wählbar: false, Fehlernotiz: 'ohne Ergebnis' } }]
});

const updateLeads = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Lock leads for review',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, columns: ID_MATCH, options: { typecast: true } },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001' } }]
});

const findMissed = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find missed appointments',
    executeOnce: true,
    parameters: {
      resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_TERMINE, returnAll: true,
      filterByFormula: "AND({Status}='scheduled', {Durchführung}='agent', IS_BEFORE({Start}, DATEADD(NOW(), -45, 'minutes')))",
      options: { fields: ['Termin-ID', 'Start', 'Lead'] }
    },
    credentials: AT
  },
  output: [{ json: { id: 'recTERMIN00000001', 'Termin-ID': 'call-TEST-0001:schedule_second_call:4', Start: '2026-11-26T09:00:00.000Z', Lead: ['recTESTLEAD000001'] } }]
});

const findSecondCalls = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find second calls',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_ANRUFE, returnAll: true,
      filterByFormula: "AND({Typ}='zweittermin', IS_AFTER({Start}, DATEADD(NOW(), -3, 'days')))",
      options: { fields: ['Lead', 'Start', 'Ergebnis'] }
    },
    credentials: AT
  },
  output: [{ json: {} }]
});

const buildMissed = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build missed updates',
    notes: 'Zweittermin 45 Min. nach Beginn: mit geführtem Gespräch → done; sonst rescheduled und Lead zur Prüfung sperren.',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const flat = (j) => Object.assign({ id: j.id }, j.fields || j);
const calls = $('Find second calls').all().map((i) => flat(i.json)).filter((r) => r.id);
return $('Find missed appointments').all().map((i) => flat(i.json)).filter((r) => r.id).map((t) => {
  const lead = (t['Lead'] || [])[0];
  const start = DateTime.fromISO(t['Start']);
  const called = calls.some((c) => (c['Lead'] || [])[0] === lead && c['Start'] && DateTime.fromISO(c['Start']) >= start.minus({ minutes: 30 }) && !!c['Ergebnis'] && !['no_answer', 'voicemail', 'failed'].includes(c['Ergebnis']));
  return { json: { id: t.id, 'Status': called ? 'done' : 'rescheduled' } };
});`
    }
  },
  output: [{ json: { id: 'recTERMIN00000001', Status: 'rescheduled' } }]
});

const updateMissed = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Mark appointments rescheduled',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_TERMINE, columns: ID_MATCH, options: { typecast: true } },
    credentials: AT
  },
  output: [{ json: { id: 'recTERMIN00000001' } }]
});

const buildMissedLeads = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build missed lead updates',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const seen = new Set();
const out = [];
const missed = new Set($('Build missed updates').all().filter((i) => i.json['Status'] === 'rescheduled').map((i) => i.json.id));
$('Find missed appointments').all().forEach((i) => {
  const r = Object.assign({ id: i.json.id }, i.json.fields || i.json);
  if (!missed.has(r.id)) return;
  const lead = Array.isArray(r['Lead']) ? r['Lead'][0] : null;
  if (!lead || seen.has(lead)) return;
  seen.add(lead);
  const when = r['Start'] ? DateTime.fromISO(r['Start']).setZone('Europe/Berlin').toFormat('dd.MM.yyyy HH:mm') : '?';
  out.push({ json: { id: lead, 'Wählbar': false, 'Fehlernotiz': 'Zweittermin am ' + when + ' nicht gewählt – neu vereinbaren' } });
});
return out;`
    }
  },
  output: [{ json: { id: 'recTESTLEAD000001', Wählbar: false, Fehlernotiz: 'Zweittermin verpasst' } }]
});

const updateMissedLeads = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Lock leads with missed appointment',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, columns: ID_MATCH, options: { typecast: true } },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001' } }]
});

const note = sticky('## Ergebnisabgleich\nAlle 10 Min.: Anrufe ohne Ergebnis, deren Start länger als max_call_seconds + 15 Min. her ist (Agent abgestürzt, Fallback fehlgeschlagen).\nAnruf → failed; Lead → Reservierung frei, Wählbar aus, Fehlernotiz. Kein automatischer Neuversuch (fail-closed).\nZweittermine (Durchführung agent), 45 Min. nach Beginn noch scheduled: Gespräch geführt → done, sonst rescheduled + Lead gesperrt.', [every10min, loadConfig, findStale], { color: 4 });

export default workflow('stepsales-ergebnisabgleich', 'StepSales – Ergebnisabgleich')
  .add(every10min)
  .to(loadConfig)
  .to(findStale)
  .to(buildCalls)
  .to(updateCalls)
  .to(buildLeads)
  .to(updateLeads)
  .add(every10min)
  .to(findMissed.to(findSecondCalls.to(buildMissed.to(updateMissed.to(buildMissedLeads.to(updateMissedLeads))))))
  .add(note)
  .group('Abgleich', [buildCalls, updateCalls, buildLeads, updateLeads], { description: 'Hängende Anrufe auf failed, Leads zur Prüfung sperren.' })
  .group('Verpasste Zweittermine', [findMissed, findSecondCalls, buildMissed, updateMissed, buildMissedLeads, updateMissedLeads], { description: 'Zweittermine 45 Min. nach Beginn: Gespräch → done, sonst rescheduled + Lead sperren.' });
