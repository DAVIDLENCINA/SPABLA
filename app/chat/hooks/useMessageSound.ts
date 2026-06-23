"use client";

import { useRef, useCallback, useEffect } from "react";

export function useMessageSound() {
  const ctxRef = useRef<AudioContext | null>(null);

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

  const prepare = useCallback(() => {
    if (typeof window === "undefined") return;
    getCtx();
  }, []);

  const play = useCallback(() => {
    if (typeof window === "undefined") return;
    const ctx = getCtx();
    if (ctx.state !== "running") return;

    const now = ctx.currentTime;

    // Primary: 1000 Hz sine, 110 ms, low volume
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.07, now + 0.008);
    g1.gain.setValueAtTime(0.07, now + 0.065);
    g1.gain.linearRampToValueAtTime(0, now + 0.11);
    g1.connect(ctx.destination);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 1000;
    o1.connect(g1);
    o1.start(now);
    o1.stop(now + 0.11);

    // Harmonic: 2000 Hz at 35% volume, 70 ms
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(0.025, now + 0.008);
    g2.gain.linearRampToValueAtTime(0, now + 0.07);
    g2.connect(ctx.destination);

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = 2000;
    o2.connect(g2);
    o2.start(now);
    o2.stop(now + 0.07);
  }, []);

  useEffect(() => () => {
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
  }, []);

  return { prepare, play };
}
