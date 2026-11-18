// Staff hiker search rules (MH-07).
import { getDb } from '../dao/db.js';
import * as userDao from '../dao/userDao.js';
import { BadRequest } from '../errors.js';

export const MESSAGES = {
  invalidQuery: 'Type at least 2 characters to search',
};

const isValidQuery = (query) =>
  typeof query === 'string' && query.trim().length >= 2;

/**
 * Query of GET /api/staff/hikers → trimmed search text, or 400.
 * Must be at least 2 characters after trimming (openapi.yaml).
 */
export function validateSearchQuery(query) {
  if (!isValidQuery(query)) throw new BadRequest(MESSAGES.invalidQuery);
  return query.trim();
}

/**
 * Search hiker profiles for the staff panel (MH-07).
 * Validates the query, then delegates to the DAO.
 * @throws {BadRequest} missing or too short query
 */
export async function searchHikers(query) {
  const q = validateSearchQuery(query);
  return userDao.searchHikers(await getDb(), q);
}
