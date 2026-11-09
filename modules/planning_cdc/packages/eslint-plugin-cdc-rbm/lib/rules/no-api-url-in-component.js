'use strict';

/**
 * cdc-rbm/no-api-url-in-component
 * Forbids hardcoded URLs (string starting with '/' or 'http') passed to
 * api.*, axios.*, fetch() inside files under pages/, components/, hooks/.
 * All URLs must live in src/services/*.api.js.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'No hardcoded URL strings in pages/components/hooks — use services/*.api.js.',
      recommended: true,
    },
    schema: [],
    messages: {
      urlInComponent:
        'Hardcoded URL in {{location}} — move it to services/*.api.js (CHARTER §8).',
    },
  },
  create(context) {
    const filename = context.getFilename();
    const inComponent = /\/(pages|components|hooks)\//.test(filename) && /\.(js|jsx)$/.test(filename);
    if (!inComponent) return {};

    function isApiCall(callee) {
      if (!callee) return false;
      if (callee.type === 'Identifier' && callee.name === 'fetch') return true;
      if (callee.type === 'MemberExpression') {
        const obj = callee.object;
        const prop = callee.property;
        if (!prop || !prop.name) return false;
        if (!/^(get|post|put|delete|patch|request)$/.test(prop.name)) return false;
        if (obj.type === 'Identifier' && (obj.name === 'axios' || /^api[A-Za-z_]*$/.test(obj.name))) return true;
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (!isApiCall(node.callee)) return;
        const first = node.arguments[0];
        if (!first) return;
        if (
          first.type === 'Literal' &&
          typeof first.value === 'string' &&
          /^(\/|https?:)/.test(first.value)
        ) {
          context.report({
            node,
            messageId: 'urlInComponent',
            data: { location: filename.replace(context.getCwd?.() || '', '') },
          });
        }
      },
    };
  },
};
