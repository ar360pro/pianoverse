/* =====================================================
   PianoVerse - Main Application JS
   Web Audio API | LocalStorage | Analytics
   ===================================================== */

'use strict';

// ─── Analytics Module ───────────────────────────────
window.PVAnalytics = (() => {
  const DB_KEY = 'pv_analytics';
  
  function getStore() {
    try {
      return JSON.parse(localStorage.getItem(DB_KEY)) || {
        sessions: 0, totalKeyPresses: 0, songsPlayed: 0,
        recordingsCount: 0, layoutUsage: {}, downloads: 0,
        adClicks: 0, returningUser: false, challengeParticipations: 0,
        sessionStart: null, totalTime: 0, events: []
      };
    } catch { return {}; }
  }

  function save(data) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(data)); } catch {}
  }

  function track(event, data = {}) {
    const store = getStore();
    const entry = { event, data, ts: Date.now() };
    store.events = (store.events || []).slice(-500);
    store.events.push(entry);
    
    switch(event) {
      case 'keypress': store.totalKeyPresses = (store.totalKeyPresses || 0) + 1; break;
      case 'song_play': store.songsPlayed = (store.songsPlayed || 0) + 1; break;
      case 'recording': store.recordingsCount = (store.recordingsCount || 0) + 1; break;
      case 'layout_change':
        if (!store.layoutUsage) store.layoutUsage = {};
        store.layoutUsage[data.layout] = (store.layoutUsage[data.layout] || 0) + 1;
        break;
      case 'download': store.downloads = (store.downloads || 0) + 1; break;
      case 'ad_click': store.adClicks = (store.adClicks || 0) + 1; break;
    }
    save(store);
  }

  function startSession() {
    const store = getStore();
    store.returningUser = store.sessions > 0;
    store.sessions = (store.sessions || 0) + 1;
    store.sessionStart = Date.now();
    save(store);
  }

  function endSession() {
    const store = getStore();
    if (store.sessionStart) {
      store.totalTime = (store.totalTime || 0) + (Date.now() - store.sessionStart);
      store.sessionStart = null;
      save(store);
    }
  }

  function getStats() { return getStore(); }

  startSession();
  window.addEventListener('beforeunload', endSession);

  return { track, getStats, startSession, endSession };
})();

