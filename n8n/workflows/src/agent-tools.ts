import { workflow, node, trigger, switchCase, ifElse, newCredential, expr, sticky } from '@n8n/workflow-sdk';

const BASE = { __rl: true, mode: 'id', value: 'appLXW1HK6fe213yO', cachedResultName: 'StepSales' };
const T_CONFIG = { __rl: true, mode: 'id', value: 'tblF7wK3OESuyDoFJ', cachedResultName: 'Config' };
const T_LEADS = { __rl: true, mode: 'id', value: 'tblaT64e3mBSfULhx', cachedResultName: 'Leads' };
const T_PAKETE = { __rl: true, mode: 'id', value: 'tblKplkdKcvxC3Lvy', cachedResultName: 'Pakete' };
const T_ANRUFE = { __rl: true, mode: 'id', value: 'tblOX9jhoT5mr49jh', cachedResultName: 'Anrufe' };
const T_ANGEBOTE = { __rl: true, mode: 'id', value: 'tblysTSwcnTCjcd9p', cachedResultName: 'Angebote' };
const T_TERMINE = { __rl: true, mode: 'id', value: 'tbl4lisj3qqeg8fwV', cachedResultName: 'Termine' };
const MAIL_WF = { __rl: true, mode: 'id', value: '9uPWJkD0fqWwTC2R', cachedResultName: 'StepSales – Mail senden' };
const AT = { airtableTokenApi: newCredential('StepSales Airtable') };
const ID_MATCH = { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['id'], schema: [{ id: 'id', displayName: 'id', required: false, defaultMatch: true, display: true, type: 'string', readOnly: true, removed: false }] };
const AUTO = { mappingMode: 'autoMapInputData', value: {} };
const COND = { caseSensitive: true, leftValue: '', typeValidation: 'strict' };

const PRE = `const flat = (j) => Object.assign({ id: j.id }, j.fields || j);
const rows = (name) => $(name).all().map((i) => flat(i.json)).filter((r) => r.id);
const req = $('Validate request').first().json;
const a = req.args || {};
const cfg = {};
$('Load config').all().forEach((i) => { const r = flat(i.json); if (r['Schlüssel']) cfg[r['Schlüssel']] = String(r['Wert'] == null ? '' : r['Wert']).trim(); });
const RANK = ['new', 'reached', 'qualified', 'proposal_pending', 'second_call_scheduled', 'negotiating', 'verbally_closed', 'payment_pending', 'paid', 'onboarding_pending', 'fulfilled'];
const LOCKED = ['paid', 'onboarding_pending', 'fulfilled'];
const TERMINAL = ['closed_lost', 'no_fit', 'dnc'];
const raise = (cur, target) => {
  if (!target || LOCKED.includes(cur)) return null;
  if (TERMINAL.includes(target)) return cur === target ? null : target;
  if (TERMINAL.includes(cur)) return null;
  return RANK.indexOf(target) > RANK.indexOf(cur || 'new') ? target : null;
};
const ok = (data) => ({ ok: true, data: data });
const fail = (code, message) => ({ ok: false, error: { code: code, message: message } });
const tz = cfg.timezone || 'Europe/Berlin';
`;

const webhookTrigger = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.2,
  config: {
    name: 'Tool call',
    parameters: {
      httpMethod: 'POST',
      path: 'stepsales-tools',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {}
    },
    credentials: { httpHeaderAuth: newCredential('StepSales Tools Secret') }
  },
  output: [{ json: { headers: { 'idempotency-key': 'call-TEST-0001:get_packages:1' }, body: { tool: 'get_packages', call_id: 'call-TEST-0001', lead_id: 'recTESTLEAD000001', agent: 'stepsales-gemini', seq: 1, args: {} } } }]
});

