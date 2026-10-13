import { spawn, type ChildProcess } from 'node:child_process';
import 'dotenv/config';
import { environment } from '@flux/shared';

if (environment().APP_ENV !== 'development')
  throw new Error('The development launcher requires APP_ENV=development');

const children: ChildProcess[] = [];
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGTERM');
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
for (const [label, args, cwd] of [
  ['worker', ['--import', 'tsx', 'scripts/worker.ts'], process.cwd()],
  [
    'web',
    ['../../node_modules/next/dist/bin/next', 'dev'],
    `${process.cwd()}/apps/web`,
  ],
] as const) {
  const child = spawn(process.execPath, [...args], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  children.push(child);
  child.once('error', (error) => {
    console.error(`${label} could not start: ${error.message}`);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(
        `${label} stopped (${signal ?? code}); stopping development services.`,
      );
      stop(code === 0 ? 0 : 1);
    }
  });
}
