type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  duration: number;
  loop: boolean;
};

type Listener = () => void;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Map<string, Voice[]>();
  private listeners = new Set<Listener>();
  private playingKey = "";
  private masterVolume = 1;
  private muted = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): string {
    return this.playingKey;
  }

  getPlayingIds(): string[] {
    return this.playingKey ? this.playingKey.split(",") : [];
  }

  isPlaying(padId: string): boolean {
    return (this.voices.get(padId)?.length ?? 0) > 0;
  }

  getProgress(padId: string): number | null {
    const ctx = this.ctx;
    const list = this.voices.get(padId);
    if (!ctx || !list?.length) return null;
    const voice = list[list.length - 1]!;
    if (voice.duration <= 0) return 0;
    const elapsed = ctx.currentTime - voice.startedAt;
    if (voice.loop) return (elapsed % voice.duration) / voice.duration;
    return Math.min(1, elapsed / voice.duration);
  }

  getDuration(clipId: string): number | null {
    return this.buffers.get(clipId)?.duration ?? null;
  }

  private emit() {
    const next = [...this.voices.entries()]
      .filter(([, list]) => list.length > 0)
      .map(([id]) => id)
      .sort()
      .join(",");
    this.playingKey = next;
    for (const listener of this.listeners) listener();
  }

  ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("Web Audio is not supported in this browser");
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMasterVolume(value: number) {
    this.masterVolume = Math.min(1, Math.max(0, value));
    if (this.master && !this.muted) {
      this.master.gain.setTargetAtTime(this.masterVolume, this.ctx?.currentTime ?? 0, 0.02);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.masterVolume, this.ctx?.currentTime ?? 0, 0.02);
    }
  }

  async loadClip(clipId: string, bytes: ArrayBuffer): Promise<number> {
    const ctx = this.ensureContext();
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    this.buffers.set(clipId, buffer);
    return buffer.duration;
  }

  unloadClip(clipId: string) {
    this.buffers.delete(clipId);
  }

  hasClip(clipId: string): boolean {
    return this.buffers.has(clipId);
  }

  play(padId: string, clipId: string, options: { volume: number; loop: boolean; exclusive: boolean; retrigger: "overlap" | "restart" }) {
    const ctx = this.ensureContext();
    const master = this.master;
    const buffer = this.buffers.get(clipId);
    if (!master || !buffer) {
      throw new Error("CLIP_NOT_READY");
    }
    if (options.exclusive) this.stopAll();
    else if (options.retrigger === "restart") this.stopPad(padId);

    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, options.volume));
    gain.connect(master);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop;
    source.connect(gain);

    const voice: Voice = {
      source,
      gain,
      startedAt: ctx.currentTime,
      duration: buffer.duration,
      loop: options.loop,
    };
    const list = this.voices.get(padId) ?? [];
    list.push(voice);
    this.voices.set(padId, list);

    source.onended = () => {
      const current = this.voices.get(padId);
      if (!current) return;
      const next = current.filter((item) => item !== voice);
      if (next.length) this.voices.set(padId, next);
      else this.voices.delete(padId);
      try {
        gain.disconnect();
      } catch {
        /* already disconnected */
      }
      this.emit();
    };

    source.start();
    this.emit();
  }

  stopPad(padId: string) {
    const list = this.voices.get(padId);
    if (!list?.length) return;
    for (const voice of list) {
      try {
        voice.source.onended = null;
        voice.source.stop();
        voice.gain.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.voices.delete(padId);
    this.emit();
  }

  stopAll() {
    const ids = [...this.voices.keys()];
    for (const id of ids) this.stopPad(id);
  }
}

export const audioEngine = new AudioEngine();
