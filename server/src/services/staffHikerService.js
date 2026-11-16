// Staff hiker search rules (MH-07).
import { getDb } from '../dao/db.js';
import * as userDao from '../dao/userDao.js';

export async function searchHikers(query) {
  return userDao.searchHikers(await getDb(), query);
}
