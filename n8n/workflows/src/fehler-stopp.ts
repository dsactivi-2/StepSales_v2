import { workflow, node, trigger, newCredential, expr, sticky } from '@n8n/workflow-sdk';

const BASE = { __rl: true, mode: 'id', value: 'appLXW1HK6fe213yO', cachedResultName: 'StepSales' };
const T_CONFIG = { __rl: true, mode: 'id', value: 'tblF7wK3OESuyDoFJ', cachedResultName: 'Config' };
const AT = { airtableTokenApi: newCredential('StepSales Airtable') };

const onError = trigger({
  type: 'n8n-nodes-base.errorTrigger',
  version: 1,
  config: { name: 'On workflow error' },
  output: [{ json: { execution: { id: '123', url: 'https://n8n.activi.io/execution/123', error: { message: 'Airtable 503' }, lastNodeExecuted: 'Find eligible leads' }, workflow: { id: 'abc', name: 'StepSales – Dispatcher' } } }]
});

const loadConfig = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Load config',
    executeOnce: true,
    parameters: { resource: 'record', operation: 'search', authentication: 'airtableTokenApi', base: BASE, table: T_CONFIG, returnAll: true, options: { fields: ['Schlüssel', 'Wert', 'Beschreibung'] } },
    credentials: AT
  },
  output: [{ json: { id: 'recaVJAccCixYgmwv', 'Schlüssel': 'dial_enabled', 'Wert': 'true', Beschreibung: 'Kill-Switch' } }]
});

const buildStop = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build stop',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const flat = (j) => Object.assign({ id: j.id }, j.fields || j);
const ev = $('On workflow error').first().json;
const rows = $('Load config').all().map((i) => flat(i.json)).filter((r) => r.id);
const by = {};
rows.forEach((r) => { if (r['Schlüssel']) by[r['Schlüssel']] = r; });
const sw = by.dial_enabled;
if (!sw) throw new Error('Config dial_enabled fehlt – Wählen kann nicht automatisch gestoppt werden');
const when = DateTime.now().setZone('Europe/Berlin').toFormat('dd.MM.yyyy HH:mm');
const wf = (ev.workflow && ev.workflow.name) || 'unbekannt';
const nodeName = (ev.execution && ev.execution.lastNodeExecuted) || '-';
const msg = String((ev.execution && ev.execution.error && ev.execution.error.message) || 'unbekannter Fehler').slice(0, 300);
const url = (ev.execution && ev.execution.url) || '';
const note = 'Kill-Switch (true/false). AUTO-STOP ' + when + ': ' + wf + ' / ' + nodeName + ': ' + msg;
const mailTo = String((by.alarm_email && by.alarm_email['Wert']) || (by.absender_adresse && by.absender_adresse['Wert']) || '').trim();
return [{ json: {
  id: sw.id,
  'Wert': 'false',
  'Beschreibung': note,
  _was: String(sw['Wert'] || ''),
  _mail_to: mailTo,
  _subject: 'StepSales: Wählen gestoppt (' + wf + ')',
  _body: 'Das automatische Wählen wurde gestoppt.\\n\\nWorkflow: ' + wf + '\\nNode: ' + nodeName + '\\nFehler: ' + msg + '\\nAusführung: ' + url + '\\n\\nNach Prüfung in Airtable Config.dial_enabled wieder auf true setzen (Runbook kill-switch.md).',
} }];`
    }
  },
  output: [{ json: { id: 'recaVJAccCixYgmwv', Wert: 'false', Beschreibung: 'AUTO-STOP', _was: 'true', _mail_to: 'owner@example.com', _subject: 'StepSales: Wählen gestoppt', _body: 'Text' } }]
});

const stopDialing = node({
  type: 'n8n-nodes-base.airtable',
  version: 2.2,
  config: {
    name: 'Turn off dialing',
    parameters: {
      resource: 'record', operation: 'update', authentication: 'airtableTokenApi', base: BASE, table: T_CONFIG,
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['id'], schema: [{ id: 'id', displayName: 'id', required: false, defaultMatch: true, display: true, type: 'string', readOnly: true, removed: false }] },
      options: { typecast: true, ignoreFields: '_was,_mail_to,_subject,_body' }
    },
    credentials: AT
  },
  output: [{ json: { id: 'recaVJAccCixYgmwv' } }]
});

const alertOwner = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Alert owner',
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'message', operation: 'send', authentication: 'oAuth2',
      sendTo: expr("{{ $('Build stop').first().json._mail_to }}"),
      subject: expr("{{ $('Build stop').first().json._subject }}"),
      emailType: 'text',
      message: expr("{{ $('Build stop').first().json._body }}"),
      options: { appendAttribution: false }
    },
    credentials: { gmailOAuth2: newCredential('StepSales Gmail') }
  },
  output: [{ json: { id: '18c0000000000000' } }]
});

const note = sticky('## Fehler-Stopp (fail-closed)\nError-Workflow für Dispatcher, Ergebnisabgleich und Agent-Tools.\nJeder Fehler setzt Config.dial_enabled = false und schreibt Ursache + Zeit in Config.Beschreibung.\nAlarm-Mail an Config.alarm_email (sonst absender_adresse).\nWieder einschalten nur manuell nach Prüfung: docs/runbooks/kill-switch.md', [onError, loadConfig, buildStop], { color: 3 });

export default workflow('stepsales-fehler-stopp', 'StepSales – Fehler-Stopp')
  .add(onError)
  .to(loadConfig)
  .to(buildStop)
  .to(stopDialing)
  .to(alertOwner)
  .add(note);
