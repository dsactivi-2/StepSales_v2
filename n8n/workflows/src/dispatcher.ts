import { workflow, node, trigger, ifElse, newCredential, expr, sticky } from '@n8n/workflow-sdk';

const BASE = { __rl: true, mode: 'id', value: 'appLXW1HK6fe213yO', cachedResultName: 'StepSales' };
const T_CONFIG = { __rl: true, mode: 'id', value: 'tblF7wK3OESuyDoFJ', cachedResultName: 'Config' };
const T_LEADS = { __rl: true, mode: 'id', value: 'tblaT64e3mBSfULhx', cachedResultName: 'Leads' };
const T_PAKETE = { __rl: true, mode: 'id', value: 'tblKplkdKcvxC3Lvy', cachedResultName: 'Pakete' };
const T_ANRUFE = { __rl: true, mode: 'id', value: 'tblOX9jhoT5mr49jh', cachedResultName: 'Anrufe' };
const T_TERMINE = { __rl: true, mode: 'id', value: 'tbl4lisj3qqeg8fwV', cachedResultName: 'Termine' };
const AT = { airtableTokenApi: newCredential('StepSales Airtable') };
const ID_MATCH = { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['id'], schema: [{ id: 'id', displayName: 'id', required: false, defaultMatch: true, display: true, type: 'string', readOnly: true, removed: false }] };
const COND = { caseSensitive: true, leftValue: '', typeValidation: 'strict' };

const every2min = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Every 2 min (Mo-Fr 8-18)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '*/2 8-17 * * 1-5' }] }, misfirePolicy: 'skip' } },
  output: [{ json: { timestamp: '2026-11-26T10:00:00.000+01:00' } }]
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
  output: [{ json: { id: 'recaVJAccCixYgmwv', 'Schlüssel': 'dial_enabled', 'Wert': 'true' } }]
});

const findPlaceholders = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find placeholder packages',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_PAKETE, returnAll: false, limit: 1, filterByFormula: 'AND({Aktiv}, {Platzhalter})', options: { fields: ['Paket-ID'] } },
    credentials: AT
  },
  output: [{ json: { id: 'recPAKET000000001', 'Paket-ID': 'MULTI_S' } }]
});

const gate = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Gate',
    notes: 'Kill-Switch, Anrufzeiten, Sperrtage, Testbetrieb. Gibt nichts aus, wenn nicht gewählt werden darf.',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const flat = (j) => Object.assign({ id: j.id }, j.fields || j);
