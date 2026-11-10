exports.up = async function (knex) {
    const [hasParent, hasLevel, hasDisplay] = await Promise.all([
        knex.schema.hasColumn('strategic_objectives', 'parent_id'),
        knex.schema.hasColumn('strategic_objectives', 'level_index'),
        knex.schema.hasColumn('strategic_objectives', 'display_order')
    ]);

    if (!hasParent || !hasLevel || !hasDisplay) {
        await knex.schema.alterTable('strategic_objectives', (table) => {
            if (!hasParent) table.bigInteger('parent_id').nullable().references('id').inTable('strategic_objectives');
            if (!hasLevel) table.integer('level_index').notNullable().defaultTo(1);
            if (!hasDisplay) table.integer('display_order').notNullable().defaultTo(0);
        });
    }
};

exports.down = async function (knex) {
    const [hasParent, hasLevel, hasDisplay] = await Promise.all([
        knex.schema.hasColumn('strategic_objectives', 'parent_id'),
        knex.schema.hasColumn('strategic_objectives', 'level_index'),
        knex.schema.hasColumn('strategic_objectives', 'display_order')
    ]);

    if (hasParent || hasLevel || hasDisplay) {
        await knex.schema.alterTable('strategic_objectives', (table) => {
            if (hasDisplay) table.dropColumn('display_order');
            if (hasLevel) table.dropColumn('level_index');
            if (hasParent) table.dropColumn('parent_id');
        });
    }
};