// ─── Audio Engine ────────────────────────────────────
window.PVAudio = (() => {
  let ctx = null;
  let volume = 0.7;
  let reverb = false;
  let reverbNode = null;
  let masterGain = null;
  let activeOscillators = {};

  const NOTE_FREQS = {
    'C0':16.35,'C#0':17.32,'D0':18.35,'D#0':19.45,'E0':20.60,'F0':21.83,'F#0':23.12,'G0':24.50,'G#0':25.96,'A0':27.50,'A#0':29.14,'B0':30.87,
    'C1':32.70,'C#1':34.65,'D1':36.71,'D#1':38.89,'E1':41.20,'F1':43.65,'F#1':46.25,'G1':49.00,'G#1':51.91,'A1':55.00,'A#1':58.27,'B1':61.74,
    'C2':65.41,'C#2':69.30,'D2':73.42,'D#2':77.78,'E2':82.41,'F2':87.31,'F#2':92.50,'G2':98.00,'G#2':103.83,'A2':110.00,'A#2':116.54,'B2':123.47,
    'C3':130.81,'C#3':138.59,'D3':146.83,'D#3':155.56,'E3':164.81,'F3':174.61,'F#3':185.00,'G3':196.00,'G#3':207.65,'A3':220.00,'A#3':233.08,'B3':246.94,
    'C4':261.63,'C#4':277.18,'D4':293.66,'D#4':311.13,'E4':329.63,'F4':349.23,'F#4':369.99,'G4':392.00,'G#4':415.30,'A4':440.00,'A#4':466.16,'B4':493.88,
    'C5':523.25,'C#5':554.37,'D5':587.33,'D#5':622.25,'E5':659.25,'F5':698.46,'F#5':739.99,'G5':783.99,'G#5':830.61,'A5':880.00,'A#5':932.33,'B5':987.77,
    'C6':1046.50,'C#6':1108.73,'D6':1174.66,'D#6':1244.51,'E6':1318.51,'F6':1396.91,'F#6':1479.98,'G6':1567.98,'G#6':1661.22,'A6':1760.00,'A#6':1864.66,'B6':1975.53,
    'C7':2093.00,'C#7':2217.46,'D7':2349.32,'D#7':2489.02,'E7':2637.02,'F7':2793.83,'F#7':2959.96,'G7':3135.96,'G#7':3322.44,'A7':3520.00,'A#7':3729.31,'B7':3951.07,
  };

  function init() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  function createReverbImpulse() {
    const length = ctx.sampleRate * 2;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      }
    }
    return impulse;
  }

  function play(note, octave) {
    init();
    if (ctx.state === 'suspended') ctx.resume();
    
    const key = `${note}${octave}`;
    const freq = NOTE_FREQS[key];
    if (!freq) return;

    // Stop any existing note
    if (activeOscillators[key]) {
      try { activeOscillators[key].gain.gain.cancelScheduledValues(ctx.currentTime);
            activeOscillators[key].gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01); } catch {}
    }

    const now = ctx.currentTime;
    const gainNode = ctx.createGain();
    
    // Piano-like envelope: quick attack, slow decay, sustain, release
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3 * volume, now + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.15 * volume, now + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.08 * volume, now + 0.5);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 4);

    // Create harmonics for piano-like tone
    const harmonics = [
      { ratio: 1, amp: 1 },
      { ratio: 2, amp: 0.5 },
      { ratio: 3, amp: 0.25 },
      { ratio: 4, amp: 0.15 },
      { ratio: 5, amp: 0.08 },
      { ratio: 6, amp: 0.04 },
    ];

    const oscillators = [];
    harmonics.forEach(h => {
      const osc = ctx.createOscillator();
      const harmGain = ctx.createGain();
      osc.type = h.ratio === 1 ? 'triangle' : 'sine';
      osc.frequency.value = freq * h.ratio;
      harmGain.gain.value = h.amp;
      osc.connect(harmGain);
      harmGain.connect(gainNode);
      osc.start(now);
      osc.stop(now + 5);
      oscillators.push(osc);
    });

    gainNode.connect(masterGain);
    activeOscillators[key] = { gain: gainNode, oscs: oscillators };

    // Track keypress
    PVAnalytics.track('keypress', { note: key });

    setTimeout(() => {
      delete activeOscillators[key];
    }, 5500);
  }

  function stop(note, octave) {
    const key = `${note}${octave}`;
    if (activeOscillators[key]) {
      const { gain } = activeOscillators[key];
      const now = ctx ? ctx.currentTime : 0;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0, now, 0.1);
      } catch {}
    }
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (masterGain) masterGain.gain.value = volume;
  }

  function getVolume() { return volume; }

  // Expose playNote globally for hero piano
  window.playNote = play;

  return { play, stop, setVolume, getVolume, init };
})();

