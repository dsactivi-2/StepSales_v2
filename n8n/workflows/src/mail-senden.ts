import { workflow, node, trigger, switchCase, newCredential, expr, sticky } from '@n8n/workflow-sdk';

const BASE = { __rl: true, mode: 'id', value: 'appLXW1HK6fe213yO', cachedResultName: 'StepSales' };
const T_CONFIG = { __rl: true, mode: 'id', value: 'tblF7wK3OESuyDoFJ', cachedResultName: 'Config' };
const T_LEADS = { __rl: true, mode: 'id', value: 'tblaT64e3mBSfULhx', cachedResultName: 'Leads' };
const T_TPL = { __rl: true, mode: 'id', value: 'tblLxwddcbRNedW31', cachedResultName: 'Mail-Vorlagen' };
const T_FU = { __rl: true, mode: 'id', value: 'tblTnWina3R6xUidx', cachedResultName: 'Follow-ups' };

const startTrigger = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.3,
  config: {
    name: 'Start',
    parameters: { inputSource: 'passthrough' }
  },
  output: [{ json: { zweck: 'offer', lead_id: 'recTESTLEAD000001', empfaenger: 'test@example.com', fu_id: 'call-TEST-0001:send_followup:3', angebot_id: '', vars: { paket: 'Paket M' } } }]
});

const loadConfig = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Load config',
    executeOnce: true,
    parameters: {
      resource: 'record', operation: 'search', authentication: 'airtableTokenApi',
      base: BASE, table: T_CONFIG, returnAll: true,
      options: { fields: ['Schlüssel', 'Wert'] }
    },
    credentials: { airtableTokenApi: newCredential('StepSales Airtable') }
  },
  output: [{ json: { id: 'recCONFIG00000001', 'Schlüssel': 'mail_dienst', 'Wert': 'gmail' } }]
});

const findTemplate = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find template',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'record', operation: 'search', authentication: 'airtableTokenApi',
      base: BASE, table: T_TPL, returnAll: false, limit: 1,
      filterByFormula: expr("AND({Zweck}='{{ String($('Start').first().json.zweck || '').replace(/[^a-z0-9_]/g, '') }}', {Aktiv})")
    },
    credentials: { airtableTokenApi: newCredential('StepSales Airtable') }
  },
  output: [{ json: { id: 'recTPL00000000001', 'Vorlagen-ID': 'offer_v1', Betreff: 'Ihr Angebot: {{paket}}', Text: 'Guten Tag {{ansprechpartner}}\n\n{{signatur}}' } }]
});

const findExisting = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Find existing follow-up',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'record', operation: 'search', authentication: 'airtableTokenApi',
      base: BASE, table: T_FU, returnAll: false, limit: 1,
      filterByFormula: expr("{FU-ID}='{{ String($('Start').first().json.fu_id || '').replace(/[^A-Za-z0-9_:.-]/g, '') }}'"),
      options: { fields: ['FU-ID', 'Status'] }
    },
    credentials: { airtableTokenApi: newCredential('StepSales Airtable') }
  },
  output: [{ json: {} }]
});

const getLead = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Get lead',
    executeOnce: true,
    parameters: {
      resource: 'record', operation: 'get', authentication: 'airtableTokenApi',
      base: BASE, table: T_LEADS,
      id: expr("{{ $('Start').first().json.lead_id }}")
    },
    credentials: { airtableTokenApi: newCredential('StepSales Airtable') }
  },
  output: [{ json: { id: 'recTESTLEAD000001', Firma: 'TEST Musterbau GmbH', Ansprechpartner: 'Anna Test', Telefon: '+4930123456789', Testdaten: true } }]
});

const renderMail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Render mail',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const flat = (j) => Object.assign({ id: j.id }, j.fields || j);
const req = $('Start').first().json;
const cfg = {};
$('Load config').all().forEach((i) => {
  const r = flat(i.json);
  if (r['Schlüssel']) cfg[r['Schlüssel']] = String(r['Wert'] == null ? '' : r['Wert']).trim();
});
const tpl = $('Find template').all().map((i) => flat(i.json)).filter((r) => r.id)[0];
const existing = $('Find existing follow-up').all().map((i) => flat(i.json)).filter((r) => r.id)[0];
const lead = flat($('Get lead').first().json);
const email = String(req.empfaenger || '').trim();
const record = {
  'FU-ID': String(req.fu_id || ''),
  'Stufe': req.zweck,
  'Empfänger': email,
  'Lead': [lead.id],
  'Testdaten': lead['Testdaten'] === true,
};
if (req.angebot_id) record['Angebot'] = [req.angebot_id];
if (tpl) record['Vorlage'] = [tpl.id];
const out = (action, extra) => [{ json: Object.assign({}, record, extra, { _action: action }) }];
const block = (code, message) => out('block', {
  'Status': 'failed',
  'Fehler': code + ': ' + message,
  _response: { ok: false, error: { code: code, message: message } },
});

