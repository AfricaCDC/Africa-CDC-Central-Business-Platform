import { planNodesApi } from '@/services/planNodes.api';
import { getErrorMessage } from '@/utils/errorMessage';

/**
 * Title of the activity held in one place: the place is appended once.
 *
 * @param {string} title
 * @param {string} place
 * @returns {string}
 * @example titleForPlace('Training of trainers', 'Kenya') // 'Training of trainers — Kenya'
 */
export function titleForPlace(title, place) {
  const suffix = ` — ${place}`;
  return title.endsWith(suffix) ? title : `${title}${suffix}`;
}

/**
 * One activity per extra place (D-20261028-01): each copy is created through
 * the normal create route (same checks and rights) with the budget of its place,
 * gets the screening and the cost lines of its place, and is submitted when the
 * main one is.
 *
 * @param {{ payloadFor: (place: string) => object, places: string[], savePlanning: (id: number, place: string) => Promise<void>, submit: boolean }} p
 * @returns {Promise<{ created: object[], failed: Array<{ place: string, message: string }> }>}
 * @example await createPlaceCopies({ payloadFor, places: ['Uganda'], savePlanning: plan.save, submit: false });
 */
export async function createPlaceCopies({ payloadFor, places, savePlanning, submit }) {
  const created = [];
  const failed = [];
  // ponytail: one request per place, in sequence; a server-side batch if lists grow long.
  for (const place of places) {
    try {
      const payload = payloadFor(place);
      const { data } = await planNodesApi.createSpecific({ ...payload, location: place, title: titleForPlace(payload.title, place) });
      await savePlanning(data.id, place);
      if (submit) await planNodesApi.submitSpecific(data.id);
      created.push(data);
    } catch (err) {
      failed.push({ place, message: getErrorMessage(err, 'Could not create the activity') });
    }
  }
  return { created, failed };
}
