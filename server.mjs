import express from 'express';
import { readdir, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const audioFile = /\.(mp3|wav|flac|m4a|ogg|opus|aac|aiff?|webm)$/i;
const unavailable = 'Music library unavailable. Check the server MUSIC_DIR setting and directory permissions.';

export function createApp({ musicDir = process.env.MUSIC_DIR || './music' } = {}) {
  const app = express();
  const directory = path.resolve(appDir, musicDir);
  app.disable('x-powered-by');

  app.get('/api/tracks', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const root = await realpath(directory);
      const tracks = [];
      async function scan(relative = '') {
        for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
          if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
          const file = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory()) await scan(file);
          else if (entry.isFile() && audioFile.test(entry.name)) {
            tracks.push({ name: entry.name, folder: relative || 'Music library', url: `./api/audio?path=${encodeURIComponent(file)}` });
          }
        }
      }
      await scan();
      tracks.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || a.folder.localeCompare(b.folder, 'en'));
      res.json({ tracks });
    } catch {
      res.status(503).json({ error: unavailable });
    }
  });

  app.get('/api/audio', async (req, res, next) => {
    const file = req.query.path;
    if (typeof file !== 'string' || !audioFile.test(file) || file.includes('\\') || file.includes('\0') || file.split('/').some(part => !part || part.startsWith('.'))) {
      return res.status(404).json({ error: 'Track not found.' });
    }
    let root;
    try { root = await realpath(directory); }
    catch { return res.status(503).json({ error: unavailable }); }
    try {
      let candidate = root;
      for (const part of file.split('/')) {
        candidate = path.join(candidate, part);
        if ((await lstat(candidate)).isSymbolicLink()) return res.status(404).json({ error: 'Track not found.' });
      }
      const resolved = await realpath(candidate);
      const relative = path.relative(root, resolved);
      if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !(await lstat(resolved)).isFile()) {
        return res.status(404).json({ error: 'Track not found.' });
      }
      res.sendFile(relative, { root, dotfiles: 'deny' }, error => { if (error) next(error); });
    } catch {
      res.status(404).json({ error: 'Track not found.' });
    }
  });

  for (const [route, file] of Object.entries({ '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' })) {
    app.get(route, (req, res) => res.sendFile(file, { root: appDir }));
  }
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status === 416 ? 416 : error.status === 404 ? 404 : 500;
    if (error.headers?.['Content-Range']) res.set('Content-Range', error.headers['Content-Range']);
    res.status(status).json({ error: status === 416 ? 'Requested range is not available.' : 'Unable to serve this file.' });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 5173);
  createApp().listen(port, host, () => console.log(`Music Maestro listening on http://${host}:${port}`));
}
