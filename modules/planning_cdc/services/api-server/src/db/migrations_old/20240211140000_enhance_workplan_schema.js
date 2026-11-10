exports.up = async function (knex) {
    const [
        hasOwner,
        hasPriority,
        hasPercent,
        hasAccountable,
        hasParent
    ] = await Promise.all([
        knex.schema.hasColumn('workplans', 'owner_user_id'),
        knex.schema.hasColumn('workplan_items', 'priority'),
        knex.schema.hasColumn('workplan_items', 'percent_complete'),
        knex.schema.hasColumn('workplan_items', 'accountable_user_id'),
        knex.schema.hasColumn('workplan_items', 'parent_id')
    ]);

    if (!hasOwner) {
        await knex.schema.alterTable('workplans', (table) => {
            table.bigInteger('owner_user_id').nullable().references('id').inTable('users');
        });
    }

    if (!hasPriority || !hasPercent || !hasAccountable || !hasParent) {
        await knex.schema.alterTable('workplan_items', (table) => {
            if (!hasParent) table.bigInteger('parent_id').nullable().references('id').inTable('workplan_items');
            if (!hasPriority) table.string('priority', 10).notNullable().defaultTo('MEDIUM');
            if (!hasAccountable) table.bigInteger('accountable_user_id').nullable().references('id').inTable('users');
            if (!hasPercent) table.decimal('percent_complete', 5, 2).notNullable().defaultTo(0);
        });
    }
};

exports.down = async function (knex) {
    const [
        hasOwner,
        hasPriority,
        hasPercent,
        hasAccountable,
        hasParent
    ] = await Promise.all([
        knex.schema.hasColumn('workplans', 'owner_user_id'),
        knex.schema.hasColumn('workplan_items', 'priority'),
        knex.schema.hasColumn('workplan_items', 'percent_complete'),
        knex.schema.hasColumn('workplan_items', 'accountable_user_id'),
        knex.schema.hasColumn('workplan_items', 'parent_id')
    ]);

    if (hasOwner) {
        await knex.schema.alterTable('workplans', (table) => {
            table.dropColumn('owner_user_id');
        });
    }

    if (hasPriority || hasPercent || hasAccountable || hasParent) {
        await knex.schema.alterTable('workplan_items', (table) => {
            if (hasPercent) table.dropColumn('percent_complete');
            if (hasAccountable) table.dropColumn('accountable_user_id');
            if (hasPriority) table.dropColumn('priority');
            if (hasParent) table.dropColumn('parent_id');
        });
    }
};
