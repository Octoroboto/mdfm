// Bouncer: the rule engine. Cedar (https://www.cedarpolicy.com), open source from AWS, a CNCF
// project, with a formally verified core. We only call it; we never reimplement it.
//
// Each request is asked as: principal Caller::"<caller>", action Action::"<METHOD>",
// resource Host::"<host>", context = the request facts.

function loadCedar() {
  // eslint-disable-next-line global-require
  return require('@cedar-policy/cedar-wasm/nodejs');
}

// Splits the policy text into its rules and reads each rule's @id / @description.
function readRules(cedar, policyText) {
  const parts = cedar.policySetTextToParts(policyText);
  if (parts.type !== 'success') {
    throw new Error('Bouncer policy has errors: ' + parts.errors.map((e) => e.message).join('; '));
  }
  const rules = {};
  const list = [];
  parts.policies.forEach((text, i) => {
    const id = (text.match(/@id\s*\(\s*"([^"]+)"\s*\)/) || [])[1] || `rule${i}`;
    const description = (text.match(/@description\s*\(\s*"([^"]+)"\s*\)/) || [])[1] || '';
    const effect = /^\s*(?:@[^\n]*\n\s*)*forbid\b/m.test(text) ? 'forbid' : 'permit';
    if (rules[id]) throw new Error(`Bouncer policy: two rules are called "${id}"`);
    rules[id] = text;
    list.push({ id, description, effect });
  });
  return { rules, list };
}

function createCedarEngine(policyText, cedar = loadCedar()) {
  const { rules, list } = readRules(cedar, policyText);
  const check = cedar.checkParsePolicySet({ staticPolicies: rules });
  if (check.type !== 'success') throw new Error('Bouncer policy has errors: ' + check.errors.map((e) => e.message).join('; '));

  // -> { decision: 'allow'|'deny', reasons: [rule ids], errors: [...] }
  function decide(caller, facts) {
    const context = {
      caller,
      method: facts.method,
      host: facts.host,
      path: facts.path,
      search: facts.search,
      fields: facts.fields,
      form: facts.form,
      sameToday: facts.sameToday || 0,
      bodyBytes: facts.bodyBytes || 0,
    };
    const ans = cedar.isAuthorized({
      principal: { type: 'Caller', id: caller },
      action: { type: 'Action', id: facts.method },
      resource: { type: 'Host', id: facts.host },
      context,
      policies: { staticPolicies: rules },
      entities: [],
    });
    if (ans.type !== 'success') return { decision: 'deny', reasons: [], errors: ans.errors.map((e) => e.message) };
    return {
      decision: String(ans.response.decision).toLowerCase() === 'allow' ? 'allow' : 'deny',
      reasons: ans.response.diagnostics.reason,
      errors: ans.response.diagnostics.errors.map((e) => `${e.policyId}: ${e.error.message}`),
    };
  }

  return {
    name: 'Cedar',
    version: cedar.getCedarVersion(),
    languageVersion: cedar.getCedarLangVersion ? cedar.getCedarLangVersion() : null,
    rules: list,
    decide,
  };
}

module.exports = { createCedarEngine, readRules, loadCedar };