const validate = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Validate request',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const j = $input.first().json;
const b = j.body || {};
const h = j.headers || {};
const TOOLS = ['get_packages', 'qualify_lead', 'create_offer', 'send_followup', 'schedule_second_call', 'send_payment_link', 'log_call_outcome'];
const bad = (m) => [{ json: { valid: false, response: { ok: false, error: { code: 'bad_request', message: m } } } }];
if (!TOOLS.includes(b.tool)) return bad('unbekanntes tool');
if (!/^rec[A-Za-z0-9]{14}$/.test(String(b.lead_id || ''))) return bad('lead_id ungültig');
if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(b.call_id || ''))) return bad('call_id ungültig');
if (!['stepsales-gptlive', 'stepsales-gemini'].includes(b.agent)) return bad('agent ungültig');
if (!Number.isInteger(b.seq) || b.seq < 1) return bad('seq ungültig');
const key = String(h['idempotency-key'] || '');
if (key !== b.call_id + ':' + b.tool + ':' + b.seq) return bad('Idempotency-Key passt nicht');
if (!b.args || typeof b.args !== 'object' || Array.isArray(b.args)) return bad('args muss ein Objekt sein');
return [{ json: { valid: true, tool: b.tool, call_id: b.call_id, lead_id: b.lead_id, agent: b.agent, seq: b.seq, key: key, args: b.args } }];`
    }
  },
  output: [{ json: { valid: true, tool: 'get_packages', call_id: 'call-TEST-0001', lead_id: 'recTESTLEAD000001', agent: 'stepsales-gemini', seq: 1, key: 'call-TEST-0001:get_packages:1', args: {} } }]
});

const isValid = ifElse({
  version: 2.2,
  config: {
    name: 'Request valid?',
    parameters: {
      conditions: { options: COND, conditions: [{ leftValue: expr('{{ $json.valid }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }
    }
  }
});

const respondBad = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond 400',
    parameters: { respondWith: 'json', responseBody: expr('{{ $json.response }}'), options: { responseCode: 400 } }
  }
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
  output: [{ json: { id: 'recCONFIG00000001', 'Schlüssel': 'default_max_rabatt_prozent', 'Wert': '10' } }]
});

const getLead = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Get lead',
    executeOnce: true,
    parameters: { resource: 'record', operation: 'get', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, id: expr("{{ $('Validate request').first().json.lead_id }}") },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001', Firma: 'TEST Musterbau GmbH', Ansprechpartner: 'Anna Test', Status: 'new', 'E-Mail': 'anna@example.com', Telefon: '+4930123456789', Testdaten: true, Versuche: 1 } }]
});

const findCall = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find call',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_ANRUFE, returnAll: false, limit: 1, filterByFormula: expr("{Call-ID}='{{ $('Validate request').first().json.call_id }}'") },
    credentials: AT
  },
  output: [{ json: { id: 'recCALL0000000001', 'Call-ID': 'call-TEST-0001', Lead: ['recTESTLEAD000001'], Start: '2026-11-25T09:00:00.000Z' } }]
});

const routeTool = switchCase({
  version: 3.5,
  config: {
    name: 'Route by tool',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { renameOutput: true, outputKey: 'get_packages', conditions: { options: COND, conditions: [{ leftValue: expr("{{ $('Validate request').first().json.tool }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'get_packages' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'qualify_lead', conditions: { options: COND, conditions: [{ leftValue: expr("{{ $('Validate request').first().json.tool }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'qualify_lead' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'create_offer', conditions: { options: COND, conditions: [{ leftValue: expr("{{ $('Validate request').first().json.tool }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'create_offer' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'send_followup', conditions: { options: COND, conditions: [{ leftValue: expr("{{ $('Validate request').first().json.tool }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'send_followup' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'schedule_second_call', conditions: { options: COND, conditions: [{ leftValue: expr("{{ $('Validate request').first().json.tool }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'schedule_second_call' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'send_payment_link', conditions: { options: COND, conditions: [{ leftValue: expr("{{ $('Validate request').first().json.tool }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'send_payment_link' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'log_call_outcome', conditions: { options: COND, conditions: [{ leftValue: expr("{{ $('Validate request').first().json.tool }}"), operator: { type: 'string', operation: 'equals' }, rightValue: 'log_call_outcome' }], combinator: 'and' } }
        ]
      }
    }
  }
});

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond',
    parameters: { respondWith: 'json', responseBody: expr('{{ $json }}'), options: { responseCode: 200 } }
  }
});

const listPackages = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'List active packages',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_PAKETE, returnAll: true, filterByFormula: '{Aktiv}', sort: { property: [{ field: 'Reihenfolge', direction: 'asc' }] } },
    credentials: AT
  },
  output: [{ json: { id: 'recPAKET000000001', 'Paket-ID': 'MULTI_M', Name: 'Paket M', 'Listenpreis netto': 1490, 'Max Rabatt': 0.1, Aktiv: true, Platzhalter: true } }]
});

const packagesResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Packages result',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: PRE + `const def = Number(cfg.default_max_rabatt_prozent || 10);
const packages = rows('List active packages').map((r) => ({
  package_id: r['Paket-ID'],
  name: r['Name'],
  leistungen: r['Leistungen'] || '',
  portale: r['Portale'] || '',
  laufzeit_tage: r['Laufzeit Tage'] == null ? null : r['Laufzeit Tage'],
  listenpreis_eur_netto: r['Listenpreis netto'],
  max_rabatt_prozent: r['Max Rabatt'] == null ? def : Math.round(r['Max Rabatt'] * 1000) / 10,
  empfehlen_wenn: r['Empfehlen wenn'] || '',
  platzhalter: r['Platzhalter'] === true,
}));
if (!packages.length) return [{ json: fail('no_packages', 'Keine aktiven Pakete') }];
return [{ json: ok({ packages: packages }) }];`
    }
  },
  output: [{ json: { ok: true, data: { packages: [] } } }]
});

const qualifyPrepare = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Qualify: compute',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: PRE + `const lead = flat($('Get lead').first().json);
const u = { id: lead.id };
const has = (k) => a[k] !== undefined && a[k] !== null && a[k] !== '';
const LV = ['high', 'medium', 'low'];
if (has('active_hiring')) u['Aktiv am Rekrutieren'] = a.active_hiring === true;
if (Array.isArray(a.roles_hiring_for) && a.roles_hiring_for.length) u['Offene Rollen'] = a.roles_hiring_for.map(String).join('\\n');
if (Number.isInteger(a.number_of_roles) && a.number_of_roles >= 0) u['Anzahl Rollen'] = a.number_of_roles;
if (LV.includes(a.urgency)) u['Dringlichkeit'] = a.urgency;
if (has('timeline')) u['Zeitrahmen'] = String(a.timeline).slice(0, 200);
if (['open', 'approved', 'unclear', 'no_budget'].includes(a.budget_signal)) u['Budget-Signal'] = a.budget_signal;
if (LV.includes(a.interest_level)) u['Interesse'] = a.interest_level;
if (['decision_maker', 'influencer', 'unknown'].includes(a.decision_role)) u['Entscheider'] = a.decision_role;
if (has('contact_name')) u['Ansprechpartner'] = String(a.contact_name).slice(0, 120);
if (has('contact_role')) u['Rolle'] = String(a.contact_role).slice(0, 120);
const m = Object.assign({}, lead, u);
let score = 0;
if (m['Aktiv am Rekrutieren'] === true) score += 20;
score += ({ high: 25, medium: 15, low: 5 })[m['Dringlichkeit']] || 0;
score += ({ high: 25, medium: 15, low: 5 })[m['Interesse']] || 0;
if (m['E-Mail']) score += 10;
if (m['Telefon']) score += 5;
const roleCount = Math.max(String(m['Offene Rollen'] || '').split('\\n').filter((x) => x.trim()).length, Number(m['Anzahl Rollen']) || 0);
score += Math.min(15, 5 * roleCount);
if (['open', 'approved'].includes(m['Budget-Signal'])) score += 10;
const tl = String(m['Zeitrahmen'] || '').toLowerCase();
if (['sofort', 'immediate', '1 week', '2 week', 'woche', 'asap'].some((t) => tl.includes(t))) score += 10;
else if (['month', 'monat', '30'].some((t) => tl.includes(t))) score += 5;
score = Math.max(0, Math.min(100, score));
u['Score'] = score;
const fromScore = score >= 70 ? 'qualified' : 'reached';
const next = raise(lead['Status'], fromScore);
if (next) u['Status'] = next;
const ignored = has('current_channels') ? ['current_channels'] : [];
return [{ json: Object.assign(u, { _response: ok({ lead_id: lead.id, score: score, status: next || lead['Status'] || 'new', ignored: ignored }) }) }];`
    }
  },
  output: [{ json: { id: 'recTESTLEAD000001', Score: 55, Status: 'reached', _response: { ok: true, data: { lead_id: 'recTESTLEAD000001', score: 55, status: 'reached' } } } }]
});

const qualifyUpdate = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Qualify: update lead',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, columns: ID_MATCH, options: { typecast: true, ignoreFields: '_response' } },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001' } }]
});

const qualifyResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Qualify result', parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: $('Qualify: compute').first().json._response }];` } },
  output: [{ json: { ok: true, data: { lead_id: 'recTESTLEAD000001', score: 55, status: 'reached' } } }]
});

