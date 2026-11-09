const { z } = require('zod');

// ── Auth schemas ──
//
// All auth boundaries validate against these schemas before any business
// logic runs. The schemas live in `@rbm/schemas` so the api-server and the
// future native client(s) share the exact same contract. Sign-in is
// Microsoft only: there is no password schema (D-20261107-03).

const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'refreshToken is required'),
});

module.exports = {
  refreshSchema,
};
