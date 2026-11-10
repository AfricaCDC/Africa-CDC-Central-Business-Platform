// ── In-memory knex stand-in for unit tests ──
//
// Supports the subset of the query builder used by the division assignment
// service and its migration: where / whereIn / whereNot / whereNull /
// whereNotNull / select / first / update / insert / del, plus where(col, op,
// value) comparisons, orderBy and limit, awaited directly.
// Rows are plain objects held in `tables`, so tests assert on real row state.
// No real connection is ever opened.

const COMPARE = {
  '=': (x, y) => x === y,
  '!=': (x, y) => x !== y,
  '<>': (x, y) => x !== y,
  '>': (x, y) => x > y,
  '>=': (x, y) => x >= y,
  '<': (x, y) => x < y,
  '<=': (x, y) => x <= y,
};

function matches(row, filters) {
  return filters.every((f) => f(row));
}

function makeBuilder(tables, table) {
  const filters = [];
  let op = 'select';
  let single = false;
  let payload = null;
  let order = null;
  let max = null;

  const store = () => {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  };

  const run = () => {
    const rows = store();
    const matched = rows.filter((r) => matches(r, filters));
    if (op === 'insert') {
      const id = rows.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;
      rows.push({ id, ...payload });
      return [id];
    }
    if (op === 'update') {
      matched.forEach((r) => Object.assign(r, payload));
      return matched.length;
    }
    if (op === 'del') {
      matched.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return matched.length;
    }
    if (op === 'max') {
      const values = matched.map((r) => r[payload.col]).filter((v) => v != null);
      const agg = [{ [payload.alias]: values.length ? Math.max(...values) : null }];
      return single ? agg[0] : agg;
    }
    if (order) {
      const dir = order.dir === 'desc' ? -1 : 1;
      matched.sort((x, y) => (x[order.col] > y[order.col] ? dir : x[order.col] < y[order.col] ? -dir : 0));
    }
    const copies = (max == null ? matched : matched.slice(0, max)).map((r) => ({ ...r }));
    return single ? copies[0] : copies;
  };

  const b = {
    where(a, value, third) {
      if (third !== undefined) {
        filters.push((r) => COMPARE[value](r[a], third));
      } else if (a && typeof a === 'object') {
        Object.entries(a).forEach(([k, v]) => filters.push((r) => r[k] === v));
      } else {
        filters.push((r) => r[a] === value);
      }
      return b;
    },
    whereIn(col, values) {
      filters.push((r) => values.includes(r[col]));
      return b;
    },
    whereNot(col, value) {
      filters.push((r) => r[col] !== value);
      return b;
    },
    whereNull(col) {
      filters.push((r) => r[col] == null);
      return b;
    },
    whereNotNull(col) {
      filters.push((r) => r[col] != null);
      return b;
    },
    select() { return b; },
    orderBy(col, dir = 'asc') { order = { col, dir }; return b; },
    limit(n) { max = n; return b; },
    forUpdate() { return b; },
    max(spec) { const [alias] = Object.keys(spec); op = 'max'; payload = { alias, col: spec[alias] }; return b; },
    first() { single = true; return b; },
    update(p) { op = 'update'; payload = p; return b; },
    insert(p) { op = 'insert'; payload = p; return b; },
    del() { op = 'del'; return b; },
    delete() { op = 'del'; return b; },
    then(resolve, reject) {
      return Promise.resolve().then(run).then(resolve, reject);
    },
  };
  return b;
}

/**
 * Build a fake knex instance over the given table map.
 *
 * @param {Object<string, object[]>} tables — mutable row arrays keyed by table name
 * @returns {Function} knex-like callable with schema + transaction helpers
 * @example
 * const knex = makeFakeKnex({ division_codes: [{ code: 'DPHI', responsible_user_id: null }] });
 * await knex('division_codes').where('code', 'DPHI').update({ responsible_user_id: 5 });
 */
function makeFakeKnex(tables) {
  const knex = (table) => makeBuilder(tables, table);
  knex.schema = {
    hasTable: async () => true,
    hasColumn: async () => true,
    alterTable: async () => {},
  };
  knex.transaction = async (cb) => cb(knex);
  knex.fn = { now: () => 'NOW' };
  return knex;
}

module.exports = { makeFakeKnex };