const offerFindExisting = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Offer: find existing',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_ANGEBOTE, returnAll: false, limit: 1, filterByFormula: expr("{Angebot-ID}='{{ $('Validate request').first().json.key }}'") },
    credentials: AT
  },
  output: [{ json: {} }]
});

const offerFindPackage = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Offer: find package',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_PAKETE, returnAll: false, limit: 1, filterByFormula: expr("AND({Paket-ID}='{{ String($('Validate request').first().json.args.package_id || '').replace(/[^A-Za-z0-9_-]/g, '') }}', {Aktiv})") },
    credentials: AT
  },
  output: [{ json: { id: 'recPAKET000000001', 'Paket-ID': 'MULTI_M', Name: 'Paket M', 'Listenpreis netto': 1490, 'Max Rabatt': 0.1, Aktiv: true } }]
});

const offerDecide = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Offer: calculate',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: PRE + `const lead = flat($('Get lead').first().json);
const call = rows('Find call')[0];
const existing = rows('Offer: find existing')[0];
const pkg = rows('Offer: find package')[0];
const reject = (c, m) => [{ json: { _action: 'reject', _response: fail(c, m) } }];
if (existing) {
  const d = Math.round((existing['Rabatt'] || 0) * 1000) / 10;
  return [{ json: { _action: 'done', _response: ok({ offer_id: existing['Angebot-ID'], package_name: pkg ? pkg['Name'] : '', list_price: existing['Listenpreis'], discount_percent: d, final_price: existing['Endpreis'], valid_until: existing['Gültig bis'], duplicate: true }) } }];
}
if (call && Array.isArray(call['Lead']) && call['Lead'].length && call['Lead'][0] !== lead.id) return reject('call_lead_mismatch', 'Anruf gehört zu einem anderen Lead');
if (lead['DNC'] === true) return reject('lead_dnc', 'Lead steht auf DNC');
if (!pkg) return reject('package_not_found', 'Paket nicht gefunden oder nicht aktiv');
const list = Number(pkg['Listenpreis netto']);
if (!(list > 0)) return reject('price_missing', 'Paket hat keinen Listenpreis');
const d = a.discount_percent == null ? 0 : Number(a.discount_percent);
if (!Number.isFinite(d) || d < 0) return reject('discount_invalid', 'Rabatt ungültig');
const max = pkg['Max Rabatt'] == null ? Number(cfg.default_max_rabatt_prozent || 10) : Math.round(pkg['Max Rabatt'] * 1000) / 10;
if (d > max) return reject('discount_too_high', 'Rabatt über ' + max + ' % ist nicht freigegeben');
const reason = String(a.discount_reason || '').trim();
if (d > 0 && !reason) return reject('discount_reason_missing', 'Begründung für Rabatt fehlt');
const final = Math.round(list * (100 - d)) / 100;
const days = Number(cfg.angebot_gueltig_tage || 7);
const validUntil = DateTime.now().setZone(tz).plus({ days: days }).toISODate();
const rec = {
  'Angebot-ID': req.key,
  'Listenpreis': list,
  'Rabatt': d / 100,
  'Rabattgrund': d > 0 ? reason.slice(0, 200) : '',
  'Endpreis': final,
  'Gültig bis': validUntil,
  'Status': 'draft',
  'Testdaten': lead['Testdaten'] === true,
  'Lead': [lead.id],
  'Paket': [pkg.id],
};
if (call) rec['Anruf'] = [call.id];
const leadUpdate = { id: lead.id, 'Empfohlenes Paket': [pkg.id] };
const next = raise(lead['Status'], 'proposal_pending');
if (next) leadUpdate['Status'] = next;
return [{ json: Object.assign(rec, { _action: 'create', _lead: leadUpdate, _response: ok({ offer_id: req.key, package_name: pkg['Name'], list_price: list, discount_percent: d, final_price: final, valid_until: validUntil }) }) }];`
    }
  },
  output: [{ json: { 'Angebot-ID': 'call-TEST-0001:create_offer:2', Endpreis: 1490, _action: 'create', _lead: { id: 'recTESTLEAD000001', Status: 'proposal_pending' }, _response: { ok: true, data: { offer_id: 'call-TEST-0001:create_offer:2' } } } }]
});

const offerRoute = switchCase({
  version: 3.5,
  config: {
    name: 'Offer: create?',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { renameOutput: true, outputKey: 'create', conditions: { options: COND, conditions: [{ leftValue: expr('{{ $json._action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'create' }], combinator: 'and' } }
        ]
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'reply' }
    }
  }
});

const offerCreate = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Offer: create record',
    parameters: { resource: 'record', operation: 'create', authentication: 'airtableTokenApi', base: BASE, table: T_ANGEBOTE, columns: AUTO, options: { typecast: true, ignoreFields: '_action,_lead,_response' } },
    credentials: AT
  },
  output: [{ json: { id: 'recOFFER000000001' } }]
});

const offerLeadPayload = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Offer: lead payload', parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: $('Offer: calculate').first().json._lead }];` } },
  output: [{ json: { id: 'recTESTLEAD000001', Status: 'proposal_pending' } }]
});

