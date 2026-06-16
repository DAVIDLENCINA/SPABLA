"use client";

import { useRef, useCallback, useEffect } from "react";

export function useRingTone() {
  const ctxRef       = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef    = useRef(false);

  const getCtx = (): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  };

  const playBurst = (
    ctx: AudioContext,
    frequencies: number[],
    duration: number,
    volume = 0.12,
    startOffset = 0
  ) => {
    const now  = ctx.currentTime + startOffset;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.setValueAtTime(volume, now + Math.max(0, duration - 0.05));
    gain.gain.linearRampToValueAtTime(0, now + duration);
    gain.connect(ctx.destination);

    frequencies.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + duration);
    });
  };

  const stop = useCallback(() => {
    activeRef.current = false;
    if (schedulerRef.current) {
      clearTimeout(schedulerRef.current);
      schedulerRef.current = null;
    }
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
  }, []);

  // Ringback — caller hears while waiting: 440 Hz, 200 ms on / 800 ms off (period 1 s)
  const startRingback = useCallback(() => {
    stop();
    if (typeof window === "undefined") return;
    activeRef.current = true;

    const tick = async () => {
      if (!activeRef.current) return;
      const ctx = getCtx();
      await ctx.resume();
      if (!activeRef.current) return;
      playBurst(ctx, [440], 0.2);
      schedulerRef.current = setTimeout(tick, 1000);
    };
    tick();
  }, [stop]);

  // Ringtone — receiver hears incoming: double bell 880 Hz → 660 Hz, period 3.7 s
  // 880 Hz 700ms | pause 300ms | 660 Hz 700ms | pause 2000ms
  const startRingtone = useCallback(() => {
    stop();
    if (typeof window === "undefined") return;
    activeRef.current = true;

    const tick = async () => {
      if (!activeRef.current) return;
      const ctx = getCtx();
      await ctx.resume();
      if (!activeRef.current) return;
      playBurst(ctx, [880], 0.7);
      playBurst(ctx, [660], 0.7, 0.12, 1.0);
      schedulerRef.current = setTimeout(tick, 3700);
    };
    tick();
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { startRingback, startRingtone, stop };
}
