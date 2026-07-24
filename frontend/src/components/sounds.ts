const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
let ctx: AudioContext | null = null;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function beep(freq: number, duration: number, volume = 0.3) {
  const context = getCtx();
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + duration);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start();
  osc.stop(context.currentTime + duration);
}

export const sounds = {
  deal: () => beep(600, 0.1),
  bet: () => beep(800, 0.15),
  call: () => beep(1000, 0.2),
  raise: () => beep(1200, 0.25),
  fold: () => beep(400, 0.1),
  check: () => beep(500, 0.1),
  allin: () => beep(1400, 0.4),
  pot: () => beep(900, 0.3),
  winner: () => { beep(1000, 0.3); setTimeout(() => beep(1200, 0.3), 200); },
  timer_warning: () => beep(2000, 0.1),
};