const offerUpdateLead = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Offer: update lead',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, columns: ID_MATCH, options: { typecast: true } },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001' } }]
});

const offerResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Offer result', parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: $('Offer: calculate').first().json._response }];` } },
  output: [{ json: { ok: true, data: { offer_id: 'call-TEST-0001:create_offer:2' } } }]
});

const fuFindOffer = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Follow-up: find offer',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_ANGEBOTE, returnAll: false, limit: 1, filterByFormula: expr("{Angebot-ID}='{{ String($('Validate request').first().json.args.offer_id || '-').replace(/[^A-Za-z0-9_:-]/g, '') }}'") },
    credentials: AT
  },
  output: [{ json: {} }]
});

const fuPackages = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Follow-up: list packages',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_PAKETE, returnAll: true, sort: { property: [{ field: 'Reihenfolge', direction: 'asc' }] } },
    credentials: AT
  },
  output: [{ json: { id: 'recPAKET000000001', 'Paket-ID': 'MULTI_M', Name: 'Paket M', Leistungen: 'Text', 'Listenpreis netto': 1490, Aktiv: true } }]
});

const fuPrepare = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Follow-up: prepare',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: PRE + `const lead = flat($('Get lead').first().json);
const offer = rows('Follow-up: find offer')[0];
const pkgs = rows('Follow-up: list packages');
const eur = (n) => Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const reject = (c, m) => [{ json: { _action: 'reject', _response: fail(c, m) } }];
const type = a.followup_type;
if (!['offer', 'recap', 'material'].includes(type)) return reject('followup_type_invalid', 'followup_type ungültig');
const vars = {};
let angebotId = '';
if (type === 'offer') {
  if (!offer) return reject('offer_not_found', 'Angebot nicht gefunden');
  if (!Array.isArray(offer['Lead']) || offer['Lead'][0] !== lead.id) return reject('offer_lead_mismatch', 'Angebot gehört zu einem anderen Lead');
  if (!['draft', 'sent'].includes(offer['Status'])) return reject('offer_not_open', 'Angebot ist nicht mehr offen');
  const pkg = pkgs.find((p) => Array.isArray(offer['Paket']) && p.id === offer['Paket'][0]);
  if (!pkg) return reject('package_not_found', 'Paket zum Angebot fehlt');
  angebotId = offer.id;
  vars.paket = pkg['Name'];
  vars.leistungen = pkg['Leistungen'];
  vars.endpreis = eur(offer['Endpreis']);
  vars.gueltig_bis = DateTime.fromISO(offer['Gültig bis']).toFormat('dd.MM.yyyy');
}
if (type === 'recap') {
  vars.zusammenfassung = String(a.summary || '').trim();
  vars.naechster_schritt = String(a.agreed_next_contact || '').trim();
}
if (type === 'material') {
  vars.paketuebersicht = pkgs.filter((p) => p['Aktiv'] === true).map((p) => '- ' + p['Name'] + ': ' + (p['Leistungen'] || '') + ' (' + eur(p['Listenpreis netto']) + ' netto)').join('\\n');
  vars.rueckruf = String(a.agreed_next_contact || '').trim();
}
return [{ json: { _action: 'send', zweck: type, lead_id: lead.id, empfaenger: String(a.email || '').trim(), fu_id: req.key, angebot_id: angebotId, vars: vars } }];`
    }
  },
  output: [{ json: { _action: 'send', zweck: 'offer', lead_id: 'recTESTLEAD000001', empfaenger: 'anna@example.com', fu_id: 'call-TEST-0001:send_followup:3', angebot_id: 'recOFFER000000001', vars: { paket: 'Paket M' } } }]
});

const fuCanSend = ifElse({
  version: 2.2,
  config: {
    name: 'Follow-up: send?',
    parameters: { conditions: { options: COND, conditions: [{ leftValue: expr('{{ $json._action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'send' }], combinator: 'and' } }
  }
});

const fuSendMail = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Follow-up: send mail',
    parameters: { source: 'database', workflowId: MAIL_WF, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{ json: { ok: true, data: { fu_id: 'call-TEST-0001:send_followup:3', status: 'sent' } } }]
});

const fuOfferSent = ifElse({
  version: 2.2,
  config: {
    name: 'Follow-up: offer sent?',
    parameters: {
      conditions: {
        options: COND,
        conditions: [
          { leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } },
          { leftValue: expr("{{ $('Follow-up: prepare').first().json.angebot_id }}"), operator: { type: 'string', operation: 'notEmpty', singleValue: true } }
        ],
        combinator: 'and'
      }
    }
  }
});

const fuOfferPayload = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Follow-up: offer payload', parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: { id: $('Follow-up: prepare').first().json.angebot_id, 'Status': 'sent', 'Gesendet am': new Date().toISOString() } }];` } },
  output: [{ json: { id: 'recOFFER000000001', Status: 'sent' } }]
});

