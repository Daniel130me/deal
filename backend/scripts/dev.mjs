import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tscCli = require.resolve('typescript/bin/tsc');
const children = new Set();
let shuttingDown = false;

const spawnNode = (args) => {
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
};

const stopTree = (child, signal = 'SIGTERM') => {
  if (child.exitCode !== null || child.pid === undefined) return;

  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill(signal);
  }
};

const stopAll = (signal = 'SIGTERM') => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) stopTree(child, signal);
};

const initialBuild = spawnNode([tscCli, '-p', 'tsconfig.build.json']);
const buildExitCode = await new Promise((resolve) => initialBuild.once('exit', resolve));
if (buildExitCode !== 0) process.exit(buildExitCode ?? 1);

const compiler = spawnNode([
  tscCli,
  '-p',
  'tsconfig.build.json',
  '--watch',
  '--preserveWatchOutput',
]);
const server = spawnNode([
  '--env-file-if-exists=.env',
  '--watch-path=dist',
  '--watch-preserve-output',
  '--enable-source-maps',
  'dist/main.js',
]);

for (const [name, child] of [['compiler', compiler], ['server', server]]) {
  child.on('error', (error) => {
    console.error(`[backend:dev] Failed to start ${name}:`, error);
    process.exitCode = 1;
    stopAll();
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(`[backend:dev] ${name} stopped with ${reason}.`);
    process.exitCode = code ?? 1;
    stopAll();
  });
}

process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));
