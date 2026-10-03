"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { FileLayout } from "@/components/agent/agent-file";
import { ChatColumn, localStamp } from "@/components/agent/chat-column";
import { PerformanceColumn } from "@/components/agent/performance-column";
import { RecruitChat } from "@/components/recruit/recruit-chat";
import { RecruitPerformance } from "@/components/recruit/recruit-performance";
import { refreshVault } from "@/components/use-vault";
import { api, type StoredAgent } from "@/lib/api";
import { initialRecruit, isRecruiting, recruitPrompt, recruitReducer } from "@/lib/recruit";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** /agents/new: describe a strategy, watch POST /agents compile, backtest and red-team it. */
export function RecruitScreen() {
  const [state, dispatch] = useReducer(recruitReducer, initialRecruit);
  const [input, setInput] = useState("");
  const mounted = useRef(true);

  // The stream is not aborted on leaving: the server finishes and files the agent either way, so
  // the sidebar still gains it. Only the URL change and the introduction need this page.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function recruit() {
    if (isRecruiting(state) || state.phase === "ready") return;
    const prompt = recruitPrompt(input);
    if (!prompt) {
      dispatch({ type: "refused", message: "describe a strategy first", ts: localStamp() });
      return;
    }
    dispatch({ type: "start", prompt, ts: localStamp() });

    let filed: StoredAgent | null = null;
    try {
      for await (const event of api.createAgent(prompt)) {
        dispatch({ type: "event", event, ts: localStamp() });
        if (event.event === "done") filed = event.data.agent;
        if (event.event === "error") return;
      }
    } catch (error) {
      dispatch({ type: "failed", message: errorText(error), ts: localStamp() });
      return;
    }
    if (!filed) {
      dispatch({ type: "failed", message: "the stream ended before the agent was filed", ts: localStamp() });
      return;
    }

    refreshVault();
    if (!mounted.current) return;
    const { id } = filed;
    // history.replaceState keeps this page mounted (router.replace would swap in /agents/[id] and
    // drop the transcript) while a reload lands on the new agent's file.
    window.history.replaceState(null, "", `/agents/${encodeURIComponent(id)}`);

    await Promise.all([
      api.agent(id).then(
        (agent) => dispatch({ type: "loaded", agent }),
        (error: unknown) => dispatch({ type: "loadFailed", message: errorText(error), ts: localStamp() }),
      ),
      api.chat(id).then(
        (reply) => dispatch({ type: "introduced", reply }),
        (error: unknown) => dispatch({ type: "introFailed", message: errorText(error), ts: localStamp() }),
      ),
    ]);
  }

  const { agent } = state;
  const live = agent !== null && state.phase === "ready";

  return (
    <FileLayout
      label="New agent"
      chat={(className) =>
        live ? (
          <ChatColumn agent={agent} initialLines={state.lines} className={className} />
        ) : (
          <RecruitChat
            state={state}
            input={input}
            onInput={setInput}
            onRecruit={() => void recruit()}
            className={className}
          />
        )
      }
      perf={(className) =>
        agent ? (
          <PerformanceColumn agent={agent} className={className} />
        ) : (
          <RecruitPerformance state={state} className={className} />
        )
      }
    />
  );
}