const fuUpdateOffer = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Follow-up: mark offer sent',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_ANGEBOTE, columns: ID_MATCH, options: { typecast: true } },
    credentials: AT
  },
  output: [{ json: { id: 'recOFFER000000001' } }]
});

const fuResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Follow-up result',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const p = $('Follow-up: prepare').first().json;
if (p._action !== 'send') return [{ json: p._response }];
const m = $('Follow-up: send mail').first().json;
return [{ json: m && typeof m.ok === 'boolean' ? m : { ok: false, error: { code: 'mail_failed', message: 'Mail-Baustein ohne Antwort' } } }];`
    }
  },
  output: [{ json: { ok: true, data: { fu_id: 'call-TEST-0001:send_followup:3', status: 'sent' } } }]
});

const terminFindExisting = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Appointment: find existing',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_TERMINE, returnAll: false, limit: 1, filterByFormula: expr("{Termin-ID}='{{ $('Validate request').first().json.key }}'") },
    credentials: AT
  },
  output: [{ json: {} }]
});

const terminPrepare = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Appointment: check slot',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: PRE + `const lead = flat($('Get lead').first().json);
const call = rows('Find call')[0];
const existing = rows('Appointment: find existing')[0];
const reject = (c, m) => [{ json: { _action: 'reject', _response: fail(c, m) } }];
if (existing) return [{ json: { _action: 'done', _response: ok({ termin_id: existing['Termin-ID'], start: existing['Start'], duplicate: true }) } }];
if (lead['DNC'] === true) return reject('lead_dnc', 'Lead steht auf DNC');
const start = DateTime.fromISO(String(a.start_iso || ''), { setZone: true }).setZone(tz);
if (!start.isValid) return reject('start_invalid', 'Startzeit ungültig (ISO 8601 erwartet)');
const now = DateTime.now().setZone(tz);
if (start < now.plus({ minutes: 30 })) return reject('start_too_soon', 'Termin muss mindestens 30 Minuten in der Zukunft liegen');
if (start > now.plus({ days: 60 })) return reject('start_too_far', 'Termin höchstens 60 Tage im Voraus');
const topic = String(a.topic || '').trim();
if (!topic) return reject('topic_missing', 'Thema des Zweittermins fehlt (topic): Anliegen und Stand des Gesprächs angeben');
const dur = Number(cfg.termin_dauer_min || 20);
const end = start.plus({ minutes: dur });
const days = String(cfg.call_days || '1,2,3,4,5').split(',').map((x) => Number(x.trim()));
const hm = (s, d) => { const p = String(s || d).split(':'); return start.set({ hour: Number(p[0]), minute: Number(p[1] || 0), second: 0, millisecond: 0 }); };
if (!days.includes(start.weekday) || start < hm(cfg.call_window_start, '09:00') || end > hm(cfg.call_window_end, '17:00') || start > hm(cfg.call_window_end, '17:00').minus({ minutes: 15 })) {
  return reject('outside_call_hours', 'Termin liegt außerhalb der Anrufzeiten (' + (cfg.call_window_start || '09:00') + '–' + (cfg.call_window_end || '17:00') + ', Tage ' + days.join(',') + ')');
}
const cal = cfg.kalender_dienst || '';
if (!['google_calendar', 'none', ''].includes(cal)) return reject('calendar_unsupported', 'kalender_dienst "' + cal + '" ist nicht angebunden');
const durch = cfg.zweittermin_durch === 'mensch' ? 'mensch' : 'agent';
const email = String(a.email || '').trim();
return [{ json: {
  _action: 'create',
  calendar: cal === 'google_calendar',
  calendar_id: cfg.kalender_id || '',
  start: start.toISO(),
  end: end.toISO(),
  dauer: dur,
  durch: durch,
  email: email,
  title: 'StepSales Zweittermin: ' + (lead['Firma'] || ''),
  description: 'Thema: ' + topic + '\\nAnsprechpartner: ' + (lead['Ansprechpartner'] || '-') + '\\nTelefon: ' + (lead['Telefon'] || '-') + '\\nDurchführung: ' + durch + '\\nTermin-ID: ' + req.key,
  topic: topic.slice(0, 500),
  lead_id: lead.id,
  lead_status: lead['Status'] || 'new',
  testdaten: lead['Testdaten'] === true,
  call_rec: call ? call.id : '',
  termin_label: start.setLocale('de').toFormat("cccc, dd.MM.yyyy 'um' HH:mm 'Uhr'"),
} }];`
    }
  },
  output: [{ json: { _action: 'create', calendar: true, calendar_id: 'kalender@example.com', start: '2026-12-01T10:30:00.000+01:00', end: '2026-12-01T10:50:00.000+01:00', durch: 'agent', email: 'anna@example.com', title: 'StepSales Zweittermin', description: 'Thema', lead_id: 'recTESTLEAD000001', lead_status: 'reached', testdaten: true, call_rec: 'recCALL0000000001', termin_label: 'Dienstag, 01.12.2026 um 10:30 Uhr' } }]
});

const terminCanCreate = ifElse({
  version: 2.2,
  config: {
    name: 'Appointment: create?',
    parameters: { conditions: { options: COND, conditions: [{ leftValue: expr('{{ $json._action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'create' }], combinator: 'and' } }
  }
});

const terminNeedsCalendar = ifElse({
  version: 2.2,
  config: {
    name: 'Appointment: calendar?',
    parameters: { conditions: { options: COND, conditions: [{ leftValue: expr('{{ $json.calendar }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }
  }
});

const terminCalendar = node({
  type: 'n8n-nodes-base.googleCalendar',
  version: 1.3,
  config: {
    name: 'Appointment: calendar event',
    parameters: {
      resource: 'event',
      operation: 'create',
      calendar: { __rl: true, mode: 'id', value: expr('{{ $json.calendar_id }}') },
      start: expr('{{ $json.start }}'),
      end: expr('{{ $json.end }}'),
      additionalFields: { summary: expr('{{ $json.title }}'), description: expr('{{ $json.description }}'), sendUpdates: 'none', visibility: 'private' }
    },
    credentials: { googleCalendarOAuth2Api: newCredential('StepSales Google Calendar') }
  },
  output: [{ json: { id: 'evt0000000001', htmlLink: 'https://calendar.google.com/event?eid=x' } }]
});

const terminBuild = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Appointment: build records',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const p = $('Appointment: check slot').first().json;
const calRan = $('Appointment: calendar event').isExecuted;
const eventId = calRan ? String($('Appointment: calendar event').first().json.id || '') : '';
const rec = {
  'Termin-ID': $('Validate request').first().json.key,
  'Start': p.start,
  'Dauer Min': p.dauer,
  'Durchführung': p.durch,
  'Status': 'scheduled',
  'Kalender-Event-ID': eventId,
  'Kontext für Agent': p.topic,
  'Testdaten': p.testdaten,
  'Lead': [p.lead_id],
};
if (p.call_rec) rec['Erstgespräch'] = [p.call_rec];
return [{ json: rec }];`
    }
  },
  output: [{ json: { 'Termin-ID': 'call-TEST-0001:schedule_second_call:4', Start: '2026-12-01T10:30:00.000+01:00', Status: 'scheduled', Lead: ['recTESTLEAD000001'] } }]
});

