// Run with: node check.mjs. Checks library and playback state without dependencies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function element() {
  return {
    value: '', checked: false, textContent: '', children: [], attributes: {},
    firstElementChild: {}, classList: { toggle() {} },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    removeAttribute(key) { delete this.attributes[key]; },
    load() {},
    setAttribute(key, value) { this.attributes[key] = value; },
  };
}
const nodes = new Map();
const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
const effects = ['normal', 'chipmunk', 'slow', 'caffeine', 'giant', 'helium', 'wobble', 'broken'].map(mode => Object.assign(element(), { dataset: { mode } }));
get('speed').value = '1'; get('pitch').checked = true;
Object.assign(get('audio'), { paused: true, currentTime: 0, pause() { this.paused = true; this.onpause?.(); }, async play() { this.paused = false; this.onplay?.(); } });
let library = [
  {name: '01 - First.mp3', folder: 'Album', url: './api/audio?path=Album%2F01.mp3'},
  {name: '02 - Second.wav', folder: 'Album', url: './api/audio?path=Album%2F02.wav'},
];
let available = true;
let timer;
const context = vm.createContext({
  setInterval: callback => { timer = callback; return 1; }, clearInterval: () => { timer = undefined; },
  document: { getElementById: get, createElement: element, querySelectorAll: () => effects, addEventListener() {} },
  fetch: async () => ({ ok: available, json: async () => ({tracks: library}) }),
});
vm.runInContext(readFileSync(new URL('./app.js', import.meta.url), 'utf8'), context);
await new Promise(setImmediate);
assert.equal(get('count').textContent, 2);
assert.equal(get('track-title').textContent, '01 - First');
assert.equal(get('audio').paused, true);
effects[1].onclick();
assert.equal(get('audio').playbackRate, 1.65);
assert.equal(get('audio').preservesPitch, false);
get('next').onclick();
assert.equal(get('track-title').textContent, '02 - Second');
assert.equal(get('audio').paused, false);
assert.equal(get('audio').src, library[1].url);
await vm.runInContext('refreshLibrary()', context);
assert.equal(get('audio').paused, false);
assert.equal(get('track-title').textContent, '02 - Second');
get('search').value = 'missing'; get('search').oninput();
assert.equal(get('tracks').children[0].textContent, 'No tracks match your search.');
get('reset').onclick();
assert.equal(get('audio').playbackRate, 1);
assert.equal(get('audio').preservesPitch, true);
effects[4].onclick();
assert.equal(get('audio').playbackRate, 0.5);
assert.equal(get('audio').preservesPitch, false);
effects[5].onclick();
assert.equal(get('audio').playbackRate, 2);
effects[6].onclick();
timer();
assert.ok(get('audio').playbackRate > 1 && get('audio').playbackRate <= 1.2);
get('audio').pause();
assert.equal(timer, undefined, 'Pause stops the effect timer');
await get('audio').play();
assert.equal(typeof timer, 'function', 'Play resumes wobble');
get('audio').duration = 20; get('audio').currentTime = 4;
effects[7].onclick();
get('audio').currentTime = 5.1; timer();
assert.equal(get('audio').currentTime, 4, 'Broken record returns to the selected second');
get('audio').currentTime = 0; timer();
assert.equal(get('audio').currentTime, 4, 'Native repeat stays within the selected slice');
get('seek').value = 50; get('seek').oninput();
get('audio').currentTime = 11.1; timer();
assert.equal(get('audio').currentTime, 10, 'Seeking selects a new loop');
get('next').onclick();
get('audio').currentTime = 1.1; timer();
assert.equal(get('audio').currentTime, 0, 'New tracks loop from the beginning');
get('audio').currentTime = 20; get('audio').onended();
assert.equal(get('audio').currentTime, 0, 'Broken record loops at track end');
get('reset').onclick();
assert.equal(timer, undefined, 'Reset stops all mischief');
assert.equal(get('audio').playbackRate, 1);
assert.equal(get('audio').preservesPitch, true);
get('next').onclick();
available = false;
await vm.runInContext('refreshLibrary()', context);
assert.equal(get('track-title').textContent, '02 - Second');
assert.match(get('message').textContent, /Could not load/);
assert.equal(get('refresh').disabled, false);
available = true; library = [];
await vm.runInContext('refreshLibrary()', context);
assert.equal(get('audio').paused, true);
assert.equal(get('play').disabled, true);
assert.equal(get('count').textContent, 0);
assert.match(get('tracks').children[0].textContent, /No music here yet/);
console.log('Passed: hosted library loading, playback URLs, refresh preservation, presets, search, reset, connection failure, and empty library.');
