"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export type CallStatus =
  | "idle"
  | "ringing"
  | "incoming"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "missed"
  | "ended";

export type IncomingCall = {
  id:       string;
  callerId: string;
  mode:     "voice" | "video";
};

type CallSignalRow = {
  id:              string;
  conversation_id: string;
  caller_id:       string;
  status:          string;
  call_mode:       string | null;
};

const RING_TIMEOUT_MS = 30_000;

export function useCallSignaling(
  conversationId: string | null,
  userId:         string | null
) {
  const [callStatus,    setCallStatus]    = useState<CallStatus>("idle");
  const [incomingCall,  setIncomingCall]  = useState<IncomingCall | null>(null);
  const [outgoingCallId, setOutgoingCallId] = useState<string | null>(null);

  // Refs so event handlers always see current values without stale closures
  const callStatusRef     = useRef<CallStatus>("idle");
  const outgoingCallIdRef = useRef<string | null>(null);
  const ringTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { callStatusRef.current = callStatus; }, [callStatus]);

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearRingTimeout();
    outgoingCallIdRef.current = null;
    setCallStatus("idle");
    setIncomingCall(null);
    setOutgoingCallId(null);
  }, [clearRingTimeout]);

  // ── Realtime handler ──────────────────────────────────────────────────────

  const handleChange = useCallback(
    (payload: { eventType: string; new: CallSignalRow }) => {
      console.log("[CALL] PAYLOAD_RECEIVED", payload);
      const row = payload.new;
      if (!row?.id) return;

      if (payload.eventType === "INSERT") {
        // Incoming call — not initiated by us, and we are currently idle
        console.log("[CALL] INCOMING_CHECK", {
          rowCallerId: row.caller_id,
          userId,
          callStatus: callStatusRef.current,
          isDifferentCaller: row.caller_id !== userId,
          isIdle: callStatusRef.current === "idle",
        });
        if (row.caller_id !== userId && callStatusRef.current === "idle") {
          console.log("[CALL] INCOMING_CALL_DETECTED", row);
          setIncomingCall({ id: row.id, callerId: row.caller_id, mode: (row.call_mode ?? "voice") as "voice" | "video" });
          setCallStatus("incoming");
        }
        return;
      }

      if (payload.eventType === "UPDATE") {
        const next = row.status as CallStatus;

        // Update on our own outgoing call
        if (
          row.caller_id === userId &&
          (
            outgoingCallIdRef.current === row.id ||
            callStatusRef.current === "ringing"
          )
        ) {
          clearRingTimeout();
          setCallStatus(next);
          if (next === "rejected") {
            setTimeout(reset, 2000); // brief window to show "rejected" state
          } else if (next !== "accepted") {
            reset(); // cancelled / missed / ended → back to idle immediately
          }
          return;
        }

        // Update on an incoming call we are tracking (accepted = call in progress)
        if (row.caller_id !== userId &&
            (callStatusRef.current === "incoming" || callStatusRef.current === "accepted")) {
          if (next === "cancelled" || next === "missed") {
            setCallStatus(next);
            setIncomingCall(null);
            setTimeout(reset, 0);
          } else if (next === "ended") {
            reset();
          }
        }
      }
    },
    [userId, clearRingTimeout, reset]
  );

  // ── Subscription ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!conversationId || !userId) return;

    console.log("[CALL] SUBSCRIBING", { conversationId, userId });
    console.warn("[CALL][IDENTITY] userId in this browser:", userId, "— compare with the other browser to confirm they differ");
    const channel = supabase
      .channel(`call_signals:${conversationId}`)
      .on<CallSignalRow>(
        "postgres_changes",
        {
          event:  "*",
          schema: "public",
          table:  "call_signals",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => handleChange(payload as any)
      )
      .subscribe((status) => {
        console.log("[CALL] CHANNEL_STATUS", status);
      });

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, userId, handleChange]);

  useEffect(() => () => clearRingTimeout(), [clearRingTimeout]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const initiateCall = useCallback(async (mode: "voice" | "video" = "voice"): Promise<string | null> => {
    if (!conversationId || !userId) return null;
    if (callStatusRef.current !== "idle") return null;

    const { data, error } = await supabase
      .from("call_signals")
      .insert({ conversation_id: conversationId, caller_id: userId, status: "ringing", call_mode: mode })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("[CALL] initiateCall failed:", error);
      return null;
    }

    const id = data.id as string;
    outgoingCallIdRef.current = id;
    setOutgoingCallId(id);
    setCallStatus("ringing");

    // Auto-miss after 30 s if receiver does not answer
    ringTimeoutRef.current = setTimeout(async () => {
      await supabase
        .from("call_signals")
        .update({ status: "missed" })
        .eq("id", id);
      reset();
    }, RING_TIMEOUT_MS);

    return id;
  }, [conversationId, userId, reset]);

  const acceptCall = useCallback(async (signalId: string): Promise<void> => {
    console.log("[CALL][ACCEPT] signalId:", signalId);
    const { data: { session } } = await supabase.auth.getSession();
    console.log("[CALL][ACCEPT] session:", {
      hasSession:  !!session,
      userId:      session?.user?.id ?? null,
      expiresAt:   session?.expires_at ?? null,
      hasToken:    !!session?.access_token,
    });

    const { error } = await supabase
      .from("call_signals")
      .update({ status: "accepted" })
      .eq("id", signalId);
    if (error) {
      console.error("[CALL] acceptCall failed:", {
        name:    (error as any).name    ?? null,
        message: error.message          ?? null,
        code:    error.code             ?? null,
        details: error.details          ?? null,
        hint:    error.hint             ?? null,
      });
      return;
    }
    clearRingTimeout();
    setCallStatus("accepted");
  }, [clearRingTimeout]);

  const rejectCall = useCallback(async (signalId: string): Promise<void> => {
    const { error } = await supabase
      .from("call_signals")
      .update({ status: "rejected" })
      .eq("id", signalId);
    if (error) { console.error("[CALL] rejectCall failed:", error); return; }
    setIncomingCall(null);
    setCallStatus("rejected");
    setTimeout(reset, 2000);
  }, [reset]);

  const cancelCall = useCallback(async (signalId: string): Promise<void> => {
    const { error } = await supabase
      .from("call_signals")
      .update({ status: "cancelled" })
      .eq("id", signalId);
    if (error) { console.error("[CALL] cancelCall failed:", error); return; }
    clearRingTimeout();
    reset();
  }, [clearRingTimeout, reset]);

  const endCall = useCallback(async (signalId: string): Promise<void> => {
    const { error } = await supabase
      .from("call_signals")
      .update({ status: "ended" })
      .eq("id", signalId);
    if (error) console.error("[CALL] endCall failed:", error);
    reset();
  }, [reset]);

  return {
    callStatus,
    incomingCall,
    outgoingCallId,
    initiateCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
  };
}
