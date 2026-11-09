'use strict';

/**
 * cdc-rbm/no-useeffect-fetch
 * Rejects data-fetching inside useEffect. Enforces P-11 (TanStack Query only).
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid useEffect(() => fetch(...) / api.*() / axios.*()). Use TanStack Query.',
      recommended: true,
    },
    schema: [],
    messages: {
      effectFetch:
        'Data fetching inside useEffect is forbidden — use TanStack Query (hooks/use<Module>Queries.js). CHARTER §4.',
    },
  },
  create(context) {
    function containsFetchCall(node) {
      let found = false;
      function walk(n) {
        if (!n || found) return;
        if (n.type === 'CallExpression') {
          const c = n.callee;
          if (c.type === 'Identifier' && c.name === 'fetch') found = true;
          if (c.type === 'MemberExpression') {
            const obj = c.object;
            if (obj.type === 'Identifier') {
              if (obj.name === 'axios') found = true;
              if (/^api[A-Z_]?/i.test(obj.name) && /^(get|post|put|delete|patch)$/.test(c.property.name || '')) {
                found = true;
              }
            }
          }
        }
        for (const key in n) {
          if (key === 'parent' || key === 'loc' || key === 'range') continue;
          const child = n[key];
          if (Array.isArray(child)) {
            for (const c of child) if (c && typeof c.type === 'string') walk(c);
          } else if (child && typeof child.type === 'string') {
            walk(child);
          }
        }
      }
      walk(node);
      return found;
    }
    return {
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'useEffect' &&
          node.arguments[0] &&
          (node.arguments[0].type === 'ArrowFunctionExpression' ||
            node.arguments[0].type === 'FunctionExpression')
        ) {
          if (containsFetchCall(node.arguments[0].body)) {
            context.report({ node, messageId: 'effectFetch' });
          }
        }
      },
    };
  },
};
