'use strict';
/**
 * Crash-safe JSON storage for the main process.
 *
 * Each save writes a temporary file and renames it over the real one, so the
 * data file is never half-written. The previous version is kept as a `.bak`
 * copy, and one snapshot per day is kept in `backups/` (the last 14 days).
 * If the main file is ever unreadable it is set aside, never overwritten, and
 * the backup is used instead.
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MAX_BYTES = 50 * 1024 * 1024;
const DAILY_BACKUPS_TO_KEEP = 14;

function isValidJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * Rename `from` over `to`, but only while `stillLatest()` is true. The check
 * and the rename run in the same synchronous step, so a newer synchronous
 * save (the one made while the window closes) can never be overwritten by an
 * older queued one. Windows can briefly lock files (antivirus, indexing), so
 * locked renames are retried a few times.
 * @returns {Promise<boolean>} false when a newer save made this one unnecessary
 */
async function renameIfLatest(from, to, stillLatest) {
  for (let attempt = 0; ; attempt++) {
    if (!stillLatest()) return false;
    try {
      fs.renameSync(from, to);
      return true;
    } catch (err) {
      if (attempt >= 5 || !err || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
}

function localDateStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

class JsonStore {
  /**
   * @param {string} dir Folder that holds the data file.
   * @param {{ fileName?: string, log?: (msg: string) => void }} [options]
   */
  constructor(dir, options = {}) {
    this.dir = dir;
    this.file = path.join(dir, options.fileName || 'even-keel-data.json');
    this.backupFile = `${this.file}.bak`;
    this.backupDir = path.join(dir, 'backups');
    this.log = options.log || (() => {});
    this.seq = 0;
    this.pending = 0;
    this.queue = Promise.resolve();
  }

  /** @returns {{ json: string | null, recoveredFromBackup?: boolean, error?: string }} */
  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    const main = this.readIfValid(this.file);
    if (main.ok) return { json: main.text };

    if (main.exists) {
      // Keep the unreadable file for inspection instead of overwriting it.
      const aside = this.file.replace(/\.json$/, `.unreadable-${Date.now()}.json`);
      try {
        fs.renameSync(this.file, aside);
        this.log(`Data file was unreadable; moved to ${aside}`);
      } catch (err) {
        this.log(`Could not move unreadable data file: ${err}`);
      }
    }

    const backup = this.readIfValid(this.backupFile);
    if (backup.ok) {
      this.log('Loaded data from backup copy.');
      return { json: backup.text, recoveredFromBackup: true };
    }
    if (main.exists) {
      return { json: null, error: 'Your saved data could not be read, and no backup was available. A copy was kept in the data folder.' };
    }
    return { json: null };
  }

  readIfValid(file) {
    try {
      const stat = fs.statSync(file);
      if (stat.size > MAX_BYTES) return { ok: false, exists: true };
      const text = fs.readFileSync(file, 'utf8');
      return isValidJsonObject(text) ? { ok: true, exists: true, text } : { ok: false, exists: true };
    } catch (err) {
      return { ok: false, exists: err && err.code !== 'ENOENT' };
    }
  }

  validate(json) {
    if (typeof json !== 'string') return 'Nothing to save.';
    if (json.length > MAX_BYTES) return 'Data is too large to save.';
    if (!isValidJsonObject(json)) return 'Data was not valid.';
    return null;
  }

  /** Queue an asynchronous save. Later saves always win over earlier ones. */
  save(json) {
    const problem = this.validate(json);
    if (problem) return Promise.resolve({ ok: false, error: problem });
    const seq = ++this.seq;
    this.pending++;
    const run = async () => {
      if (seq !== this.seq) return { ok: true }; // superseded before it started
      const tmp = `${this.file}.${seq}.tmp`;
      try {
        await fsp.mkdir(this.dir, { recursive: true });
        await fsp.writeFile(tmp, json, { encoding: 'utf8', flush: true });
        if (seq !== this.seq) {
          await fsp.rm(tmp, { force: true });
          return { ok: true };
        }
        await this.rotateBackups();
        const written = await renameIfLatest(tmp, this.file, () => seq === this.seq);
        if (!written) await fsp.rm(tmp, { force: true });
        return { ok: true };
      } catch (err) {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        this.log(`Save failed: ${err}`);
        return { ok: false, error: 'Could not write your data file. Check that the disk is not full.' };
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result.finally(() => {
      this.pending--;
    });
  }

  /** Synchronous save used while the window is closing. */
  saveSync(json) {
    const problem = this.validate(json);
    if (problem) return { ok: false, error: problem };
    const seq = ++this.seq;
    const tmp = `${this.file}.${seq}.tmp`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(tmp, json, { encoding: 'utf8', flush: true });
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.backupFile);
      fs.renameSync(tmp, this.file);
      return { ok: true };
    } catch (err) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* ignore */
      }
      this.log(`Sync save failed: ${err}`);
      return { ok: false, error: 'Could not write your data file.' };
    }
  }

  async rotateBackups() {
    let exists = true;
    try {
      await fsp.access(this.file);
    } catch {
      exists = false;
    }
    if (!exists) return;
    await fsp.copyFile(this.file, this.backupFile);

    const daily = path.join(this.backupDir, `even-keel-${localDateStamp()}.json`);
    try {
      await fsp.access(daily);
      return; // today's snapshot already exists
    } catch {
      /* create it below */
    }
    try {
      await fsp.mkdir(this.backupDir, { recursive: true });
      await fsp.copyFile(this.file, daily);
      const files = (await fsp.readdir(this.backupDir)).filter((f) => /^even-keel-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      for (const old of files.slice(0, Math.max(0, files.length - DAILY_BACKUPS_TO_KEEP))) {
        await fsp.rm(path.join(this.backupDir, old), { force: true });
      }
    } catch (err) {
      this.log(`Daily backup failed: ${err}`);
    }
  }

  isBusy() {
    return this.pending > 0;
  }

  /** Resolves once every queued save has finished. */
  idle() {
    return this.queue;
  }
}

module.exports = { JsonStore, isValidJsonObject };
