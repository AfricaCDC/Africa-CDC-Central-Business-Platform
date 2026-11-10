// ── Guardrail: packages/lib/enums.js (CJS) MUST stay in sync with enums.mjs (ESM) ──
//
// The platform ships dual builds: api-server/node services `require('@rbm/lib/enums')`
// (the .js file) while the Vite frontend `import`s the .mjs file. If the two drift,
// the backend and frontend disagree on status/entity/decision values — a class of
// integration bug that is invisible until runtime. This test fails the build the
// moment the two copies diverge in exported names OR values.
//
// jest cannot dynamic-import .mjs without --experimental-vm-modules, so the actual
// comparison runs in a plain node subprocess (which natively supports require + import()).

const { execFileSync } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');

const CJS_PATH = path.resolve(__dirname, '../../../../packages/lib/enums.js');
const MJS_PATH = path.resolve(__dirname, '../../../../packages/lib/enums.mjs');
// import() needs a file:// URL — a raw absolute path breaks on Windows
// (ERR_UNSUPPORTED_ESM_URL_SCHEME); require() takes the plain path.
const MJS_URL = pathToFileURL(MJS_PATH).href;

const COMPARE_SCRIPT = `
const cjs = require(${JSON.stringify(CJS_PATH)});
function dataOnly(o){
  if(o===null||typeof o!=='object') return typeof o==='function'?'[fn]':o;
  if(Array.isArray(o)) return o.map(dataOnly);
  return Object.fromEntries(Object.keys(o).sort().map(k=>[k,dataOnly(o[k])]));
}
import(${JSON.stringify(MJS_URL)}).then((esm)=>{
  const cjsKeys = Object.keys(cjs).sort();
  const esmKeys = Object.keys(esm).filter(k=>k!=='default').sort();
  const mismatches = [];
  for(const k of cjsKeys.filter(k=>esmKeys.includes(k))){
    if(JSON.stringify(dataOnly(cjs[k]))!==JSON.stringify(dataOnly(esm[k]))) mismatches.push(k);
  }
  process.stdout.write(JSON.stringify({
    cjsKeys, esmKeys,
    onlyCjs: cjsKeys.filter(k=>!esmKeys.includes(k)),
    onlyEsm: esmKeys.filter(k=>!cjsKeys.includes(k)),
    valueMismatches: mismatches,
  }));
}).catch(e=>{ process.stderr.write(String(e)); process.exit(2); });
`;

function compareEnums() {
  const out = execFileSync('node', ['-e', COMPARE_SCRIPT], { encoding: 'utf8' });
  return JSON.parse(out);
}

describe('enums.js (CJS) ↔ enums.mjs (ESM) parity', () => {
  let result;
  beforeAll(() => {
    result = compareEnums();
  });

  it('should export the same set of named exports (ignoring ESM default)', () => {
    expect(result.onlyCjs).toEqual([]);
    expect(result.onlyEsm).toEqual([]);
  });

  it('should have identical values for every shared export', () => {
    expect(result.valueMismatches).toEqual([]);
  });

  it('APPROVAL_ENTITIES must contain the report entity types used by the workflow engine', () => {
    // Regression for the ENTITY_TYPES.INDICATOR_ACTUAL/ACTIVITY_REPORT undefined bug:
    // these keys live in APPROVAL_ENTITIES, NOT ENTITY_TYPES.
    const { APPROVAL_ENTITIES, ENTITY_TYPES } = require('@rbm/lib/enums');
    for (const e of ['INDICATOR_ACTUAL', 'ACTIVITY_REPORT', 'INDICATOR_DIVISION_REPORT', 'DIVISION_ACTIVITY_REPORT', 'PLAN_NODE']) {
      expect(APPROVAL_ENTITIES[e]).toBe(e);
    }
    expect(ENTITY_TYPES.INDICATOR_ACTUAL).toBeUndefined();
    expect(ENTITY_TYPES.ACTIVITY_REPORT).toBeUndefined();
  });
});