const cfg = {};
$('Load config').all().forEach((i) => { const r = flat(i.json); if (r['Schlüssel']) cfg[r['Schlüssel']] = String(r['Wert'] == null ? '' : r['Wert']).trim(); });
if (cfg.dial_enabled !== 'true') return [];
const tz = cfg.timezone || 'Europe/Berlin';
const now = DateTime.now().setZone(tz);
const days = String(cfg.call_days || '1,2,3,4,5').split(',').map((x) => Number(x.trim()));
if (!days.includes(now.weekday)) return [];
const blocked = String(cfg.sperrtage || '').split(',').map((x) => x.trim()).filter(Boolean);
if (blocked.includes(now.toISODate())) return [];
const hm = (s, d) => { const p = String(s || d).split(':'); return now.set({ hour: Number(p[0]), minute: Number(p[1] || 0), second: 0, millisecond: 0 }); };
const windowStart = hm(cfg.call_window_start, '09:00');
const lastStart = hm(cfg.call_window_end, '17:00').minus({ minutes: 15 });
if (now < windowStart || now > lastStart) return [];
if (!/^[A-Za-z0-9]{8,64}$/.test(cfg.livekit_api_key || '')) throw new Error('Config livekit_api_key fehlt oder ungültig – Dispatcher wählt nicht');
const placeholders = $('Find placeholder packages').all().map((i) => flat(i.json)).filter((r) => r.id).length > 0;
const testOnly = cfg.test_mode !== 'false' || placeholders || !cfg.anzeigenummer;
return [{ json: {
  test_only: testOnly,
  max_attempts: Math.max(1, Number(cfg.max_attempts || 3)),
  max_parallel: Math.max(0, Number(cfg.max_parallel_calls || 1)),
  ab_split: Math.min(100, Math.max(0, Number(cfg.ab_split_gptlive_percent || 50))),
  max_call_seconds: Math.max(60, Number(cfg.max_call_seconds || 600)),
  retry_hours: Math.max(1, Number(cfg.retry_hours || 24)),
  livekit_api_key: cfg.livekit_api_key,
  livekit_http_url: (cfg.livekit_http_url || 'https://stepsalesv2-walghbs5.livekit.cloud').replace(/\\/$/, ''),
} }];`
    }
  },
  output: [{ json: { test_only: true, max_attempts: 3, max_parallel: 1, ab_split: 50, max_call_seconds: 600, retry_hours: 24, livekit_api_key: 'APIxxxxxxxxxxxx', livekit_http_url: 'https://stepsalesv2-walghbs5.livekit.cloud' } }]
});

const findActive = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find active calls',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, returnAll: true, filterByFormula: 'IS_AFTER({Reserviert bis}, NOW())', options: { fields: ['Telefon normalisiert', 'Reserviert bis'] } },
    credentials: AT
  },
  output: [{ json: {} }]
});

const findEligible = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find eligible leads',
    executeOnce: true,
    parameters: {
      resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, returnAll: false, limit: 50,
      filterByFormula: expr("AND({Wählbar}, NOT({DNC}), {Telefon}!='', NOT(OR({Status}='paid', {Status}='onboarding_pending', {Status}='fulfilled', {Status}='closed_lost', {Status}='no_fit', {Status}='dnc')), OR({Versuche}=BLANK(), {Versuche}<{{ $('Gate').first().json.max_attempts }}), OR({Nächster Versuch}=BLANK(), IS_BEFORE({Nächster Versuch}, NOW())), OR({Reserviert bis}=BLANK(), IS_BEFORE({Reserviert bis}, NOW())){{ $('Gate').first().json.test_only ? ', {Testdaten}' : '' }})")
    },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001', Firma: 'TEST Musterbau GmbH', Telefon: '+4930123456789', Status: 'new', Wählbar: true, Testdaten: true, Versuche: 0 } }]
});

const findAppointments = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find due appointments',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_TERMINE, returnAll: true, filterByFormula: "AND({Status}='scheduled', {Durchführung}='agent', IS_AFTER({Start}, DATEADD(NOW(), -30, 'minutes')), IS_BEFORE({Start}, DATEADD(NOW(), 5, 'minutes')))" },
    credentials: AT
  },
  output: [{ json: {} }]
});

const selectCalls = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Select calls',
    notes: 'Freie Leitungen, Priorität (Zweittermin, Rückruf, frische Anzeige), A/B-Zuteilung, Raumname = Call-ID.',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const flat = (j) => Object.assign({ id: j.id }, j.fields || j);
const rows = (n) => $(n).all().map((i) => flat(i.json)).filter((r) => r.id);
const g = $('Gate').first().json;
const E164 = /^[+][1-9][0-9]{6,14}$/;
const norm = (p) => String(p || '').replace(/[^0-9+]/g, '');
const active = rows('Find active calls');
const free = g.max_parallel - active.length;
if (free <= 0) return [];
const busy = new Set(active.map((r) => norm(r['Telefon normalisiert'])));
const terminByLead = {};
rows('Find due appointments').forEach((t) => { const l = (t['Lead'] || [])[0]; if (l && !terminByLead[l]) terminByLead[l] = t; });
const now = DateTime.now();
const out = [];
rows('Find eligible leads').forEach((r) => {
  const phone = norm(r['Telefon']);
  if (!E164.test(phone) || busy.has(phone)) return;
  const t = terminByLead[r.id];
  let type = 'erstgespraech';
  let prio = 3;
  if (t) { type = 'zweittermin'; prio = 0; }
  else if (r['Status'] === 'second_call_scheduled') return;
  else if (r['Nächster Schritt'] === 'callback_agreed' && r['Rückruf am']) { type = 'rueckruf'; prio = 1; }
  else if (!(Number(r['Versuche']) > 0)) prio = 2;
  out.push({ r: r, t: t, type: type, prio: prio, phone: phone });
});
out.sort((a, b) => {
  if (a.prio !== b.prio) return a.prio - b.prio;
  const ad = String(a.r['Anzeigen-Datum'] || ''); const bd = String(b.r['Anzeigen-Datum'] || '');
  if (ad !== bd) return bd.localeCompare(ad);
  return String(a.r['Nächster Versuch'] || '').localeCompare(String(b.r['Nächster Versuch'] || ''));
});
const seen = new Set();
const picked = [];
out.forEach((c) => { if (picked.length < free && !seen.has(c.phone)) { seen.add(c.phone); picked.push(c); } });
return picked.map((c) => {
  const agent = c.r['Agent'] || (Math.random() * 100 < g.ab_split ? 'stepsales-gptlive' : 'stepsales-gemini');
  const room = 'call-' + c.r.id.slice(3) + '-' + now.toMillis().toString(36) + Math.random().toString(36).slice(2, 6);
  return { json: {
    lead_id: c.r.id,
    phone: c.phone,
    room: room,
    agent: agent,
    agent_was_set: !!c.r['Agent'],
    call_type: c.type,
    termin_kontext: c.t ? String(c.t['Kontext für Agent'] || '') : '',
    first_call_id: c.t && Array.isArray(c.t['Erstgespräch']) ? c.t['Erstgespräch'][0] : '',
    reserve_until: now.plus({ seconds: g.max_call_seconds + 600 }).toUTC().toISO(),
    attempts: (Number(c.r['Versuche']) || 0) + 1,
  } };
});`
    }
  },
  output: [{ json: { lead_id: 'recTESTLEAD000001', phone: '+4930123456789', room: 'call-TESTLEAD000001-abc123', agent: 'stepsales-gemini', agent_was_set: false, call_type: 'erstgespraech', termin_kontext: '', first_call_id: '', reserve_until: '2026-11-26T09:20:00.000Z', attempts: 1 } }]
});

