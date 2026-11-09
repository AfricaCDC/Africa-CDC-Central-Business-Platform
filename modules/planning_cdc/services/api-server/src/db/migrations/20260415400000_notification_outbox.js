/**
 * Notification Outbox (D-05).
 *
 * Replaces the in-memory notification queue in `notification-service` with a
 * durable MySQL table. A single-instance worker polls rows with
 * `status='queued'`, sends via SMTP, then transitions them to `sent` or
 * (after `attempts >= 5`) to `failed` — the DLQ lane.
 *
 * Columns:
 *   id              BIGINT PK AUTO_INCREMENT
 *   event_key       VARCHAR(64)  — template key (NOTIFICATION_TYPES symbol)
 *   recipient       VARCHAR(320) — single email address per row (RFC 5321 max)
 *   subject         VARCHAR(255) NULL
 *   payload         JSON         — template variables
 *   headers         JSON NULL    — extra SMTP headers (Message-ID, List-Unsubscribe, ...)
 *   status          ENUM('draft','queued','sent','failed') NOT NULL DEFAULT 'queued'
 *   attempts        INT UNSIGNED NOT NULL DEFAULT 0
 *   last_error      TEXT NULL
 *   correlation_id  VARCHAR(64) NULL — caller-provided tracing id
 *   created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
 *   updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 *   sent_at         DATETIME NULL
 *
 * Indexes:
 *   idx_outbox_status_created (status, created_at)   — worker polling
 *   idx_outbox_correlation    (correlation_id)        — trace joins
 *
 * Idempotent on up()/down(): safe to re-run.
 */

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('notification_outbox')) return;

  await knex.schema.createTable('notification_outbox', (t) => {
    t.bigIncrements('id').primary();
    t.string('event_key', 64).notNullable();
    t.string('recipient', 320).notNullable();
    t.string('subject', 255).nullable();
    t.json('payload').notNullable();
    t.json('headers').nullable();
    t.enum('status', ['draft', 'queued', 'sent', 'failed'], {
      useNative: false,
      enumName: null,
    })
      .notNullable()
      .defaultTo('queued');
    t.integer('attempts').unsigned().notNullable().defaultTo(0);
    t.text('last_error').nullable();
    t.string('correlation_id', 64).nullable();
    t.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    t.dateTime('updated_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));
    t.dateTime('sent_at').nullable();

    t.index(['status', 'created_at'], 'idx_outbox_status_created');
    t.index(['correlation_id'], 'idx_outbox_correlation');
  });
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('notification_outbox')) {
    await knex.schema.dropTable('notification_outbox');
  }
};
