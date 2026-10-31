import { TRACKS, SFX, wav } from './js/audio.js';
import fs from 'fs';
const out = process.argv[2] || 'audio_out'; fs.mkdirSync(out, { recursive: true });
for (const [k, f] of Object.entries(TRACKS)) { const t = Date.now(); const b = f(); fs.writeFileSync(`${out}/music_${k}.wav`, wav(b)); console.log(k, (b.length / 44100).toFixed(1) + 's', Date.now() - t + 'ms'); }
for (const [k, f] of Object.entries(SFX)) fs.writeFileSync(`${out}/sfx_${k}.wav`, wav(f()));
console.log('sfx', Object.keys(SFX).length);