const reread = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Re-read lead',
    parameters: { resource: 'record', operation: 'get', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, id: expr('{{ $json.lead_id }}') },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001', Telefon: '+4930123456789', Wählbar: true, Testdaten: true, Versuche: 0 } }]
});

const verify = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Verify and reserve',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const g = $('Gate').first().json;
const now = DateTime.now();
const out = [];
$input.all().forEach((item, i) => {
  const r = Object.assign({ id: item.json.id }, item.json.fields || item.json);
  const sel = $('Select calls').itemMatching(i).json;
  const reservedUntil = r['Reserviert bis'] ? DateTime.fromISO(r['Reserviert bis']) : null;
  const okTest = !g.test_only || r['Testdaten'] === true;
  const ok = r.id === sel.lead_id
    && r['Wählbar'] === true
    && r['DNC'] !== true
    && okTest
    && String(r['Telefon'] || '').replace(/[^0-9+]/g, '') === sel.phone
    && (!reservedUntil || reservedUntil < now)
    && (Number(r['Versuche']) || 0) + 1 === sel.attempts;
  if (!ok) return;
  const u = {
    id: r.id,
    'Reserviert bis': sel.reserve_until,
    'Letzter Versuch': now.toUTC().toISO(),
    'Versuche': sel.attempts,
    'Nächster Versuch': now.plus({ hours: g.retry_hours }).toUTC().toISO(),
  };
  if (!sel.agent_was_set) u['Agent'] = sel.agent;
  out.push({ json: u, pairedItem: { item: i } });
});
return out;`
    }
  },
  output: [{ json: { id: 'recTESTLEAD000001', 'Reserviert bis': '2026-11-26T09:20:00.000Z', Versuche: 1 } }]
});

const reserve = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Reserve lead',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, columns: ID_MATCH, options: { typecast: true } },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001' } }]
});

const readBack = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Read reservation back',
    parameters: { resource: 'record', operation: 'get', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, id: expr("{{ $('Select calls').item.json.lead_id }}") },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001', 'Reserviert bis': '2026-11-26T09:20:00.000Z', Versuche: 1, Agent: 'stepsales-gemini', Firma: 'TEST Musterbau GmbH', Testdaten: true } }]
});

const confirmed = ifElse({
  version: 2.2,
  config: {
    name: 'Reservation confirmed?',
    parameters: {
      conditions: {
        options: COND,
        conditions: [
          { leftValue: expr("{{ Math.abs(DateTime.fromISO(String(($json.fields || $json)['Reserviert bis'] || '1970-01-01')).toMillis() - DateTime.fromISO($('Select calls').item.json.reserve_until).toMillis()) < 60000 && Number(($json.fields || $json)['Versuche']) === $('Select calls').item.json.attempts && ($json.fields || $json)['Agent'] === $('Select calls').item.json.agent }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }
        ],
        combinator: 'and'
      }
    }
  }
});

const findFirstCall = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find first calls',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_ANRUFE, returnAll: true, filterByFormula: expr("OR(RECORD_ID()='none'{{ $('Select calls').all().map(i => String(i.json.first_call_id || '').replace(/[^A-Za-z0-9]/g, '')).filter(Boolean).map(id => \", RECORD_ID()='\" + id + \"'\").join('') }})"), options: { fields: ['Zusammenfassung'] } },
    credentials: AT
  },
  output: [{ json: {} }]
});

const buildDispatch = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build dispatch',
    notes: 'Metadaten nach docs/contracts/dispatch-metadata.md',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const flat = (j) => Object.assign({ id: j.id }, j.fields || j);
const MODEL = { 'stepsales-gptlive': 'openai/gpt-live-1', 'stepsales-gemini': 'google/gemini-3.8-live' };
const sels = $('Select calls').all().map((i) => i.json);
const firsts = {};
$('Find first calls').all().map((i) => flat(i.json)).filter((r) => r.id).forEach((r) => { firsts[r.id] = String(r['Zusammenfassung'] || ''); });
return $('Reservation confirmed?').all().map((item) => {
  const lead = flat(item.json);
  const sel = sels.find((x) => x.lead_id === lead.id);
  if (!sel) throw new Error('Auswahl zu Lead ' + lead.id + ' fehlt');
  let previous = null;
  if (sel.call_type === 'zweittermin') {
    const first = sel.first_call_id ? firsts[sel.first_call_id] : '';
    previous = [sel.termin_kontext ? 'Thema: ' + sel.termin_kontext : '', first ? 'Erstgespräch: ' + first : ''].filter(Boolean).join('\\n') || 'Zweittermin vereinbart; kein Gesprächsstand hinterlegt.';
  }
  const meta = {
    lead_id: sel.lead_id,
    phone_number: sel.phone,
    call_id: sel.room,
    call_type: sel.call_type,
    lead: {
      firma: lead['Firma'] || '',
      ansprechpartner: lead['Ansprechpartner'] || null,
      rolle: lead['Rolle'] || null,
      anzeigen_titel: lead['Anzeigen-Titel'] || null,
      quelle_portal: lead['Quelle Portal'] || null,
      anzeigen_datum: lead['Anzeigen-Datum'] || null,
    },
    previous_summary: previous,
    test: lead['Testdaten'] === true,
  };
  return { json: {
    'Call-ID': sel.room,
    'Agent': sel.agent,
    'Modell': MODEL[sel.agent],
    'Typ': sel.call_type,
    'Start': DateTime.now().toUTC().toISO(),
    'Testdaten': lead['Testdaten'] === true,
    'Lead': [sel.lead_id],
    _metadata: JSON.stringify(meta),
  } };
});`
    }
  },
  output: [{ json: { 'Call-ID': 'call-TESTLEAD000001-abc123', Agent: 'stepsales-gemini', Modell: 'google/gemini-3.8-live', Typ: 'erstgespraech', Testdaten: true, Lead: ['recTESTLEAD000001'], _metadata: '{}' } }]
});

