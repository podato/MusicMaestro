# Music Maestro

A small hosted music player. The server scans its music directory and the web dashboard streams the tracks. Listeners don't select or upload local files.

## Run

Requires Node.js 22 or newer.

```sh
npm install
npm start
```

Put audio files in `music/` (subfolders are included), then open http://localhost:5173. The library loads automatically. Use **Refresh library** after adding or removing files; refreshing keeps the current track playing if it is still listed.

To use a different directory in your app runtime:

```sh
MUSIC_DIR=/data/music HOST=0.0.0.0 PORT=5173 npm start
```

`MUSIC_DIR` defaults to the app's `music/` directory. `HOST` defaults to `127.0.0.1`; use `0.0.0.0` for a container or hosting platform. `PORT` defaults to `5173`.

## Hosting

Run the Node server as the web service and mount your music directory into its runtime, ideally as a read-only persistent volume. Configure `MUSIC_DIR` to that mounted path. The server serves the dashboard, library API, and audio streams on the same origin. Route all three through your hosting platform's HTTPS proxy; this needs a Node runtime, not static-only hosting.

The app has no built-in login. If your web dashboard is private, put the entire app, including `/api/*`, behind that dashboard's authentication proxy. Each listener has independent playback controls.

`GET /api/tracks` lists supported audio files. `GET /api/audio?path=...` streams a listed-format file, with HTTP byte-range support for seeking. Files outside the configured directory are not served. A missing/unreadable music directory produces an unavailable-library message; an empty directory shows an empty library.

MP3, WAV, FLAC, M4A, OGG, OPUS, AAC, AIFF, and WebM are listed; playback depends on browser codec support. Fonts load from Google Fonts with system fallbacks.

## Checks

```sh
npm test
```

Tests cover the HTTP library and streaming endpoints, file containment, and client library/playback state.
