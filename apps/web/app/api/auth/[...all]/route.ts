import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '../../../../lib/server';
import { authenticationHandler } from '../../../../../../packages/observability/src/authentication';
const handlers = toNextJsHandler(auth);
export const GET = authenticationHandler(handlers.GET);
export const POST = authenticationHandler(handlers.POST);
export const runtime = 'nodejs';