if (!record['FU-ID']) return block('fu_id_missing', 'FU-ID fehlt');
if (existing && existing['Status'] === 'sent') {
  return out('done', { _response: { ok: true, data: { fu_id: record['FU-ID'], status: 'sent', duplicate: true } } });
}
if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return block('invalid_email', 'E-Mail-Adresse ungültig');
if (lead['DNC'] === true) return block('lead_dnc', 'Lead steht auf DNC');
if (cfg.test_mode !== 'false' && lead['Testdaten'] !== true) return block('test_mode', 'Testbetrieb: Mails nur an Testdaten-Leads');
if (!tpl) return block('template_missing', 'Keine aktive Vorlage für ' + req.zweck);
if ((cfg.mail_dienst || '') !== 'gmail') return block('mail_service_unsupported', 'mail_dienst "' + (cfg.mail_dienst || '') + '" ist nicht angebunden');

const vars = Object.assign({
  firma: lead['Firma'],
  ansprechpartner: lead['Ansprechpartner'],
  telefon: lead['Telefon'],
  absender_name: cfg.absender_name,
  signatur: cfg.mail_signatur,
}, req.vars || {});
const missing = [];
const render = (text) => String(text || '').replace(/\\{\\{\\s*([a-z0-9_]+)\\s*\\}\\}/g, (m, key) => {
  const v = vars[key];
  if (v === undefined || v === null || String(v).trim() === '') {
    if (!missing.includes(key)) missing.push(key);
    return m;
  }
  return String(v);
});
const subject = render(tpl['Betreff']);
const body = render(tpl['Text']);
if (missing.length) return block('placeholder_missing', 'Fehlende Werte: ' + missing.join(', '));

return out('send', {
  'Status': 'sent',
  'Gesendet am': new Date().toISOString(),
  _subject: subject,
  _body: body,
  _sender_name: cfg.absender_name || '',
  _bcc: cfg.mail_bcc_intern || '',
  _response: { ok: true, data: { fu_id: record['FU-ID'], status: 'sent' } },
});`
    }
  },
  output: [{ json: { 'FU-ID': 'call-TEST-0001:send_followup:3', Stufe: 'offer', 'Empfänger': 'test@example.com', Lead: ['recTESTLEAD000001'], Testdaten: true, Status: 'sent', _action: 'send', _subject: 'Ihr Angebot', _body: 'Text', _sender_name: 'Lena Berger | StepSales', _bcc: '', _response: { ok: true, data: { fu_id: 'call-TEST-0001:send_followup:3', status: 'sent' } } } }]
});

const routeAction = switchCase({
  version: 3.5,
  config: {
    name: 'Route action',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { renameOutput: true, outputKey: 'send', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json._action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'send' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'block', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json._action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'block' }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'done', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json._action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'done' }], combinator: 'and' } }
        ]
      }
    }
  }
});

const sendGmail = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Send via Gmail',
    onError: 'continueErrorOutput',
    parameters: {
      resource: 'message', operation: 'send', authentication: 'oAuth2',
      sendTo: expr('{{ $json["Empfänger"] }}'),
      subject: expr('{{ $json._subject }}'),
      emailType: 'text',
      message: expr('{{ $json._body }}'),
      options: {
        appendAttribution: false,
        senderName: expr('{{ $json._sender_name }}'),
        bccList: expr('{{ $json._bcc }}')
      }
    },
    credentials: { gmailOAuth2: newCredential('StepSales Gmail') }
  },
  output: [{ json: { id: '18c0000000000000', threadId: '18c0000000000000', labelIds: ['SENT'] } }]
});

const fuColumns = {
  mappingMode: 'autoMapInputData',
  value: {},
  matchingColumns: ['FU-ID'],
  schema: [{ id: 'FU-ID', displayName: 'FU-ID', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false }]
};
const IGNORE = '_action,_response,_subject,_body,_sender_name,_bcc';

const saveSent = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare sent record',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const r = $('Render mail').first().json;
return [{ json: Object.assign({}, r) }];`
    }
  },
  output: [{ json: { 'FU-ID': 'call-TEST-0001:send_followup:3', Status: 'sent', _action: 'send' } }]
});