const terminCreate = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Appointment: create record',
    parameters: { resource: 'record', operation: 'create', authentication: 'airtableTokenApi', base: BASE, table: T_TERMINE, columns: AUTO, options: { typecast: true } },
    credentials: AT
  },
  output: [{ json: { id: 'recTERMIN00000001' } }]
});

const terminLeadPayload = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Appointment: lead payload',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const p = $('Appointment: check slot').first().json;
const RANK = ['new', 'reached', 'qualified', 'proposal_pending', 'second_call_scheduled', 'negotiating', 'verbally_closed', 'payment_pending', 'paid', 'onboarding_pending', 'fulfilled'];
const u = { id: p.lead_id, 'Nächster Schritt': 'second_appointment_booked' };
const cur = p.lead_status;
if (RANK.includes(cur) && RANK.indexOf(cur) < RANK.indexOf('second_call_scheduled')) u['Status'] = 'second_call_scheduled';
if (p.durch === 'agent') {
  u['Nächster Versuch'] = p.start;
  u['Wählbar'] = true;
  u['Versuche'] = 0;
} else {
  u['Wählbar'] = false;
}
return [{ json: u }];`
    }
  },
  output: [{ json: { id: 'recTESTLEAD000001', Status: 'second_call_scheduled' } }]
});

const terminUpdateLead = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Appointment: update lead',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, columns: ID_MATCH, options: { typecast: true } },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001' } }]
});

const terminHasEmail = ifElse({
  version: 2.2,
  config: {
    name: 'Appointment: confirm by mail?',
    parameters: { conditions: { options: COND, conditions: [{ leftValue: expr("{{ $('Appointment: check slot').first().json.email }}"), operator: { type: 'string', operation: 'notEmpty', singleValue: true } }], combinator: 'and' } }
  }
});

const terminMailInput = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Appointment: mail input',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const p = $('Appointment: check slot').first().json;
return [{ json: { zweck: 'appointment_confirmation', lead_id: p.lead_id, empfaenger: p.email, fu_id: $('Validate request').first().json.key + ':mail', angebot_id: '', vars: { termin: p.termin_label } } }];`
    }
  },
  output: [{ json: { zweck: 'appointment_confirmation', lead_id: 'recTESTLEAD000001', empfaenger: 'anna@example.com', fu_id: 'call-TEST-0001:schedule_second_call:4:mail', vars: { termin: 'Dienstag' } } }]
});

const terminSendMail = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Appointment: send confirmation',
    parameters: { source: 'database', workflowId: MAIL_WF, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{ json: { ok: true, data: { fu_id: 'call-TEST-0001:schedule_second_call:4:mail', status: 'sent' } } }]
});

const terminResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Appointment result',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const p = $('Appointment: check slot').first().json;
if (p._action !== 'create') return [{ json: p._response }];
const mailRan = $('Appointment: send confirmation').isExecuted;
const mail = mailRan ? $('Appointment: send confirmation').first().json : null;
return [{ json: { ok: true, data: {
  termin_id: $('Validate request').first().json.key,
  start: p.start,
  durchfuehrung: p.durch,
  confirmation_mail: mail ? (mail.ok ? 'sent' : 'failed: ' + ((mail.error && mail.error.code) || 'unknown')) : 'not_requested',
} } }];`
    }
  },
  output: [{ json: { ok: true, data: { termin_id: 'call-TEST-0001:schedule_second_call:4', start: '2026-12-01T10:30:00.000+01:00' } } }]
});

const paymentDisabled = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Payment link: not enabled',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `return [{ json: { ok: false, error: { code: 'payment_not_enabled', message: 'Zahlungslinks sind noch nicht freigeschaltet. Angebot per Mail senden; das Team schickt den Zahlungslink.' } } }];`
    }
  },
  output: [{ json: { ok: false, error: { code: 'payment_not_enabled', message: 'Zahlungslinks sind noch nicht freigeschaltet.' } } }]
});

const outcomeDecide = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Outcome: decide',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: PRE + `const lead = flat($('Get lead').first().json);
const call = rows('Find call')[0];
const reject = (c, m) => [{ json: { _action: 'reject', _response: fail(c, m) } }];
const AGENT = ['closed', 'second_appointment_booked', 'offer_promised', 'material_promised', 'callback_agreed', 'no_fit', 'no_interest', 'dnc_requested', 'wrong_person'];
const TECH = ['no_answer', 'voicemail', 'failed'];
const technical = a.technical === true;
const outcome = a.outcome;
if (!(technical ? TECH.concat(AGENT) : AGENT).includes(outcome)) return reject('outcome_invalid', 'outcome ungültig');
if (call && call['Ergebnis']) return [{ json: { _action: 'done', _response: ok({ stored: false, already_logged: true, outcome: call['Ergebnis'] }) } }];
if (call && Array.isArray(call['Lead']) && call['Lead'].length && call['Lead'][0] !== lead.id) return reject('call_lead_mismatch', 'Anruf gehört zu einem anderen Lead');
const now = DateTime.now().setZone(tz);
const LV = ['high', 'medium', 'low'];
const OBJ = ['price', 'timing', 'trust', 'authority', 'existing_provider', 'no_need', 'other'];
const summary = [String(a.summary || '').trim(), a.next_step ? 'Nächster Schritt: ' + String(a.next_step).trim() : ''].filter(Boolean).join('\\n').slice(0, 2000);
const callRec = {
  'Call-ID': req.call_id,
  'Agent': req.agent,
  'Ergebnis': outcome,
  'Zusammenfassung': summary,
  'Konfidenz': LV.includes(a.confidence) ? a.confidence : 'medium',
  'Ende': now.toUTC().toISO(),
  'Testdaten': lead['Testdaten'] === true,
  'Lead': [lead.id],
};
if (OBJ.includes(a.objection_type)) callRec['Einwand-Typ'] = a.objection_type;
if (call && call['Start']) callRec['Dauer Sek'] = Math.max(0, Math.round(now.diff(DateTime.fromISO(call['Start'])).as('seconds')));
const STATUS = { closed: 'verbally_closed', second_appointment_booked: 'second_call_scheduled', offer_promised: 'proposal_pending', material_promised: 'reached', callback_agreed: 'reached', no_fit: 'no_fit', no_interest: 'closed_lost', dnc_requested: 'dnc' };
const u = { id: lead.id, 'Reserviert bis': null };
const next = raise(lead['Status'], STATUS[outcome]);
if (next) u['Status'] = next;
const STEPS = ['closed', 'second_appointment_booked', 'offer_promised', 'material_promised', 'callback_agreed', 'no_fit', 'no_interest'];
if (STEPS.includes(outcome)) u['Nächster Schritt'] = outcome;
if (LV.includes(a.interest_level)) u['Interesse'] = a.interest_level;
if (OBJ.includes(a.objection_type)) u['Einwand-Typ'] = a.objection_type;
const retry = now.plus({ hours: Number(cfg.retry_hours || 24) }).toUTC().toISO();
const maxAttempts = Number(cfg.max_attempts || 3);
const note = (t) => { u['Fehlernotiz'] = now.toFormat('dd.MM.yyyy HH:mm') + ' ' + t; };
if (outcome === 'dnc_requested') { u['DNC'] = true; u['Wählbar'] = false; }
else if (outcome === 'no_fit' || outcome === 'no_interest') { u['Wählbar'] = false; }
else if (outcome === 'callback_agreed') {
  const cb = DateTime.fromISO(String(a.callback_iso || ''), { setZone: true });
  if (cb.isValid && cb > now) { u['Rückruf am'] = cb.toUTC().toISO(); u['Nächster Versuch'] = cb.toUTC().toISO(); u['Wählbar'] = true; u['Versuche'] = 0; }
  else { u['Wählbar'] = false; note('Rückruf vereinbart, aber ohne gültige Zeit – bitte prüfen'); }
}
else if (outcome === 'second_appointment_booked') { }
else if (outcome === 'wrong_person') { u['Wählbar'] = false; note('Falsche Person erreicht – Ansprechpartner prüfen'); }
else if (outcome === 'no_answer' || outcome === 'voicemail') {
  if ((Number(lead['Versuche']) || 0) >= maxAttempts) u['Wählbar'] = false; else u['Nächster Versuch'] = retry;
}
else if (outcome === 'failed') { u['Wählbar'] = false; note('Technischer Abbruch: ' + summary.slice(0, 300)); }
else { u['Wählbar'] = false; }
return [{ json: Object.assign(callRec, { _action: 'store', _lead: u, _response: ok({ stored: true, outcome: outcome }) }) }];`
    }
  },
  output: [{ json: { 'Call-ID': 'call-TEST-0001', Ergebnis: 'offer_promised', _action: 'store', _lead: { id: 'recTESTLEAD000001' }, _response: { ok: true, data: { stored: true } } } }]
});

const outcomeStore = ifElse({
  version: 2.2,
  config: {
    name: 'Outcome: store?',
    parameters: { conditions: { options: COND, conditions: [{ leftValue: expr('{{ $json._action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'store' }], combinator: 'and' } }
  }
});

const outcomeUpsertCall = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Outcome: store call',
    parameters: {
      resource: 'record', operation: 'upsert', authentication: 'airtableTokenApi', base: BASE, table: T_ANRUFE,
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['Call-ID'], schema: [{ id: 'Call-ID', displayName: 'Call-ID', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false }] },
      options: { typecast: true, ignoreFields: '_action,_lead,_response' }
    },
    credentials: AT
  },
  output: [{ json: { id: 'recCALL0000000001' } }]
});

const outcomeLeadPayload = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Outcome: lead payload', parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: $('Outcome: decide').first().json._lead }];` } },
  output: [{ json: { id: 'recTESTLEAD000001' } }]
});

