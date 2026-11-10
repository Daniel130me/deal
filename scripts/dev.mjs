import { spawn } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error('npm_execpath is unavailable; start the project with `npm run dev`.');
}
const services = [
  { name: 'frontend', script: 'dev:frontend' },
  { name: 'backend', script: 'dev:backend' },
];

const children = new Map();
let shuttingDown = false;
let shutdownPromise;

const stopChild = (child, signal) =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.pid === undefined) {
      resolve();
      return;
    }

    if (process.platform === 'win32') {
      // Windows signals do not cascade through npm's process tree. Wait for
      // taskkill so this supervisor cannot exit while descendants still own
      // the terminal or development ports.
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
      killer.once('error', resolve);
      killer.once('exit', resolve);
      return;
    }

    child.once('exit', resolve);
    child.kill(signal);
  });

const stopAll = (signal = 'SIGTERM') => {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = Promise.all([...children.values()].map((child) => stopChild(child, signal))).then(
    () => undefined,
  );
  return shutdownPromise;
};

const shutdownAndExit = async (exitCode, signal = 'SIGTERM') => {
  await stopAll(signal);
  process.exit(exitCode);
};

for (const service of services) {
  // Invoke npm's JavaScript entry point through the current Node executable.
  // This avoids shell parsing and works consistently with .cmd shims on Windows.
  const child = spawn(process.execPath, [npmCli, 'run', service.script], {
    stdio: 'inherit',
    env: process.env,
  });
  children.set(service.name, child);

  child.on('error', (error) => {
    console.error(`[dev] Failed to start ${service.name}:`, error);
    void shutdownAndExit(1);
  });

  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
      console.error(`[dev] ${service.name} stopped with ${reason}; stopping the other service.`);
      void shutdownAndExit(code ?? 1);
    }
  });
}

process.on('SIGINT', () => void shutdownAndExit(0, 'SIGINT'));
process.on('SIGTERM', () => void shutdownAndExit(0, 'SIGTERM'));
