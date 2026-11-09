const app = require('./app');
const knex = require('knex');
const { createLogger } = require('@rbm/lib/logger');
const knexConfig = require('../knexfile');

const logger = createLogger('api-server').child({ module: 'bootstrap' });

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const envConfig = knexConfig[NODE_ENV];

if (!envConfig) {
  logger.fatal({ NODE_ENV }, 'invalid NODE_ENV');
  process.exit(1);
}

// Database connection check
const db = knex(envConfig);
let server;

// Boot-time DB connect with retry. A single transient DB hiccup at the moment
// the container (re)starts must NOT crash the process — with restart policies
// that turns into a crash-loop where api-server never becomes healthy, the
// gateway's `depends_on: service_healthy` never lets it start, and nginx-proxy
// has no upstream → permanent 502 BAD_GATEWAY for users. Retry with backoff so
// we ride out short DB unavailability instead of dying on the first failure.
const DB_CONNECT_MAX_ATTEMPTS = Number(process.env.DB_CONNECT_MAX_ATTEMPTS || 10);
const DB_CONNECT_BACKOFF_MS = Number(process.env.DB_CONNECT_BACKOFF_MS || 3000);

async function connectWithRetry() {
  for (let attempt = 1; attempt <= DB_CONNECT_MAX_ATTEMPTS; attempt += 1) {
    try {
      await db.raw('SELECT 1');
      logger.info({ attempt }, 'database connected');
      return;
    } catch (error) {
      const last = attempt === DB_CONNECT_MAX_ATTEMPTS;
      logger.warn(
        { attempt, max: DB_CONNECT_MAX_ATTEMPTS, err: error && error.message },
        last ? 'database connection failed — giving up' : 'database connection failed — retrying',
      );
      if (last) throw error;
      await new Promise((resolve) => { setTimeout(resolve, DB_CONNECT_BACKOFF_MS); });
    }
  }
}

async function startServer() {
  try {
    await connectWithRetry();

    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT, env: NODE_ENV }, 'server started');
      // Background schedulers. Each checks its own env flag; no-op otherwise.
      require('./cron/draftRemindersCron').start();
      require('./cron/quarterDeadlineReminderCron').start();
      require('./cron/reviewPendingReminderCron').start();
      require('./cron/budgetImportReminderCron').start();
      require('./cron/orgSetupReminderCron').start();
      require('./cron/approvalEscalationJob').start();
      require('./cron/highRiskAlertJob').start();
      require('./cron/dataHealthWeeklyJob').start();
      require('./cron/monthlyDigestJob').start();
    });
  } catch (error) {
    logger.fatal({ err: error && error.message }, 'database connection failed after retries');
    process.exit(1);
  }
}

// Process-level crash guards. Without these, a single unhandled promise
// rejection (e.g. from a fire-and-forget notification/event call) tears down
// the whole Express process — which surfaces to users as a 502 while the
// container restarts. Log loudly but keep serving; only a truly uncaught
// synchronous exception (undefined state) warrants a restart.
process.on('unhandledRejection', (reason) => {
  logger.error(
    { err: reason && (reason.message || String(reason)) },
    'unhandledRejection — kept process alive',
  );
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error && error.message, stack: error && error.stack }, 'uncaughtException');
  // Exit so the orchestrator restarts us into a clean state. server.close lets
  // in-flight requests drain briefly first.
  if (server) {
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 5000).unref();
  } else {
    process.exit(1);
  }
});

startServer();

function shutdown(signal) {
  logger.info({ signal }, 'shutdown requested');

  const exitWithError = (error) => {
    logger.error({ err: error && error.message }, 'shutdown error');
    process.exit(1);
  };

  const closeDb = () => db.destroy().then(() => process.exit(0)).catch(exitWithError);

  if (server) {
    server.close(() => {
      closeDb();
    });
  } else {
    closeDb();
  }

  setTimeout(() => {
    logger.error('force shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
