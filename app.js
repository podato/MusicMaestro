const $ = (id) => document.getElementById(id);
const audio = $('audio');
let tracks = [], current = -1, shuffle = false;
const modes = { normal: [1, true], chipmunk: [1.65, false], slow: [0.65, false], caffeine: [1.5, true], giant: [0.5, false], helium: [2, false], wobble: [1, false], broken: [1, true] };
let mischief = null, mischiefTimer, loopStart = 0, wobblePhase = 0;
const formatTime = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
const titleOf = (file) => file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
function renderTracks() {
  const query = $('search').value.toLowerCase();
  $('tracks').replaceChildren();
  tracks.forEach((file, index) => {
    if (!file.name.toLowerCase().includes(query)) return;
    const button = document.createElement('button');
    button.className = `track${index === current ? ' active' : ''}`;
    button.setAttribute('aria-label', `Play ${titleOf(file)}`);
    button.setAttribute('aria-current', String(index === current));
    const number = document.createElement('span'); number.className = 'track-number'; number.textContent = index === current ? '♫' : String(index + 1).padStart(2, '0');
    const info = document.createElement('span'); info.className = 'track-text';
    const title = document.createElement('b'); title.textContent = titleOf(file);
    const detail = document.createElement('small'); detail.textContent = file.folder || 'Music library';
    const type = document.createElement('span'); type.className = 'format'; type.textContent = file.name.split('.').pop().toUpperCase();
    info.append(title, detail); button.append(number, info, type);
    button.onclick = () => selectTrack(index, true); $('tracks').append(button);
  });
  if (!$('tracks').children.length) { const p = document.createElement('p'); p.className = 'no-results'; p.textContent = 'No tracks match your search.'; $('tracks').append(p); }
}
async function refreshLibrary() {
  $('refresh').disabled = true;
  $('refresh').textContent = '↻ Loading library…';
  try {
    const response = await fetch('./api/tracks', { cache: 'no-store' });
    if (!response.ok) throw new Error('Library unavailable');
    const data = await response.json();
    const selectedURL = tracks[current]?.url;
    tracks = data.tracks;
    $('count').textContent = tracks.length;
    $('library-meta').textContent = `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`;
    $('message').textContent = '';
    const retained = tracks.findIndex(track => track.url === selectedURL);
    if (retained >= 0) {
      current = retained;
      renderTracks();
    } else if (tracks.length) {
      selectTrack(0, false);
    } else {
      current = -1;
      audio.pause(); audio.removeAttribute('src'); audio.load();
      $('play').disabled = true; $('seek').disabled = true; $('seek').value = 0;
      $('elapsed').textContent = '0:00'; $('duration').textContent = '0:00';
      $('track-title').textContent = 'Your next favorite is waiting.';
      $('track-subtitle').textContent = 'Pick a track and make some noise.';
      showLibraryNote('No music here yet. Add tracks to the hosted library, then refresh.');
    }
  } catch {
    $('message').textContent = 'Could not load the music library. Check the server connection and try Refresh library.';
    if (!tracks.length) showLibraryNote('The music library is unavailable. Try refreshing in a moment.');
  } finally {
    $('refresh').disabled = false;
    $('refresh').textContent = '↻ Refresh library';
  }
}
function showLibraryNote(text) {
  const note = document.createElement('p'); note.className = 'no-results'; note.textContent = text;
  $('tracks').replaceChildren(note);
}
async function play() {
  if (current < 0) return;
  try { await audio.play(); $('message').textContent = ''; }
  catch (error) { if (error.name !== 'AbortError') $('message').textContent = 'This track could not play. Try another file or an MP3/WAV version.'; }
}
function selectTrack(index, autoplay) {
  audio.pause();
  current = index; loopStart = 0; audio.src = tracks[index].url;
  audio.playbackRate = Number($('speed').value); audio.preservesPitch = $('pitch').checked;
  $('track-title').textContent = titleOf(tracks[index]);
  $('track-subtitle').textContent = tracks[index].folder || 'From your hosted library';
  $('play').disabled = false; $('seek').disabled = true; $('seek').value = 0; $('elapsed').textContent = '0:00'; $('duration').textContent = '0:00'; $('message').textContent = '';
  renderTracks(); if (autoplay) void play();
}
function advance(direction) {
  if (!tracks.length) return;
  if (direction < 0 && audio.currentTime > 3) { loopStart = 0; audio.currentTime = 0; return; }
  let next = (current + direction + tracks.length) % tracks.length;
  if (shuffle && tracks.length > 1) next = (current + 1 + Math.floor(Math.random() * (tracks.length - 1))) % tracks.length;
  selectTrack(next, true);
}
function togglePlay() { if (audio.paused) void play(); else audio.pause(); }
function syncPlaying() {
  const playing = !audio.paused; $('disc').classList.toggle('spinning', playing); $('playing-light').classList.toggle('on', playing);
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play'); $('play').firstElementChild.textContent = playing ? 'Ⅱ' : '▶';
  $('play-state').textContent = playing ? 'Now spinning' : current < 0 ? 'Ready to spin' : 'Taking a breather';
  clearInterval(mischiefTimer);
  if (playing && mischief) mischiefTimer = setInterval(tickMischief, 80);
}
function tickMischief() {
  if (audio.paused) return;
  if (mischief === 'wobble') {
    wobblePhase += 0.22;
    audio.playbackRate = 1 + Math.sin(wobblePhase) * 0.2;
    $('speed-value').textContent = `${audio.playbackRate.toFixed(2)}×`;
  } else if (mischief === 'broken' && (audio.currentTime < loopStart || audio.currentTime >= loopStart + 1)) {
    audio.currentTime = loopStart;
  }
}
function setMode(mode) {
  const [speed, pitch] = modes[mode]; $('speed').value = speed; $('pitch').checked = pitch;
  applySpeed();
  if (mode === 'wobble' || mode === 'broken') {
    mischief = mode; wobblePhase = 0;
    loopStart = Math.max(0, Math.min(audio.currentTime, Number.isFinite(audio.duration) ? audio.duration - 1 : 0));
    syncPlaying();
    updateEffects();
  }
}
function updateEffects() {
  document.querySelectorAll('.effect').forEach(button => {
    const mode = button.dataset.mode;
    const [rate, pitch] = modes[mode];
    const active = mischief ? mode === mischief : !['wobble', 'broken'].includes(mode) && rate === audio.playbackRate && pitch === audio.preservesPitch;
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
  });
}
function applySpeed() {
  clearInterval(mischiefTimer); mischief = null;
  audio.playbackRate = Number($('speed').value); audio.preservesPitch = $('pitch').checked;
  $('speed-value').textContent = `${audio.playbackRate.toFixed(2)}×`;
  updateEffects();
}
$('refresh').onclick = refreshLibrary;
$('search').oninput = () => { if (tracks.length) renderTracks(); };
$('play').onclick = togglePlay; $('previous').onclick = () => advance(-1); $('next').onclick = () => advance(1);
$('shuffle').onclick = () => { shuffle = !shuffle; $('shuffle').setAttribute('aria-pressed', String(shuffle)); };
$('repeat').onclick = () => { audio.loop = !audio.loop; $('repeat').setAttribute('aria-pressed', String(audio.loop)); };
audio.onplay = syncPlaying; audio.onpause = syncPlaying;
audio.onloadedmetadata = () => { $('duration').textContent = formatTime(audio.duration); $('seek').disabled = !Number.isFinite(audio.duration); };
audio.ontimeupdate = () => { $('elapsed').textContent = formatTime(audio.currentTime); $('seek').value = audio.duration ? audio.currentTime / audio.duration * 100 : 0; };
audio.onended = () => { if (mischief === 'broken') { audio.currentTime = loopStart; void play(); return; } if (shuffle || current < tracks.length - 1) advance(1); else syncPlaying(); };
audio.onerror = () => { $('message').textContent = 'This file could not be decoded. Select another track or try an MP3/WAV version.'; };
$('seek').oninput = () => { if (Number.isFinite(audio.duration)) { audio.currentTime = Number($('seek').value) / 100 * audio.duration; loopStart = Math.max(0, Math.min(audio.currentTime, audio.duration - 1)); } };
audio.volume = 0.75;
function syncVolume() { $('volume-value').textContent = audio.muted ? '0%' : `${Math.round(audio.volume * 100)}%`; $('mute').setAttribute('aria-pressed', String(audio.muted)); $('mute').setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute'); $('mute').textContent = audio.muted ? '×' : '♪'; }
$('volume').oninput = () => { audio.volume = Number($('volume').value); audio.muted = false; syncVolume(); };
$('mute').onclick = () => { audio.muted = !audio.muted; syncVolume(); };
document.querySelectorAll('.effect').forEach(button => button.onclick = () => setMode(button.dataset.mode));
$('speed').oninput = applySpeed; $('pitch').onchange = applySpeed; $('reset').onclick = () => setMode('normal');
document.addEventListener('keydown', event => { if (event.code === 'Space' && !event.repeat && !event.target.closest('input, button, a, textarea, select, [contenteditable]')) { event.preventDefault(); togglePlay(); } });
void refreshLibrary();
