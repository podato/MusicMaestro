import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from './server.mjs';

async function serve(t, musicDir) {
  const server = createApp({ musicDir }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return (url, options) => fetch(new URL(url, `http://127.0.0.1:${server.address().port}/`), options);
}

test('hosted library lists only music, streams ranges, and confines access', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'maestro-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const music = path.join(temporary, 'music');
  await mkdir(path.join(music, 'Album'), { recursive: true });
  await mkdir(path.join(music, '.hidden'));
  for (const name of ['10 tune.mp3', '2 tune.WAV', 'Album/song & #1.flac', '.secret.mp3', '.hidden/hidden.mp3', 'notes.txt']) {
    await writeFile(path.join(music, name), '0123456789');
  }
  await writeFile(path.join(temporary, 'outside.mp3'), 'private');
  await symlink(path.join(temporary, 'outside.mp3'), path.join(music, 'escape.mp3'));
  await symlink(temporary, path.join(music, 'escape-dir'));
  const request = await serve(t, music);
  const listing = await request('/api/tracks');
  assert.equal(listing.status, 200);
  const { tracks } = await listing.json();
  assert.deepEqual(tracks.map(track => track.name), ['2 tune.WAV', '10 tune.mp3', 'song & #1.flac']);
  assert.equal(tracks[0].folder, 'Music library');
  assert.equal(tracks[2].folder, 'Album');
  assert.equal(await (await request(tracks[2].url)).text(), '0123456789');
  const range = await request(tracks[0].url, { headers: { Range: 'bytes=2-5' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await range.text(), '2345');
  const suffix = await request(tracks[0].url, { headers: { Range: 'bytes=-3' } });
  assert.equal(suffix.status, 206);
  assert.equal(await suffix.text(), '789');
  const head = await request(tracks[0].url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal(head.headers.get('accept-ranges'), 'bytes');
  assert.equal(await head.text(), '');
  assert.equal((await request(tracks[0].url, { headers: { Range: 'bytes=20-30' } })).status, 416);
  for (const file of ['../outside.mp3', '/outside.mp3', '.secret.mp3', '.hidden/hidden.mp3', 'escape.mp3', 'escape-dir/outside.mp3', 'notes.txt', 'Album/../../outside.mp3', '..\\outside.mp3']) {
    assert.equal((await request(`/api/audio?path=${encodeURIComponent(file)}`)).status, 404, file);
  }
  for (const file of ['/server.mjs', '/package.json', '/README.md', '/api/audio', '/api/audio?path=a.mp3&path=b.mp3']) {
    assert.equal((await request(file)).status, 404, file);
  }
  assert.equal((await request('/')).status, 200);
  await writeFile(path.join(music, 'new.ogg'), 'new');
  assert.equal((await (await request('/api/tracks')).json()).tracks.length, 4);
});

test('missing and unreadable libraries return useful errors without absolute paths', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'maestro-'));
  const restricted = path.join(temporary, 'restricted');
  t.after(async () => {
    await chmod(restricted, 0o700).catch(() => {});
    await rm(temporary, { recursive: true, force: true });
  });
  const request = await serve(t, path.join(temporary, 'missing'));
  for (const url of ['/api/tracks', '/api/audio?path=song.mp3']) {
    const response = await request(url);
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.match(body, /MUSIC_DIR/);
    assert.ok(!body.includes(temporary));
  }
  if (process.getuid?.() !== 0) {
    await mkdir(restricted);
    await chmod(restricted, 0);
    const unreadable = await serve(t, restricted);
    assert.equal((await unreadable('/api/tracks')).status, 503);
  }
});
