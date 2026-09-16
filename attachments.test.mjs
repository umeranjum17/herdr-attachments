#!/usr/bin/env node
/** Flow tests: drive the real rpc.mjs against a real dump directory. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const root = dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'herdr-attachments-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** A dump directory with an image, a document, a hidden file and a big file. */
const home = join(scratch, 'home');
const pane = 'lab:p1';
const dump = join(home, 'attachments', 'pane', pane);
mkdirSync(dump, { recursive: true });
writeFileSync(join(dump, 'screen.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
writeFileSync(join(dump, 'notes.md'), '# handoff\n');
writeFileSync(join(dump, '.hidden'), 'not listed\n');
writeFileSync(join(dump, 'build.apk'), Buffer.alloc(3 * 1024 * 1024, 7));
// Oldest first on disk, so "newest first" is observable.
utimesSync(join(dump, 'screen.png'), new Date(), new Date(2_000_000_000_000));
utimesSync(join(dump, 'notes.md'), new Date(), new Date(1_500_000_000_000));
utimesSync(join(dump, 'build.apk'), new Date(), new Date(1_000_000_000_000));

const run = (input, env = {}) => spawnSync(process.execPath, [join(root, 'rpc.mjs')], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify(input ?? {}),
    env: { ...process.env, MUXR_HOME: home, ...env },
    timeout: 20_000,
});
const ok = (input, env) => {
    const result = run(input, env);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
};

describe('attachments listing', () => {
    it('lists the pane dump directory, newest first, metadata only', () => {
        const listed = ok({ paneId: pane });
        assert.equal(listed.total, 3);
        assert.deepEqual(listed.items.map((item) => item.title), ['screen.png', 'notes.md', 'build.apk']);
        const [png, md, apk] = listed.items;
        assert.equal(png.icon, 'image-outline');
        assert.equal(png.action.mimeType, 'image/png');
        assert.match(png.subtitle, /^\d+ KB$/);
        assert.equal(png.action.id, sha256(join(dump, 'screen.png')), 'small files carry their content id');
        assert.equal(md.icon, 'document-text-outline');
        assert.equal(apk.icon, 'logo-android');
        assert.equal(apk.action.mimeType, 'application/vnd.android.package-archive');
        assert.equal(apk.action.id, 'build.apk', 'oversized files never get re-hashed on open');
    });

    it('answers an unknown or hostile pane id with an empty list', () => {
        for (const paneId of ['missing', '../escape', 'a/b', 'a\\b', '']) {
            const listed = ok({ paneId });
            assert.deepEqual(listed.items, [], paneId);
        }
        assert.deepEqual(ok({}).items, []);
    });

    it('answers a pane without a dump directory with an empty list', () => {
        assert.deepEqual(ok({ paneId: 'lab:empty' }).items, []);
    });

    it('caps the sheet at 50 items and reports the real total', () => {
        const full = join(home, 'attachments', 'pane', 'lab:many');
        mkdirSync(full, { recursive: true });
        for (let index = 0; index < 55; index += 1) writeFileSync(join(full, `log-${String(index).padStart(2, '0')}.txt`), 'x\n');
        const listed = ok({ paneId: 'lab:many' });
        assert.equal(listed.items.length, 50);
        assert.equal(listed.total, 55);
    });
});

describe('manifest', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'muxr-ui.json'), 'utf8'));
    const toml = readFileSync(join(root, 'herdr-plugin.toml'), 'utf8');

    it('keeps the Herdr identity and the muxr manifest in agreement', () => {
        assert.equal(toml.match(/^id\s*=\s*"([^"]+)"/m)?.[1], 'muxr.attachments');
        assert.equal(manifest.pluginId, 'muxr.attachments');
        assert.match(toml, /^min_herdr_version\s*=\s*"0\.8\.0"/m);
    });

    it('stays one read RPC feeding one pill', () => {
        const ids = manifest.contributions.map((contribution) => contribution.id);
        assert.deepEqual(ids.sort(), ['attachments', 'list']);
        const rpc = manifest.contributions.find((contribution) => contribution.id === 'list');
        assert.equal(rpc.slot, 'host.rpc');
        assert.equal(rpc.mode, 'read');
        assert.equal(rpc.entry, 'rpc.mjs');
        const pill = manifest.contributions.find((contribution) => contribution.id === 'attachments');
        assert.equal(pill.slot, 'session.pills');
        assert.equal(pill.params.source.contributionId, 'list');
    });
});
