'use strict';

const noUseeffectFetch = require('./rules/no-useeffect-fetch');
const requireInvalidateQueries = require('./rules/require-invalidate-queries');
const noInlineStatusMap = require('./rules/no-inline-status-map');
const noApiUrlInComponent = require('./rules/no-api-url-in-component');

module.exports = {
  rules: {
    'no-useeffect-fetch': noUseeffectFetch,
    'require-invalidate-queries': requireInvalidateQueries,
    'no-inline-status-map': noInlineStatusMap,
    'no-api-url-in-component': noApiUrlInComponent,
  },
  configs: {
    recommended: {
      plugins: ['cdc-rbm'],
      rules: {
        'cdc-rbm/no-useeffect-fetch': 'error',
        'cdc-rbm/require-invalidate-queries': 'warn',
        'cdc-rbm/no-inline-status-map': 'error',
        'cdc-rbm/no-api-url-in-component': 'error',
      },
    },
  },
};