const createCall = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Create call record',
    parameters: { resource: 'record', operation: 'create', authentication: 'airtableTokenApi', base: BASE, table: T_ANRUFE, columns: { mappingMode: 'autoMapInputData', value: {} }, options: { typecast: true, ignoreFields: '_metadata' } },
    credentials: AT
  },
  output: [{ json: { id: 'recCALL0000000001' } }]
});

const signToken = node({
  type: 'n8n-nodes-base.jwt',
  version: 1,
  config: {
    name: 'Create LiveKit token',
    notes: 'HS256, 5 Minuten. iss = Config.livekit_api_key (Key-ID, kein Geheimnis); das API-Secret liegt nur in der JWT-Credential.',
    parameters: {
      operation: 'sign',
      useJson: true,
      claimsJson: expr("{{ ({ iss: $('Gate').first().json.livekit_api_key, sub: 'stepsales-n8n-dispatcher', nbf: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 300, video: { room: $('Build dispatch').item.json['Call-ID'], roomAdmin: true, roomCreate: true } }) }}"),
      options: { algorithm: 'HS256' }
    },
    credentials: { jwtAuth: newCredential('StepSales LiveKit (Dispatcher)') }
  },
  output: [{ json: { token: 'eyJ.x.y' } }]
});

const dispatch = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Dispatch agent',
    onError: 'continueErrorOutput',
    notes: 'AgentDispatchService/CreateDispatch legt den Raum an und schickt den Agenten hinein. Der Agent wählt selbst (CreateSIPParticipant, AMD).',
    parameters: {
      method: 'POST',
      url: expr("{{ $('Gate').first().json.livekit_http_url }}/twirp/livekit.AgentDispatchService/CreateDispatch"),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $json.token }}') }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ agent_name: $('Build dispatch').item.json.Agent, room: $('Build dispatch').item.json['Call-ID'], metadata: $('Build dispatch').item.json._metadata }) }}"),
      options: { timeout: 15000 }
    }
  },
  output: [{ json: { id: 'AD_xxxx', agent_name: 'stepsales-gemini', room: 'call-TESTLEAD000001-abc123' } }]
});

