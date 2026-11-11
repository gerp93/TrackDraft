import { ChildProcess, spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AceStepServerStatus } from '../../shared/types/songTake';
import { getAiSettings } from './aiConfig';
import { aceStepHealth } from './aceStepProvider';

/**
 * Starts and stops a local ACE-Step API server on the user's behalf, from the ACE-Step
 * install folder set in Settings. Only a server this app started is ever stopped -- one
 * the user launched themselves is used as-is and left alone.
 */

/** Loading Python + torch takes a while even before the port opens; models load lazily after. */
const STARTUP_TIMEOUT_MS = 3 * 60 * 1000;
const HEALTH_POLL_MS = 1000;
const OUTPUT_TAIL_LINES = 15;

let child: ChildProcess | null = null;
let starting: Promise<void> | null = null;
let outputTail: string[] = [];
let lastError: string | null = null;

function rememberOutput(chunk: Buffer): void {
  const lines = chunk.toString('utf-8').split(/\r?\n/).filter((l) => l.trim());
  outputTail = [...outputTail, ...lines].slice(-OUTPUT_TAIL_LINES);
}

interface LaunchCommand {
  command: string;
  args: string[];
  shell: boolean;
}

/** Picks how to run the server from an install folder: the venv `uv sync` created, the
 * portable package's embedded Python, or `uv run` as a last resort (needs uv on PATH). */
function resolveLaunchCommand(dir: string): LaunchCommand {
  const isWin = process.platform === 'win32';
  const venvScript = isWin
    ? path.join(dir, '.venv', 'Scripts', 'acestep-api.exe')
    : path.join(dir, '.venv', 'bin', 'acestep-api');
  if (fs.existsSync(venvScript)) return { command: venvScript, args: [], shell: false };

  const embeddedPython = path.join(dir, 'python_embedded', 'python.exe');
  if (isWin && fs.existsSync(embeddedPython)) {
    return { command: embeddedPython, args: ['-m', 'acestep.api_server'], shell: false };
  }

  return { command: 'uv', args: ['run', 'acestep-api'], shell: isWin };
}

/** Host and port to bind, taken from the configured URL -- or null when that URL points
 * at another machine, which this app can't start a server on. */
function localBindTarget(baseUrl: string): { host: string; port: string } | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) return null;
  return { host: host === 'localhost' ? '127.0.0.1' : host, port: url.port || '80' };
}

async function isReachable(baseUrl: string): Promise<boolean> {
  try {
    await aceStepHealth(baseUrl);
    return true;
  } catch {
    return false;
  }
}

export function looksLikeAceStepDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'acestep'));
}

export async function getAceStepServerStatus(): Promise<AceStepServerStatus> {
  const settings = getAiSettings();
  const reachable = await isReachable(settings.aceStepBaseUrl);
  if (reachable) lastError = null;
  return {
    reachable,
    starting: starting !== null,
    managed: child !== null,
    canStart: Boolean(settings.aceStepDir.trim()) && localBindTarget(settings.aceStepBaseUrl) !== null,
    lastError,
  };
}

async function launch(): Promise<void> {
  const settings = getAiSettings();
  const dir = settings.aceStepDir.trim();
  if (!dir) {
    throw new Error('Set the ACE-Step folder in Settings so TrackDraft can start the server.');
  }
  if (!looksLikeAceStepDir(dir)) {
    throw new Error(`"${dir}" doesn't look like an ACE-Step folder (no "acestep" folder inside).`);
  }
  const target = localBindTarget(settings.aceStepBaseUrl);
  if (!target) {
    throw new Error('The ACE-Step URL points at another machine -- TrackDraft can only start a server on this one.');
  }

  const { command, args, shell } = resolveLaunchCommand(dir);
  outputTail = [];
  const proc = spawn(command, [...args, '--host', target.host, '--port', target.port], {
    cwd: dir,
    shell,
    windowsHide: true,
    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child = proc;
  proc.stdout?.on('data', rememberOutput);
  proc.stderr?.on('data', rememberOutput);

  let exited = false;
  let spawnError: Error | null = null;
  proc.on('error', (err) => {
    spawnError = err;
    exited = true;
    if (child === proc) child = null;
  });
  proc.on('exit', () => {
    exited = true;
    if (child === proc) child = null;
  });

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS));
    if (exited) {
      const detail = spawnError ? (spawnError as Error).message : outputTail.slice(-4).join(' | ');
      throw new Error(`The ACE-Step server stopped while starting${detail ? `: ${detail}` : '.'}`);
    }
    if (await isReachable(settings.aceStepBaseUrl)) return;
    if (Date.now() > deadline) {
      stopAceStepServer();
      throw new Error('The ACE-Step server did not come up within 3 minutes.');
    }
  }
}

/** Makes sure a server is answering: returns at once if one already is, otherwise starts
 * one and resolves when it's ready. Concurrent callers share the same startup. */
export async function ensureAceStepServer(): Promise<void> {
  if (await isReachable(getAiSettings().aceStepBaseUrl)) return;
  if (!starting) {
    lastError = null;
    starting = launch()
      .catch((err) => {
        lastError = err instanceof Error ? err.message : String(err);
        throw err;
      })
      .finally(() => {
        starting = null;
      });
  }
  return starting;
}

/** Stops the server this app started, if any. Synchronous so it can run while quitting. */
export function stopAceStepServer(): void {
  const proc = child;
  child = null;
  if (!proc || proc.pid === undefined) return;
  if (process.platform === 'win32') {
    // The server spawns workers (and, via `uv run`, sits under a wrapper); kill the tree.
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
  } else {
    proc.kill('SIGTERM');
  }
}
