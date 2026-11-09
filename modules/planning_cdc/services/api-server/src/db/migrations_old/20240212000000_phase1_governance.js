exports.up = async function (knex) {
  const has = async (tbl, col) => knex.schema.hasColumn(tbl, col);

  if (!(await knex.schema.hasTable('audit_events'))) {
    await knex.schema.createTable('audit_events', (table) => {
      table.bigIncrements('id').primary();
      table.string('entity_type', 50).notNullable();
      table.bigInteger('entity_id').unsigned().notNullable();
      table.string('action', 50).notNullable();
      table.bigInteger('user_id').unsigned().references('id').inTable('users');
      table.json('old_values');
      table.json('new_values');
      table.string('ip_address', 45);
      table.text('user_agent');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['entity_type', 'entity_id']);
      table.index('created_at');
    });
  }

  if (!(await knex.schema.hasTable('notifications'))) {
    await knex.schema.createTable('notifications', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').unsigned().notNullable().references('id').inTable('users');
      table.string('type', 50).notNullable();
      table.string('title', 255).notNullable();
      table.text('message');
      table.string('entity_type', 50);
      table.bigInteger('entity_id').unsigned();
      table.boolean('is_read').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['user_id', 'is_read']);
      table.index('created_at');
    });
  }

  if (!(await knex.schema.hasTable('comments'))) {
    await knex.schema.createTable('comments', (table) => {
      table.bigIncrements('id').primary();
      table.string('entity_type', 50).notNullable();
      table.bigInteger('entity_id').unsigned().notNullable();
      table.bigInteger('user_id').unsigned().notNullable().references('id').inTable('users');
      table.bigInteger('parent_comment_id').unsigned().references('id').inTable('comments');
      table.text('content').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['entity_type', 'entity_id']);
    });
  }

  if (!(await knex.schema.hasTable('approval_templates'))) {
    await knex.schema.createTable('approval_templates', (table) => {
      table.bigIncrements('id').primary();
      table.string('entity_type', 50).notNullable();
      table.string('name', 255).notNullable();
      table.text('description');
      table.bigInteger('business_unit_id').unsigned().references('id').inTable('business_units');
      table.json('steps_config').notNullable();
      table.boolean('is_default').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['entity_type', 'business_unit_id']);
    });
  }

  if (!(await has('roles', 'description')))
    await knex.schema.alterTable('roles', (t) => t.text('description'));
  if (!(await has('roles', 'permissions')))
    await knex.schema.alterTable('roles', (t) => t.json('permissions'));

  if (!(await has('users', 'avatar_url')))
    await knex.schema.alterTable('users', (t) => t.string('avatar_url', 500));
  if (!(await has('users', 'phone')))
    await knex.schema.alterTable('users', (t) => t.string('phone', 50));
  if (!(await has('users', 'last_login_at')))
    await knex.schema.alterTable('users', (t) => t.timestamp('last_login_at'));

  if (!(await has('user_roles', 'scope_business_unit_id')))
    await knex.schema.alterTable('user_roles', (t) =>
      t.bigInteger('scope_business_unit_id').unsigned().references('id').inTable('business_units')
    );

  if (!(await has('approval_instances', 'version_no')))
    await knex.schema.alterTable('approval_instances', (t) => t.integer('version_no').defaultTo(1));
  if (!(await has('approval_instances', 'decision_summary')))
    await knex.schema.alterTable('approval_instances', (t) => t.text('decision_summary'));
  if (!(await has('approval_instances', 'current_step_no')))
    await knex.schema.alterTable('approval_instances', (t) => t.integer('current_step_no').defaultTo(1));

  if (!(await has('approval_steps', 'role_code')))
    await knex.schema.alterTable('approval_steps', (t) => t.string('role_code', 50));
  if (!(await has('approval_steps', 'label')))
    await knex.schema.alterTable('approval_steps', (t) => t.string('label', 100));

  if (!(await has('version_snapshots', 'label')))
    await knex.schema.alterTable('version_snapshots', (t) => t.string('label', 255));
  if (!(await has('version_snapshots', 'change_summary')))
    await knex.schema.alterTable('version_snapshots', (t) => t.text('change_summary'));
  if (!(await has('version_snapshots', 'approval_instance_id')))
    await knex.schema.alterTable('version_snapshots', (t) =>
      t.bigInteger('approval_instance_id').unsigned().references('id').inTable('approval_instances')
    );

  if (!(await has('strategic_plans', 'current_version_no')))
    await knex.schema.alterTable('strategic_plans', (t) => t.integer('current_version_no').defaultTo(1));
  if (!(await has('programs', 'current_version_no')))
    await knex.schema.alterTable('programs', (t) => t.integer('current_version_no').defaultTo(1));
  if (!(await has('projects', 'current_version_no')))
    await knex.schema.alterTable('projects', (t) => t.integer('current_version_no').defaultTo(1));
  if (!(await has('projects', 'priority')))
    await knex.schema.alterTable('projects', (t) => t.string('priority', 20).defaultTo('MEDIUM'));
};

exports.down = async function (knex) {
  const drop = async (tbl, col) => {
    if (await knex.schema.hasColumn(tbl, col))
      await knex.schema.alterTable(tbl, (t) => t.dropColumn(col));
  };

  await drop('projects', 'priority');
  await drop('projects', 'current_version_no');
  await drop('programs', 'current_version_no');
  await drop('strategic_plans', 'current_version_no');
  await drop('version_snapshots', 'approval_instance_id');
  await drop('version_snapshots', 'change_summary');
  await drop('version_snapshots', 'label');
  await drop('approval_steps', 'label');
  await drop('approval_steps', 'role_code');
  await drop('approval_instances', 'current_step_no');
  await drop('approval_instances', 'decision_summary');
  await drop('approval_instances', 'version_no');
  await drop('user_roles', 'scope_business_unit_id');
  await drop('users', 'last_login_at');
  await drop('users', 'phone');
  await drop('users', 'avatar_url');
  await drop('roles', 'permissions');
  await drop('roles', 'description');

  await knex.schema.dropTableIfExists('approval_templates');
  await knex.schema.dropTableIfExists('comments');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('audit_events');
};
