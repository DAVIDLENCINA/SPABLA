"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { spablaTrace, setTraceContext } from "@/app/chat/debug/spablaTrace";

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

  useEffect(() => {
    callStatusRef.current = callStatus;
    spablaTrace("CALL_STATUS_CHANGE", { status: callStatus });
  }, [callStatus]);

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
          spablaTrace("INCOMING_CALL", { callSignalId: row.id, callerId: row.caller_id, mode: row.call_mode ?? "voice" });
          setTraceContext({ callId: row.id });
          setIncomingCall({ id: row.id, callerId: row.caller_id, mode: (row.call_mode ?? "voice") as "voice" | "video" });
          setCallStatus("incoming");
        }
        return;
      }

      if (payload.eventType === "UPDATE") {
        const next = row.status as CallStatus;
        spablaTrace("CALL_UPDATE_RECEIVED", {
          rowId: row.id,
          rowStatus: next,
          rowCallerId: row.caller_id,
          myUserId: userId,
          isMyOutgoing: row.caller_id === userId,
          outgoingCallIdMatches: outgoingCallIdRef.current === row.id,
          currentCallStatus: callStatusRef.current,
        });

        // Update on our own outgoing call.
        // Same batching hazard as the callee branch below: setCallStatus(next)
        // and reset() (which contains its own setCallStatus("idle")) are both
        // synchronous state updates inside a Supabase Realtime callback → React
        // 18/19 auto-batching collapses them into a single re-render with the
        // final value "idle". The callStatus effect in page.tsx then observes
        // "accepted → idle" directly and skips webrtc.endCall() (its else branch
        // is guarded by `if (status !== 'idle')`). Deferring reset via
        // setTimeout(reset, 0) makes React commit "ended"/"cancelled"/"missed"
        // first so the effect can tear down webrtc, then commit "idle".
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
            setTimeout(reset, 0);   // ← cancelled / missed / ended → visible transition first
          }
          return;
        }

        // Update on an incoming call we are tracking (accepted = call in progress).
        // 'ended' MUST route through setCallStatus(next) BEFORE reset() so the
        // callStatus effect in page.tsx (which observes accepted → non-idle → non-accepted)
        // fires webrtc.endCall(). Skipping directly to reset() → 'idle' bypasses that
        // effect and leaves PC / socket / Realtime session alive on the callee.
        if (row.caller_id !== userId &&
            (callStatusRef.current === "incoming" || callStatusRef.current === "accepted")) {
          if (next === "cancelled" || next === "missed" || next === "ended") {
            setCallStatus(next);
            setIncomingCall(null);
            setTimeout(reset, 0);
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
    spablaTrace(mode === "video" ? "START_VIDEO_REQUEST" : "START_VOICE_REQUEST", {
      hasConversationId: !!conversationId,
      hasUserId: !!userId,
      currentCallStatus: callStatusRef.current,
    });
    if (!conversationId || !userId) {
      spablaTrace(mode === "video" ? "START_VIDEO_REQUEST" : "START_VOICE_REQUEST", { aborted: "missing-conversation-or-user" });
      return null;
    }
    if (callStatusRef.current !== "idle") {
      spablaTrace(mode === "video" ? "START_VIDEO_REQUEST" : "START_VOICE_REQUEST", { aborted: "not-idle", callStatus: callStatusRef.current });
      return null;
    }

    const { data, error } = await supabase
      .from("call_signals")
      .insert({ conversation_id: conversationId, caller_id: userId, status: "ringing", call_mode: mode })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("[CALL] initiateCall failed:", error);
      spablaTrace(mode === "video" ? "START_VIDEO_REQUEST" : "START_VOICE_REQUEST", {
        aborted: "insert-failed",
        errorName: (error as any)?.name ?? null,
        errorMessage: error?.message ?? null,
        errorCode: (error as any)?.code ?? null,
      });
      return null;
    }

    const id = data.id as string;
    outgoingCallIdRef.current = id;
    setOutgoingCallId(id);
    setTraceContext({ callId: id });
    spablaTrace(mode === "video" ? "START_VIDEO_REQUEST" : "START_VOICE_REQUEST", { inserted: true, callSignalId: id });
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
    spablaTrace("CALL_ACCEPTED", { signalId, from: "self" });
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
      spablaTrace("CALL_ACCEPTED", { signalId, updateFailed: true, errorMessage: error.message ?? null });
      return;
    }
    clearRingTimeout();
    spablaTrace("CALL_STATUS_SET", { from: "acceptCall", to: "accepted", signalId });
    setCallStatus("accepted");
  }, [clearRingTimeout]);

  const rejectCall = useCallback(async (signalId: string): Promise<void> => {
    spablaTrace("CALL_REJECTED", { signalId, from: "self" });
    const { error } = await supabase
      .from("call_signals")
      .update({ status: "rejected" })
      .eq("id", signalId);
    if (error) { console.error("[CALL] rejectCall failed:", error); spablaTrace("CALL_REJECTED", { signalId, updateFailed: true }); return; }
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
    spablaTrace("CALL_ENDED", { signalId, from: "self" });
    const { error } = await supabase
      .from("call_signals")
      .update({ status: "ended" })
      .eq("id", signalId);
    if (error) { console.error("[CALL] endCall failed:", error); spablaTrace("CALL_ENDED", { signalId, updateFailed: true }); }
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
