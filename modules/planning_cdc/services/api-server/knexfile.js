require('dotenv').config();

const baseDevelopment = {
    client: 'mysql2',
    connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD ?? 'root',
        database: process.env.DB_NAME || 'rbm_platform_dev',
        charset: 'utf8mb4',
    },
    migrations: {
        directory: './src/db/migrations',
        tableName: 'knex_migrations'
    },
    seeds: {
        directory: './src/db/seeds'
    },
    pool: {
        min: 2,
        max: 10
    }
};

const baseProduction = {
    client: 'mysql2',
    connection: {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        charset: 'utf8mb4',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    pool: {
        min: 2,
        max: 10
    },
    migrations: {
        directory: './src/db/migrations',
        tableName: 'knex_migrations'
    },
    seeds: {
        directory: './src/db/seeds'
    }
};

module.exports = {
    development: baseDevelopment,

    // Test profile mirrors development but uses a separate DB so unit/integration
    // tests never touch dev data. CI overrides DB_NAME via env var.
    test: {
        ...baseDevelopment,
        connection: {
            ...baseDevelopment.connection,
            database: process.env.DB_NAME || 'rbm_platform_test',
        },
    },

    // Staging uses the same connection shape as production (env vars required)
    // so deployments don't need a separate knexfile for each environment.
    staging: baseProduction,

    production: baseProduction,
};
