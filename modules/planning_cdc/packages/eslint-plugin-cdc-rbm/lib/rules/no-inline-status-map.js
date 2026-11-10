'use strict';

const STATUS_KEYS = new Set([
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUBMITTED',
  'VALIDATED',
  'CANCELLED',
  'IN_PROGRESS',
  'COMPLETED',
  'PENDING',
  'NOT_APPLICABLE',
]);

/**
 * cdc-rbm/no-inline-status-map
 * Detects object literals whose keys are STATUSES values — these are often
 * inline status→color / status→label maps that should import STATUS_COLORS
 * (or similar) from @rbm/lib/enums.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Inline status→label/color maps forbidden — import from @rbm/lib/enums.',
      recommended: true,
    },
    schema: [],
    messages: {
      inlineMap:
        'Inline status map literal forbidden — import STATUS_COLORS / STATUS_LABELS from @rbm/lib/enums (CHARTER §2 Zero Hardcoded Values).',
    },
  },
  create(context) {
    return {
      ObjectExpression(node) {
        if (!node.properties || node.properties.length < 2) return;
        let statusKeyHits = 0;
        for (const p of node.properties) {
          if (p.type !== 'Property' || !p.key) continue;
          let keyName = null;
          if (p.key.type === 'Identifier') keyName = p.key.name;
          else if (p.key.type === 'Literal' && typeof p.key.value === 'string') keyName = p.key.value;
          if (keyName && STATUS_KEYS.has(keyName)) statusKeyHits += 1;
        }
        if (statusKeyHits >= 2) {
          context.report({ node, messageId: 'inlineMap' });
        }
      },
    };
  },
};