// ─── LocalStorage DB ─────────────────────────────────
window.PVDB = (() => {
  const USERS_KEY = 'pv_users';
  const SONGS_KEY = 'pv_songs';
  const SETTINGS_KEY = 'pv_settings';
  const SESSION_KEY = 'pv_session';

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || generateMockUsers(); }
    catch { return []; }
  }

  function getSongs() {
    try { return JSON.parse(localStorage.getItem(SONGS_KEY)) || generateMockSongs(); }
    catch { return []; }
  }

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || defaultSettings(); }
    catch { return defaultSettings(); }
  }

  function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  function saveSongs(s) { localStorage.setItem(SONGS_KEY, JSON.stringify(s)); }
  function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
    catch { return null; }
  }

  function setSession(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, ts: Date.now() }));
  }

  function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

  function defaultSettings() {
    return {
      siteName: 'PianoVerse',
      metaDesc: 'Play piano online with stunning themes',
      metaKeywords: 'piano online, play piano, learn piano',
      adsEnabled: true,
      adsenseId: 'ca-pub-XXXXXXXXXXXXXXXX',
      theme: 'dark',
      announcement: '',
      adminEmail: 'admin@pianoverse.app',
      adminPass: 'admin123',
      cpm: 2.50,
      lockAfter: 5,
      layouts: getDefaultLayouts(),
    };
  }

  function getDefaultLayouts() {
    return [
      { id: 1, name: 'Classic 88', keys: 88, enabled: true, premium: false, theme: 'classic', color: '#f8f9ff' },
      { id: 2, name: 'Mini 25', keys: 25, enabled: true, premium: false, theme: 'mini', color: '#e0f0ff' },
      { id: 3, name: 'Neon Glow', keys: 49, enabled: true, premium: true, theme: 'neon', color: '#00c8ff' },
      { id: 4, name: 'Vintage Jazz', keys: 49, enabled: true, premium: false, theme: 'jazz', color: '#f5deb3' },
      { id: 5, name: 'Dark Matter', keys: 61, enabled: true, premium: true, theme: 'dark', color: '#2a2a3e' },
      { id: 6, name: 'Aurora', keys: 37, enabled: true, premium: true, theme: 'aurora', color: '#c4b5fd' },
      { id: 7, name: 'Glass', keys: 49, enabled: true, premium: true, theme: 'glass', color: 'rgba(200,230,255,0.6)' },
      { id: 8, name: 'Blues Scale', keys: 25, enabled: true, premium: false, theme: 'blues', color: '#93c5fd' },
      { id: 9, name: 'Pentatonic', keys: 25, enabled: true, premium: false, theme: 'penta', color: '#86efac' },
      { id: 10, name: 'Chromatic', keys: 37, enabled: false, premium: true, theme: 'chrome', color: '#fca5a5' },
    ];
  }

  function generateMockUsers() {
    const names = ['Alex Rivera','Sam Chen','Jordan Lee','Taylor Kim','Casey Park','Morgan Liu','Riley Zhang','Drew Wang','Quinn Ma','Avery Sun'];
    const countries = ['US','UK','JP','DE','CA','AU','FR','BR','KR','IN'];
    const users = names.map((name, i) => ({
      id: i + 1,
      name,
      email: name.toLowerCase().replace(' ', '.') + '@example.com',
      country: countries[i],
      status: i === 3 ? 'blocked' : (i < 7 ? 'active' : 'inactive'),
      plan: i < 4 ? 'premium' : 'free',
      joined: new Date(Date.now() - Math.random() * 1e10).toISOString().split('T')[0],
      sessions: Math.floor(Math.random() * 500 + 5),
      songsPlayed: Math.floor(Math.random() * 1000 + 1),
      lastActive: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString().split('T')[0],
      avatar: name.split(' ').map(w=>w[0]).join(''),
    }));
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return users;
  }

  function generateMockSongs() {
    const songs = [
      { id:1, title:'Für Elise', artist:'Beethoven', difficulty:'beginner', genre:'Classical', duration:'3:02', plays:45200, featured:true, active:true },
      { id:2, title:'Moonlight Sonata', artist:'Beethoven', difficulty:'intermediate', genre:'Classical', duration:'5:47', plays:38100, featured:true, active:true },
      { id:3, title:'Clair de Lune', artist:'Debussy', difficulty:'intermediate', genre:'Classical', duration:'5:10', plays:31500, featured:false, active:true },
      { id:4, title:'Bohemian Rhapsody', artist:'Queen', difficulty:'advanced', genre:'Rock', duration:'5:55', plays:28700, featured:true, active:true },
      { id:5, title:'River Flows in You', artist:'Yiruma', difficulty:'beginner', genre:'Contemporary', duration:'3:40', plays:52100, featured:true, active:true },
      { id:6, title:'Canon in D', artist:'Pachelbel', difficulty:'intermediate', genre:'Classical', duration:'4:28', plays:33400, featured:false, active:true },
      { id:7, title:'Gymnopédie No.1', artist:'Satie', difficulty:'beginner', genre:'Classical', duration:'3:06', plays:29800, featured:false, active:true },
      { id:8, title:'Prelude in C Major', artist:'Bach', difficulty:'beginner', genre:'Classical', duration:'2:15', plays:24600, featured:false, active:true },
      { id:9, title:'The Entertainer', artist:'Joplin', difficulty:'intermediate', genre:'Ragtime', duration:'3:22', plays:19300, featured:false, active:true },
      { id:10, title:'Yesterday', artist:'Beatles', difficulty:'beginner', genre:'Pop', duration:'2:05', plays:41800, featured:true, active:true },
    ];
    localStorage.setItem(SONGS_KEY, JSON.stringify(songs));
    return songs;
  }

  // Init on first run
  if (!localStorage.getItem(USERS_KEY)) generateMockUsers();
  if (!localStorage.getItem(SONGS_KEY)) generateMockSongs();

  return { getUsers, getSongs, getSettings, saveUsers, saveSongs, saveSettings, getSession, setSession, clearSession, getDefaultLayouts };
})();

