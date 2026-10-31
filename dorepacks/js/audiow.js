import { TRACKS } from './audio.js';
self.onmessage = e => { const b = TRACKS[e.data](); self.postMessage({ name: e.data, b }, [b.buffer]); };
