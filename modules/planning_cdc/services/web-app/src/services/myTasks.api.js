import httpClient from './api';

/**
 * The signed-in user's to-do inbox (the bell of the top bar), computed by the
 * aggregator of `routes/meRoutes.js`.
 *
 * @example const { data } = await myTasksApi.list(); // data.tasks
 */
export const myTasksApi = {
  list: () => httpClient.get('/me/tasks'),
};
