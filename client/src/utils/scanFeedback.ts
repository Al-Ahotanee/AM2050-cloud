/* AM2050 — Acoustic and Haptic Synthesis Feedback for Continuous Attendance Scanning.
   Self-contained using standard Web Audio API and Navigator Vibration API.
   Zero external audio assets or network latency. */

class ScanFeedbackManager {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  private getAudioContext(): AudioContext | null {
    if (!this.soundEnabled) return null;
    try {
      if (!this.ctx && typeof window !== "undefined") {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === "suspended") {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Crisp, high-pitched positive double-tone (880Hz -> 1174Hz) indicating verified attendance.
   * Accompanied by a 90ms haptic tap on mobile devices.
   */
  public playSuccess() {
    try {
      const ctx = this.getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.connect(gain);
        gain.connect(ctx.destination);

        // First chime: 880Hz (A5)
        osc.frequency.setValueAtTime(880, now);
        // Second chime: 1174.66Hz (D6)
        osc.frequency.setValueAtTime(1174.66, now + 0.07);

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.start(now);
        osc.stop(now + 0.24);
      }
    } catch {
      // Ignored if autoplay is blocked
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(90);
      } catch {
        // Ignored
      }
    }
  }

  /**
   * Subtle lower dual-tone (440Hz -> 330Hz) indicating student was already marked today or duplicate card.
   * Accompanied by a double-pulse vibration [50ms, 40ms, 50ms].
   */
  public playDuplicate() {
    try {
      const ctx = this.getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(329.63, now + 0.08);

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.start(now);
        osc.stop(now + 0.26);
      }
    } catch {}

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate([50, 40, 50]);
      } catch {}
    }
  }

  /**
   * Warning low buzzer (220Hz) for invalid token or unrecognized placement.
   */
  public playError() {
    try {
      const ctx = this.getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch {}

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(150);
      } catch {}
    }
  }
}

export const scanFeedback = new ScanFeedbackManager();
