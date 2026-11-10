'use strict';

/**
 * cdc-rbm/require-invalidate-queries
 * Heuristic: useMutation() calls without any invalidateQueries reference in the
 * onSuccess/onSettled handlers generate a WARN. Enforces the CHARTER §3 mutation
 * rule "Mutations always invalidateQueries the affected queryKey(s) on onSuccess".
 */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'useMutation should invalidateQueries on success to keep cache fresh.',
      recommended: true,
    },
    schema: [],
    messages: {
      missingInvalidate:
        'useMutation missing invalidateQueries — stale UI risk (CHARTER §3). Add queryClient.invalidateQueries in onSuccess.',
    },
  },
  create(context) {
    function containsIdentifier(node, name) {
      if (!node) return false;
      let found = false;
      (function walk(n) {
        if (!n || found) return;
        if (n.type === 'Identifier' && n.name === name) {
          found = true;
          return;
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
      })(node);
      return found;
    }
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'useMutation') {
          const arg = node.arguments[0];
          if (!arg) return;
          if (!containsIdentifier(arg, 'invalidateQueries')) {
            context.report({ node, messageId: 'missingInvalidate' });
          }
        }
      },
    };
  },
};