const outcomeUpdateLead = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Outcome: update lead',
    parameters: { resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_LEADS, columns: ID_MATCH, options: { typecast: true } },
    credentials: AT
  },
  output: [{ json: { id: 'recTESTLEAD000001' } }]
});

const outcomeResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Outcome result', parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: $('Outcome: decide').first().json._response }];` } },
  output: [{ json: { ok: true, data: { stored: true } } }]
});

const note = sticky('## StepSales – Agent-Tools\nVertrag: docs/contracts/tools-webhook.md\n- Auth: Header X-StepSales-Secret (Credential "StepSales Tools Secret")\n- Idempotency-Key = <call_id>:<tool>:<seq> wird zur Datensatz-ID (Angebot-ID, FU-ID, Termin-ID) – Wiederholungen schreiben nichts doppelt\n- Antwort immer {ok, data} oder {ok:false, error}; 400 bei ungültiger Anfrage; 500 bei Systemfehler\n- Preis/Rabatt nur hier, nie im Agenten\n- send_payment_link bleibt bis Stufe 5 (Stripe) aus', [webhookTrigger, validate], { color: 4 });

export default workflow('stepsales-agent-tools', 'StepSales – Agent-Tools')
  .add(webhookTrigger)
  .to(validate)
  .to(isValid
    .onTrue(loadConfig.to(getLead.to(findCall.to(routeTool
      .onCase(0, listPackages.to(packagesResult.to(respond)))
      .onCase(1, qualifyPrepare.to(qualifyUpdate.to(qualifyResult.to(respond))))
      .onCase(2, offerFindExisting.to(offerFindPackage.to(offerDecide.to(offerRoute
        .onCase(0, offerCreate.to(offerLeadPayload.to(offerUpdateLead.to(offerResult.to(respond)))))
        .onCase(1, offerResult)))))
      .onCase(3, fuFindOffer.to(fuPackages.to(fuPrepare.to(fuCanSend
        .onTrue(fuSendMail.to(fuOfferSent
          .onTrue(fuOfferPayload.to(fuUpdateOffer.to(fuResult.to(respond))))
          .onFalse(fuResult)))
        .onFalse(fuResult)))))
      .onCase(4, terminFindExisting.to(terminPrepare.to(terminCanCreate
        .onTrue(terminNeedsCalendar
          .onTrue(terminCalendar.to(terminBuild))
          .onFalse(terminBuild))
        .onFalse(terminResult.to(respond)))))
      .onCase(5, paymentDisabled.to(respond))
      .onCase(6, outcomeDecide.to(outcomeStore
        .onTrue(outcomeUpsertCall.to(outcomeLeadPayload.to(outcomeUpdateLead.to(outcomeResult.to(respond)))))
        .onFalse(outcomeResult)))))))
    .onFalse(respondBad))
  .add(terminBuild)
  .to(terminCreate.to(terminLeadPayload.to(terminUpdateLead.to(terminHasEmail
    .onTrue(terminMailInput.to(terminSendMail.to(terminResult)))
    .onFalse(terminResult)))))
  .add(note)
  .group('Gemeinsame Daten', [loadConfig, getLead, findCall], { description: 'Config, Lead und Anruf (Call-ID) einmal je Aufruf lesen.' })
  .group('get_packages', [listPackages, packagesResult], { description: 'Aktive Pakete aus Airtable, sortiert; Rabattgrenze in Prozent.' })
  .group('qualify_lead', [qualifyPrepare, qualifyUpdate, qualifyResult], { description: 'Nur genannte Felder ändern, Score wie v1, kein Status-Downgrade.' })
  .group('create_offer', [offerFindExisting, offerFindPackage, offerDecide, offerRoute, offerCreate, offerLeadPayload, offerUpdateLead, offerResult], { description: 'Rabatt ≤ Paket-Max, Begründung Pflicht, Endpreis serverseitig, Angebot-ID = Idempotency-Key.' })
  .group('send_followup', [fuFindOffer, fuPackages, fuPrepare, fuCanSend, fuSendMail, fuOfferSent, fuOfferPayload, fuUpdateOffer, fuResult], { description: 'Angebot/Recap/Material über Mail senden; Angebot danach auf sent.' })
  .group('schedule_second_call', [terminFindExisting, terminPrepare, terminCanCreate, terminNeedsCalendar, terminCalendar, terminBuild, terminCreate, terminLeadPayload, terminUpdateLead, terminHasEmail, terminMailInput, terminSendMail, terminResult], { description: 'Slot in Anrufzeiten prüfen, Kalender, Termin, Lead, optional Bestätigungsmail.' })
  .group('log_call_outcome', [outcomeUpsertCall, outcomeLeadPayload, outcomeUpdateLead], { description: 'Ein Ergebnis je Call-ID; Lead-Status, DNC und nächster Wählversuch.' });
