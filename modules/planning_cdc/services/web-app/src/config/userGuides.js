// User guides served by the web app from public/guides/ (D-20261105-03).
// The PDFs are built in docs/manual and copied there (docs/manual/README.md).
// Bump `version` with the guides: it busts the browser cache of the PDF.
// The HTML of each guide sits next to its PDF; the Help link opens it on the
// chapter of the page (`#ch-N`, D-20261106-04). `roles` = who the guide is for.

import { ROLES } from '@rbm/lib/roles';
import { withBase } from '@/utils/basePath';

export const USER_GUIDES_VERSION = '1.9';

export const USER_GUIDES = Object.freeze([
  {
    key: 'focal',
    title: 'Focal Person Guide',
    audience: 'Plan specific activities, follow their approval, write activity and indicator reports.',
    file: 'RBM-Focal-Person-Guide.pdf',
    roles: [ROLES.FOCAL_PERSON, ROLES.STAFF],
  },
  {
    key: 'responsible',
    title: 'Responsible Person of the Business Unit Guide',
    audience: 'Approve or reject the activities and reports of your Business Unit.',
    file: 'RBM-Responsible-Person-Guide.pdf',
    roles: [ROLES.HEAD_OF_DIVISION, ROLES.DIRECTOR],
  },
  {
    key: 'me',
    title: 'M&E Guide',
    audience: 'PIRS, activity mapping, follow every Business Unit, sign off indicator reports.',
    file: 'RBM-ME-Guide.pdf',
    roles: [ROLES.ME_OFFICER, ROLES.RBM_ADMIN, ROLES.SYSTEM_ADMIN],
  },
]);

/**
 * Public URL of a guide PDF, with the version as cache buster.
 *
 * @param {{ file: string }} guide
 * @returns {string}
 * @example guideUrl(USER_GUIDES[0]) // '/guides/RBM-Focal-Person-Guide.pdf?v=1.2'
 */
export const guideUrl = (guide) => `${withBase('/guides')}/${guide.file}?v=${USER_GUIDES_VERSION}`;

/**
 * Public URL of a guide in HTML, opened on one chapter.
 *
 * @param {{ file: string }} guide
 * @param {string|number} chapter
 * @returns {string}
 * @example guideChapterUrl(USER_GUIDES[0], 7) // '/guides/RBM-Focal-Person-Guide.html?v=1.4#ch-7'
 */
export const guideChapterUrl = (guide, chapter) => `${withBase('/guides')}/${guide.file.replace(/\.pdf$/, '.html')}?v=${USER_GUIDES_VERSION}#ch-${chapter}`;
