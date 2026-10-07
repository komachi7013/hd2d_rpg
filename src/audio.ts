export class AudioEngine {
  ctx: AudioContext | null = null;
  gain: GainNode | null = null;
  track = 'explore';
  timer: number | undefined;
  step = 0;
  volume = 0.28;
  muted = false;
  unavailable = false;
  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem('hoshiken.settings') || '{}');
      this.volume = Math.max(
        0,
        Math.min(1, Number.isFinite(s.volume) ? Number(s.volume) : 0.28),
      );
      this.muted = s.muted === true;
    } catch {}
  }
  unlock() {
    if (this.unavailable) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.gain = this.ctx.createGain();
        this.gain.connect(this.ctx.destination);
        this.gain.gain.value = this.muted ? 0 : this.volume;
        this.timer = window.setInterval(() => this.tick(), 220);
      }
      void this.ctx.resume().catch(() => {});
    } catch {
      this.unavailable = true;
    }
  }
  set(track: string) {
    if (this.track === track) return;
    this.track = track;
    this.step = 0;
    if (this.ctx && this.gain) {
      const t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setTargetAtTime(0, t, 0.06);
      this.gain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        t + 0.15,
        0.15,
      );
    }
  }
  settings(v: number, m: boolean) {
    this.volume = v;
    this.muted = m;
    if (this.ctx && this.gain)
      this.gain.gain.setTargetAtTime(m ? 0 : v, this.ctx.currentTime, 0.04);
    try {
      localStorage.setItem(
        'hoshiken.settings',
        JSON.stringify({ volume: v, muted: m }),
      );
    } catch {}
  }
  note(
    hz: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.07,
  ) {
    if (!this.ctx || !this.gain) return;
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain(),
      t = this.ctx.currentTime;
    o.type = type;
    o.frequency.value = hz;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(this.gain);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    o.start(t);
    o.stop(t + duration + 0.01);
  }
  tick() {
    if (document.hidden || !this.ctx || this.track === 'quiet') return;
    const battle = this.track === 'battle';
    const melody = battle
      ? [52, 55, 59, 64, 62, 59, 55, 57, 52, 55, 60, 64, 67, 64, 60, 59]
      : [
          64, 0, 67, 71, 0, 69, 67, 0, 62, 0, 64, 67, 0, 62, 59, 0, 60, 0, 64,
          67, 0, 71, 69, 0, 62, 0, 67, 66, 0, 64, 62, 0,
        ];
    const n = melody[this.step % melody.length];
    if (n)
      this.note(
        440 * 2 ** ((n - 69) / 12),
        battle ? 0.23 : 1.1,
        battle ? 'triangle' : 'sine',
        battle ? 0.1 : 0.08,
      );
    if (this.step % 4 === 0)
      this.note(
        440 * 2 ** (((battle ? 40 : 48) - 69) / 12),
        0.8,
        'triangle',
        0.09,
      );
    if (battle && this.step % 2 === 0)
      this.note(this.step % 4 === 0 ? 70 : 160, 0.12, 'square', 0.06);
    this.step++;
  }
  fx(kind: string) {
    const notes: Record<string, number[]> = {
      confirm: [660],
      attack: [220, 110],
      hurt: [90],
      heal: [523, 659, 784],
      awaken: [392, 523, 659, 1046],
      star: [1046, 1568, 2093],
    };
    (notes[kind] || [440]).forEach((n, i) =>
      window.setTimeout(
        () =>
          this.note(n, 0.35, kind === 'hurt' ? 'sawtooth' : 'triangle', 0.16),
        i * 85,
      ),
    );
  }
}
