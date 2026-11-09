/**
 * notification-service / db.js — single Knex instance (CSP-12).
 *
 * Exported as a callable (per Knex convention) so route code can use
 * `db('notification_outbox')` directly and still reach `db.raw`, `db.fn`,
 * `db.destroy` etc.
 */

const knex = require('knex');
const config = require('./config');

const db = knex({
  client: 'mysql2',
  connection: {
    host:     config.db.host,
    port:     config.db.port,
    user:     config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset:  'utf8mb4',
  },
  pool: config.db.pool,
});

module.exports = db;