const failurePayload = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Dispatch failed: lead payload',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `return $input.all().map((item, i) => {
  const b = $('Build dispatch').itemMatching(i).json;
  const err = item.json.error;
  const msg = String((err && (err.message || err.description)) || err || 'unbekannt').slice(0, 300);
  return { json: {
    id: b['Lead'][0],
    'Reserviert bis': null,
    'Wählbar': false,
    'Fehlernotiz': DateTime.now().setZone('Europe/Berlin').toFormat('dd.MM.yyyy HH:mm') + ' Dispatch fehlgeschlagen (' + b['Call-ID'] + '): ' + msg,
    _msg: msg,
  }, pairedItem: { item: i } };
});`
    }
  },
  output: [{ json: { id: 'recTESTLEAD000001', 'Reserviert bis': null, Wählbar: false, Fehlernotiz: 'Dispatch fehlgeschlagen', _msg: '401' } }]
});

const markFailed = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Dispatch failed: mark lead',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, columns: ID_MATCH, options: { typecast: true, ignoreFields: '_msg' } },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001' } }]
});

const stopRun = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Dispatch failed: stop dialing',
    notes: 'Wirft absichtlich einen Fehler: der Error-Workflow "StepSales – Fehler-Stopp" setzt dial_enabled=false (fail-closed).',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `throw new Error('Dispatch fehlgeschlagen: ' + $('Dispatch failed: lead payload').first().json._msg);`
    }
  }
});

const note = sticky('## StepSales – Dispatcher\nAlle 2 Min. (Europe/Berlin). Wählt nur bei Config.dial_enabled = true, in den Anrufzeiten, außerhalb Config.sperrtage.\nTestbetrieb (test_mode, Platzhalter-Paket oder leere anzeigenummer): nur Leads mit Testdaten.\nReservierung fail-closed: frisch lesen, prüfen, reservieren, zurücklesen.\nA/B: Leads.Agent wird beim ersten Wählen gesetzt und nie geändert.\nn8n dispatcht nur; der Agent wählt selbst. Jeder Dispatch-Fehler stoppt das Wählen (Fehler-Stopp).\nRunbook: docs/runbooks/kill-switch.md', [every2min, loadConfig, gate], { color: 4 });

export default workflow('stepsales-dispatcher', 'StepSales – Dispatcher')
  .add(every2min)
  .to(loadConfig)
  .to(findPlaceholders)
  .to(gate)
  .to(findActive)
  .to(findEligible)
  .to(findAppointments)
  .to(selectCalls)
  .to(reread)
  .to(verify)
  .to(reserve)
  .to(readBack)
  .to(confirmed.onTrue(findFirstCall.to(buildDispatch.to(createCall.to(signToken.to(dispatch))))))
  .add(dispatch.onError(failurePayload.to(markFailed.to(stopRun))))
  .add(note)
  .group('Freigabe', [loadConfig, findPlaceholders, gate], { description: 'Kill-Switch, Anrufzeiten, Sperrtage, Testbetrieb.' })
  .group('Auswahl', [findActive, findEligible, findAppointments, selectCalls], { description: 'Freie Leitungen, wählbare Leads, fällige Zweittermine, Priorität und A/B.' })
  .group('Reservierung', [reread, verify, reserve, readBack, confirmed], { description: 'Frisch lesen, erneut prüfen, reservieren, zurücklesen (fail-closed).' })
  .group('Dispatch', [findFirstCall, buildDispatch, createCall, signToken, dispatch], { description: 'Metadaten bauen, Anruf anlegen, kurzlebiges Token, Agent in den Raum schicken.' })
  .group('Bei Fehler', [failurePayload, markFailed, stopRun], { description: 'Lead sperren und mit Fehler enden: Fehler-Stopp schaltet das Wählen ab.' });