// ─── Toast Notifications ─────────────────────────────
window.PVToast = (() => {
  function show(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return { show };
})();

// ─── Piano Keyboard Engine ───────────────────────────
window.PVPiano = (() => {
  // All notes for full 88-key piano (A0 to C8)
  const FULL_KEYS = [];
  const OCTAVES = [0,1,2,3,4,5,6,7];
  const NOTE_PATTERN = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  
  // A0 to C8
  const startNotes = ['A0','A#0','B0'];
  startNotes.forEach(n => FULL_KEYS.push(n));
  for (let oct = 1; oct <= 7; oct++) {
    NOTE_PATTERN.forEach(n => FULL_KEYS.push(`${n}${oct}`));
  }
  FULL_KEYS.push('C8');

  // Keyboard mapping (for octave 4 area)
  const KEY_MAP = {
    'a':'C4','w':'C#4','s':'D4','e':'D#4','d':'E4','f':'F4','t':'F#4',
    'g':'G4','y':'G#4','h':'A4','u':'A#4','j':'B4','k':'C5','o':'C#5',
    'l':'D5','p':'D#5',';':'E5',"'":'F5','z':'C3','x':'D3','c':'E3','v':'F3',
    'b':'G3','n':'A3','m':'B3'
  };

  const LAYOUTS = {
    classic88: { keys: FULL_KEYS, startOct: 0, name: 'Classic 88 Key' },
    mini25: { keys: FULL_KEYS.slice(24, 49), startOct: 3, name: 'Mini 25 Key' },
    neon49: { keys: FULL_KEYS.slice(12, 61), startOct: 2, name: 'Neon 49 Key' },
    jazz49: { keys: FULL_KEYS.slice(12, 61), startOct: 2, name: 'Jazz 49 Key' },
    dark61: { keys: FULL_KEYS.slice(9, 70), startOct: 1, name: 'Dark 61 Key' },
    aurora37: { keys: FULL_KEYS.slice(24, 61), startOct: 3, name: 'Aurora 37 Key' },
    glass49: { keys: FULL_KEYS.slice(12, 61), startOct: 2, name: 'Glass 49 Key' },
    blues: { keys: ['C3','D#3','F3','F#3','G3','A#3','C4','D#4','F4','F#4','G4','A#4','C5'], startOct: 3, name: 'Blues Scale' },
    pentatonic: { keys: ['C4','D4','E4','G4','A4','C5','D5','E5','G5','A5','C6'], startOct: 4, name: 'Pentatonic Scale' },
    chromatic37: { keys: FULL_KEYS.slice(24, 61), startOct: 3, name: 'Chromatic 37 Key' },
  };

  return { KEY_MAP, LAYOUTS, FULL_KEYS, NOTE_PATTERN };
})();

// ─── Service Worker Registration ─────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

// ─── Utility Functions ───────────────────────────────
window.PVUtils = {
  formatNumber(n) {
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
    return n.toString();
  },
  
  formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m%60}m`;
    if (m > 0) return `${m}m ${s%60}s`;
    return `${s}s`;
  },

  debounce(fn, delay) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  },

  isBlackKey(note) { return note.includes('#'); },
  
  getNoteFromKey(keyName, noteStr) {
    const note = noteStr.replace(/\d/, '');
    const oct = parseInt(noteStr.match(/\d/)?.[0] || '4');
    return { note, oct };
  }
};
