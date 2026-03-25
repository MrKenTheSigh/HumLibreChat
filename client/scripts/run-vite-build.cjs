const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TEMP_ENV_KEYS = ['TMPDIR', 'TMP', 'TEMP'];
const WSL_TEMP_DIR = '/tmp';

const isMountedWindowsPath = (value) => /^\/mnt\/[a-z]\//i.test(value);

const isWslEnvironment = () =>
  process.platform === 'linux' &&
  (os.release().toLowerCase().includes('microsoft') || 'WSL_DISTRO_NAME' in process.env);

const getNormalizedEnv = () => {
  const env = { ...process.env };
  const inheritedTempDir = os.tmpdir();
  const shouldNormalizeTemp =
    isWslEnvironment() &&
    (isMountedWindowsPath(inheritedTempDir) ||
      TEMP_ENV_KEYS.some((key) => isMountedWindowsPath(env[key] ?? '')));

  if (!shouldNormalizeTemp) {
    return env;
  }

  for (const key of TEMP_ENV_KEYS) {
    env[key] = WSL_TEMP_DIR;
  }

  console.log(
    `[build] Detected Windows-mounted temp dir (${inheritedTempDir}). Using ${WSL_TEMP_DIR} for Vite build.`,
  );

  return env;
};

const viteBinary = path.join(__dirname, '..', 'node_modules', '.bin', 'vite');
const viteArgs = ['build', ...process.argv.slice(2)];

const child = spawn(viteBinary, viteArgs, {
  stdio: 'inherit',
  env: getNormalizedEnv(),
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('[build] Failed to launch Vite build.', error);
  process.exit(1);
});
