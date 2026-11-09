// ── Performance indexes ──
//
// Adds indexes on the hottest tables (`plan_nodes`, `indicator_broad_links`,
// `activity_reports`, `indicator_reports`, `users`) to speed up the most
// common queries the api-server runs:
//
//   - filter by node_type, parent_id, fiscal_year, responsible_division_code,
//     linked_indicator_id, tier_id (single-column indexes)
//   - composite (node_type, fiscal_year) for the workplan list view
//   - junction-table indexes on indicator_broad_links so the join is sargable
//   - (plan_node_id, quarter, fiscal_year) on the report tables for the
//     M&E aggregation queries
//   - users.division_code so focal-point filtering is O(log n)
//
// MIGRATION SAFETY:
// Every alter is idempotent — wrapped by `checkIndex(...)` which calls
// `SHOW INDEX FROM <table> WHERE Key_name = ?`. Re-running the migration is
// a no-op. The down migration drops every index that the up migration created.
//
// PERFORMANCE NOTE:
// On MySQL 8 / MariaDB, `CREATE INDEX` on a populated table is an online DDL
// operation by default — no table lock, only a brief metadata lock. Safe to
// run on a live DB.

const checkIndex = async (knex, table, idxName) => {
    const rows = await knex.raw('SHOW INDEX FROM ?? WHERE Key_name = ?', [table, idxName]);
    return rows[0].length > 0;
};

const addIndex = async (knex, table, columns, idxName) => {
    if (await checkIndex(knex, table, idxName)) return;
    await knex.schema.alterTable(table, (t) => {
        t.index(columns, idxName);
    });
};

const dropIndexSafe = async (knex, table, idxName) => {
    try {
        if (await checkIndex(knex, table, idxName)) {
            await knex.schema.alterTable(table, (t) => {
                t.dropIndex([], idxName);
            });
        }
    } catch (_err) {
        // Index may not exist or table may have been dropped — best-effort.
    }
};

exports.up = async function up(knex) {
    // ── plan_nodes ──
    if (await knex.schema.hasTable('plan_nodes')) {
        await addIndex(knex, 'plan_nodes', 'node_type', 'idx_plan_nodes_node_type');
        // parent_id, tier_id, linked_indicator_id, responsible_division_code
        // already have FK or MUL indexes from the original schema, but the
        // names are not deterministic — re-add ours only if absent so we have
        // a stable handle for the down migration.
        await addIndex(knex, 'plan_nodes', 'parent_id', 'idx_plan_nodes_parent_id');
        await addIndex(knex, 'plan_nodes', 'responsible_division_code', 'idx_plan_nodes_responsible_division');
        await addIndex(knex, 'plan_nodes', 'fiscal_year', 'idx_plan_nodes_fiscal_year');
        await addIndex(knex, 'plan_nodes', 'linked_indicator_id', 'idx_plan_nodes_linked_indicator');
        await addIndex(knex, 'plan_nodes', 'tier_id', 'idx_plan_nodes_tier_id');
        // Composite — covers the most common query: list all nodes of a type
        // for a given fiscal year.
        await addIndex(knex, 'plan_nodes', ['node_type', 'fiscal_year'], 'idx_plan_nodes_type_year');
    }

    // ── indicator_broad_links (M2M junction) ──
    if (await knex.schema.hasTable('indicator_broad_links')) {
        await addIndex(knex, 'indicator_broad_links', 'indicator_id', 'idx_ibl_indicator');
        await addIndex(knex, 'indicator_broad_links', 'broad_activity_id', 'idx_ibl_broad');
    }

    // ── activity_reports ──
    if (await knex.schema.hasTable('activity_reports')) {
        if (await knex.schema.hasColumn('activity_reports', 'plan_node_id')) {
            await addIndex(knex, 'activity_reports', 'plan_node_id', 'idx_ar_plan_node');
        }
        if (
            (await knex.schema.hasColumn('activity_reports', 'quarter')) &&
            (await knex.schema.hasColumn('activity_reports', 'fiscal_year'))
        ) {
            await addIndex(knex, 'activity_reports', ['quarter', 'fiscal_year'], 'idx_ar_quarter_year');
        }
    }

    // ── indicator_reports ──
    if (await knex.schema.hasTable('indicator_reports')) {
        if (await knex.schema.hasColumn('indicator_reports', 'plan_node_id')) {
            await addIndex(knex, 'indicator_reports', 'plan_node_id', 'idx_ir_plan_node');
        }
        if (
            (await knex.schema.hasColumn('indicator_reports', 'quarter')) &&
            (await knex.schema.hasColumn('indicator_reports', 'fiscal_year'))
        ) {
            await addIndex(knex, 'indicator_reports', ['quarter', 'fiscal_year'], 'idx_ir_quarter_year');
        }
    }

    // ── users ──
    if (await knex.schema.hasTable('users')) {
        if (await knex.schema.hasColumn('users', 'division_code')) {
            await addIndex(knex, 'users', 'division_code', 'idx_users_division');
        }
    }
};

exports.down = async function down(knex) {
    // Drop in reverse order of creation.
    await dropIndexSafe(knex, 'users', 'idx_users_division');

    await dropIndexSafe(knex, 'indicator_reports', 'idx_ir_quarter_year');
    await dropIndexSafe(knex, 'indicator_reports', 'idx_ir_plan_node');

    await dropIndexSafe(knex, 'activity_reports', 'idx_ar_quarter_year');
    await dropIndexSafe(knex, 'activity_reports', 'idx_ar_plan_node');

    await dropIndexSafe(knex, 'indicator_broad_links', 'idx_ibl_broad');
    await dropIndexSafe(knex, 'indicator_broad_links', 'idx_ibl_indicator');

    await dropIndexSafe(knex, 'plan_nodes', 'idx_plan_nodes_type_year');
    await dropIndexSafe(knex, 'plan_nodes', 'idx_plan_nodes_tier_id');
    await dropIndexSafe(knex, 'plan_nodes', 'idx_plan_nodes_linked_indicator');
    await dropIndexSafe(knex, 'plan_nodes', 'idx_plan_nodes_fiscal_year');
    await dropIndexSafe(knex, 'plan_nodes', 'idx_plan_nodes_responsible_division');
    await dropIndexSafe(knex, 'plan_nodes', 'idx_plan_nodes_parent_id');
    await dropIndexSafe(knex, 'plan_nodes', 'idx_plan_nodes_node_type');
};
