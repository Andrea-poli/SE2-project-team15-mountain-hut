// /api/public/slots/:id/availability – public availability check of one slot
// Owner: MH-04 BE1 Check availability APIs. Router mounted by app.js.
import { Router } from 'express';

const router = Router({ mergeParams: true });

export default router;