const prepareFailed = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare failed record',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const r = Object.assign({}, $('Render mail').first().json);
const err = $input.first().json.error;
const msg = String((err && (err.message || err.description)) || err || 'Gmail-Fehler').slice(0, 500);
r['Status'] = 'failed';
delete r['Gesendet am'];
r['Fehler'] = 'mail_failed: ' + msg;
r._response = { ok: false, error: { code: 'mail_failed', message: 'Mail konnte nicht gesendet werden' } };
return [{ json: r }];`
    }
  },
  output: [{ json: { 'FU-ID': 'call-TEST-0001:send_followup:3', Status: 'failed', _action: 'send' } }]
});

const upsertSent = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Store sent follow-up',
    parameters: {
      resource: 'record', operation: 'upsert', authentication: 'airtableTokenApi',
      base: BASE, table: T_FU, columns: fuColumns,
      options: { typecast: true, ignoreFields: IGNORE }
    },
    credentials: { airtableTokenApi: newCredential('StepSales Airtable') }
  },
  output: [{ json: { id: 'recFU000000000001' } }]
});

const upsertFailed = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Store failed follow-up',
    parameters: {
      resource: 'record', operation: 'upsert', authentication: 'airtableTokenApi',
      base: BASE, table: T_FU, columns: fuColumns,
      options: { typecast: true, ignoreFields: IGNORE }
    },
    credentials: { airtableTokenApi: newCredential('StepSales Airtable') }
  },
  output: [{ json: { id: 'recFU000000000001' } }]
});

const upsertBlocked = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Store blocked follow-up',
    parameters: {
      resource: 'record', operation: 'upsert', authentication: 'airtableTokenApi',
      base: BASE, table: T_FU, columns: fuColumns,
      options: { typecast: true, ignoreFields: IGNORE }
    },
    credentials: { airtableTokenApi: newCredential('StepSales Airtable') }
  },
  output: [{ json: { id: 'recFU000000000001' } }]
});

const resultSent = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Result sent',
    parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: $('Render mail').first().json._response }];` }
  },
  output: [{ json: { ok: true, data: { fu_id: 'call-TEST-0001:send_followup:3', status: 'sent' } } }]
});

const resultFailed = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Result failed',
    parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: $('Prepare failed record').first().json._response }];` }
  },
  output: [{ json: { ok: false, error: { code: 'mail_failed', message: 'Mail konnte nicht gesendet werden' } } }]
});

const resultBlocked = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Result blocked',
    parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: $('Render mail').first().json._response }];` }
  },
  output: [{ json: { ok: false, error: { code: 'placeholder_missing', message: 'Fehlende Werte: signatur' } } }]
});

const resultDone = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Result already sent',
    parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: $json._response }];` }
  },
  output: [{ json: { ok: true, data: { fu_id: 'call-TEST-0001:send_followup:3', status: 'sent', duplicate: true } } }]
});

const note = sticky('## Mail senden\nEin Baustein für alle Mails (Tools, Follow-up-Sequenz, Zahlung).\nEingabe: zweck, lead_id, empfaenger, fu_id, angebot_id, vars.\nBlockiert fail-closed bei fehlendem Platzhalter (auch {{signatur}}), ungültiger Adresse, DNC, Testbetrieb ohne Testdaten-Lead, fehlender Vorlage oder nicht angebundenem mail_dienst.\nFU-ID ist der Idempotenz-Schlüssel: schon gesendet = nicht erneut senden.', [startTrigger, loadConfig, renderMail], { color: 4 });

export default workflow('stepsales-mail-senden', 'StepSales – Mail senden')
  .add(startTrigger)
  .to(loadConfig)
  .to(findTemplate)
  .to(findExisting)
  .to(getLead)
  .to(renderMail)
  .to(routeAction
    .onCase(0, sendGmail.to(saveSent.to(upsertSent.to(resultSent))))
    .onCase(1, upsertBlocked.to(resultBlocked))
    .onCase(2, resultDone))
  .add(sendGmail.onError(prepareFailed.to(upsertFailed.to(resultFailed))))
  .add(note)
  .group('Daten laden', [loadConfig, findTemplate, findExisting, getLead], { description: 'Config, aktive Vorlage, schon gesendete FU-ID und Lead lesen.' })
  .group('Senden und speichern', [saveSent, upsertSent, resultSent], { description: 'Erfolgreich gesendete Mail als Follow-up "sent" speichern.' })
  .group('Bei Gmail-Fehler', [prepareFailed, upsertFailed, resultFailed], { description: 'Gmail-Fehler als Follow-up failed speichern, ok:false zurück.' })
  .group('Blockiert', [upsertBlocked, resultBlocked], { description: 'Versand blockiert (Platzhalter, Adresse, DNC, Testbetrieb): failed speichern.' });
