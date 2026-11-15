// Watches git repos for new commits and pushes by reading git's own reflog files.
// Nothing to install in the repos (no hooks), and nothing leaves your machine.
//   .git/logs/HEAD                  gets a line for every commit/merge/checkout
//   .git/logs/refs/remotes/**       gets an "update by push" line when you push

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PetEvent } from './events.js';

const POLL_MS = 2000;

/** Folders where people usually keep their code; searched on first run. */
export function defaultRepoRoots(): string[] {
  const home = os.homedir();
  return ['projects', 'code', 'repos', 'src', 'dev', 'git', path.join('Documents', 'GitHub')].map((d) =>
    path.join(home, d),
  );
}

const isDir = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** A repo itself, or the repos directly inside a folder. */
export function findRepos(folders: string[]): string[] {
  const found: string[] = [];
  for (const folder of folders) {
    if (!isDir(folder)) continue;
    if (isDir(path.join(folder, '.git'))) {
      found.push(folder);
      continue;
    }
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const sub = path.join(folder, entry.name);
      if (entry.isDirectory() && isDir(path.join(sub, '.git'))) found.push(sub);
    }
  }
  return [...new Set(found.map((p) => path.resolve(p)))];
}

const sizeOf = (file: string) => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};

function readFrom(file: string, start: number, end: number): string {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(end - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/** Every file under a folder (remote branch reflogs can be nested, e.g. feature/x). */
function filesUnder(dir: string): string[] {
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filesUnder(p) : [p];
  });
}

/** Tracks how much of each log file we've already read, and returns only new lines. */
class LogTail {
  private sizes = new Map<string, number>();

  prime(file: string): void {
    this.sizes.set(file, sizeOf(file));
  }

  newLines(file: string): string[] {
    const size = sizeOf(file);
    const before = this.sizes.get(file) ?? 0;
    this.sizes.set(file, size);
    if (size <= before) return []; // unchanged, or rewritten smaller (e.g. reflog expire)
    return readFrom(file, before, size).split('\n').filter(Boolean);
  }
}

/** The action part of a reflog line: "<old> <new> Name <email> <time> <tz>\t<action>: <message>". */
const reflogAction = (line: string) => line.slice(line.indexOf('\t') + 1);

export class GitWatcher {
  private repos: string[] = [];
  private tail = new LogTail();
  private timer: NodeJS.Timeout | null = null;

  constructor(private emit: (e: PetEvent) => void) {}

  get watching(): string[] {
    return [...this.repos];
  }

  setRepos(repos: string[]): void {
    this.repos = repos.filter((r) => isDir(path.join(r, '.git')));
    // Start from the current end of each log so old history isn't celebrated.
    for (const repo of this.repos) {
      for (const file of this.logFiles(repo)) this.prime(file);
    }
    if (!this.timer) this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private primed = new Set<string>();
  private prime(file: string): void {
    if (this.primed.has(file)) return;
    this.primed.add(file);
    this.tail.prime(file);
  }

  private logFiles(repo: string): string[] {
    const logs = path.join(repo, '.git', 'logs');
    return [path.join(logs, 'HEAD'), ...filesUnder(path.join(logs, 'refs', 'remotes'))];
  }

  poll(): void {
    for (const repo of this.repos) {
      const name = path.basename(repo);
      const head = path.join(repo, '.git', 'logs', 'HEAD');
      if (!this.primed.has(head)) this.prime(head); // repo that had no commits yet

      for (const line of this.tail.newLines(head)) {
        const action = reflogAction(line);
        if (action.startsWith('commit (amend)')) this.emit({ type: 'commit', repo: name, kind: 'amend' });
        else if (action.startsWith('commit')) this.emit({ type: 'commit', repo: name, kind: 'commit' });
        else if (action.startsWith('merge ')) this.emit({ type: 'commit', repo: name, kind: 'merge' });
      }

      let pushed = false;
      for (const file of filesUnder(path.join(repo, '.git', 'logs', 'refs', 'remotes'))) {
        if (!this.primed.has(file)) {
          // A branch pushed for the first time: its reflog file is brand new.
          this.primed.add(file);
          this.tail.prime(file);
          if (readFrom(file, 0, sizeOf(file)).includes('update by push')) pushed = true;
          continue;
        }
        if (this.tail.newLines(file).some((l) => reflogAction(l).includes('update by push'))) pushed = true;
      }
      if (pushed) this.emit({ type: 'push', repo: name });
    }
  }
}
