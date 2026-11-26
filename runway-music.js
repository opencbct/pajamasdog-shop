// 11-26: runway music for the AI fashion show — made live in the browser (Web Audio), so no music file,
// no licence and nothing to download. Upbeat catwalk loop: kick, off-beat hats, bass, bright chord stabs.
// Browsers only allow sound after a tap, so it starts on the first tap and remembers mute (pd:music).
(function(){
  const KEY = 'pd:music';
  let ctx = null, master = null, timer = null, step = 0, nextT = 0, on = false;
  const BPM = 118, S16 = 60 / BPM / 4;
  const want = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch(e){ return true; } };
  const remember = v => { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch(e){} };
  // A minor → F → C → G, 1 bar each
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const BASS = [45, 41, 36, 43];
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);

  function kick(t){ const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
    g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + .28);
    o.connect(g).connect(master); o.start(t); o.stop(t + .3); }
  let noiseBuf = null;
  function hat(t, open){ if(!noiseBuf){ noiseBuf = ctx.createBuffer(1, ctx.sampleRate * .3, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(open ? .16 : .09, t); g.gain.exponentialRampToValueAtTime(.001, t + (open ? .18 : .05));
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + .2); }
  function bass(t, n){ const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = hz(n); f.type = 'lowpass'; f.frequency.value = 420;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.32, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + S16 * 1.8);
    o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + S16 * 2); }
  function stab(t, notes){ for(const n of notes){ const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = hz(n + 12);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.07, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + .22);
    o.connect(g).connect(master); o.start(t); o.stop(t + .25); } }

  function schedule(){
    while(nextT < ctx.currentTime + .12){
      const s = step % 16, bar = Math.floor(step / 16) % 4;
      if(s % 4 === 0) kick(nextT);
      if(s % 4 === 2) hat(nextT, s === 14);
      else if(s % 2 === 1) hat(nextT, false);
      if([0, 3, 6, 8, 11, 14].includes(s)) bass(nextT, BASS[bar] + (s === 14 ? 12 : 0));
      if([2, 7, 10].includes(s)) stab(nextT, CHORDS[bar]);
      nextT += S16; step++;
    }
  }
  function start(){
    if(on) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if(!master){ master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination); }
      ctx.resume(); nextT = ctx.currentTime + .05; on = true; timer = setInterval(schedule, 25); paint();
    } catch(e){}
  }
  function stop(){ on = false; clearInterval(timer); timer = null; try { ctx && ctx.suspend(); } catch(e){} paint(); }

  let btn = null;
  function paint(){ if(btn){ btn.textContent = on ? '🔊' : '🔇'; btn.setAttribute('aria-label', on ? 'Mute music' : 'Play music'); } }
  window.runwayMusic = { start, stop, toggle(){ on ? (stop(), remember(false)) : (start(), remember(true)); } };

  // Mute button on the stage + start on the first tap anywhere (if not muted before)
  window.addEventListener('DOMContentLoaded', () => {
    const stage = document.getElementById('stage');
    if(stage){ btn = document.createElement('button'); btn.className = 'mus'; btn.type = 'button';
      btn.addEventListener('click', e => { e.stopPropagation(); runwayMusic.toggle(); }); stage.appendChild(btn); paint(); }
  });
  const first = () => { document.removeEventListener('pointerdown', first, true); if(want()) start(); };
  document.addEventListener('pointerdown', first, true);
  document.addEventListener('visibilitychange', () => { if(document.hidden) stop(); else if(want() && ctx) start(); });
})();
