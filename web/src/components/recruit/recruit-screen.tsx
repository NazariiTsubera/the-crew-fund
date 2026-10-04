"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { FileLayout } from "@/components/agent/agent-file";
import { ChatColumn } from "@/components/agent/chat-column";
import { PerformanceColumn } from "@/components/agent/performance-column";
import { RecruitChat } from "@/components/recruit/recruit-chat";
import { RecruitPerformance } from "@/components/recruit/recruit-performance";
import { refreshVault } from "@/components/use-vault";
import { api, type StoredAgent } from "@/lib/api";
import {
  initialRecruit,
  isRecruiting,
  recruitReducer,
} from "@/lib/recruit";

function errorText(error: unknown): string {
  return error instanceof Error
  ? error.message
  : String(error);
}

function timestamp(): string {
  return new Date()
  .toISOString()
  .replace("T", " ")
  .slice(0, 16);
}

export function RecruitScreen() {
  const [state, dispatch] = useReducer(
    recruitReducer,
    initialRecruit,
  );

  const [input, setInput] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  async function sendMessage() {
    const message = input.trim();

    if (
      !message ||
      isRecruiting(state)
    ) {
      return;
    }

    const ts = timestamp();

    dispatch({
      type: "user",
      text: message,
      ts,
    });

    setInput("");

    try {
      const response = await api.strategyChat(
        message,
        state.history,
        state.recipe,
      );

      dispatch({
        type: "assistant",
        text: response.reply,
        ts: timestamp(),
      });

      dispatch({
        type: "strategy",
        recipe: response.strategy,
        name: response.name,
        persona: response.persona,
        strategyLine: response.strategy_line,
        pitch: response.pitch,
        ready: response.ready,
      });
    } catch (error) {
      dispatch({
        type: "assistant",
        text: `I couldn't update the strategy: ${errorText(error)}`,
               ts: timestamp(),
      });
    }
  }

  async function recruit() {
    if (
      isRecruiting(state) ||
      !state.ready ||
      !state.name ||
      !state.persona ||
      !state.strategyLine ||
      !state.pitch
    ) {
      return;
    }

    const prompt =
    state.strategyLine ||
    "User-defined investment strategy";

        dispatch({
          type: "start",
          prompt,
          ts: timestamp(),
        });

        let filed: StoredAgent | null = null;

        try {
          for await (
            const event of api.createAgentFromStrategy(
              {
                prompt,
                strategy: state.recipe,
                name: state.name,
                persona: state.persona,
                strategy_line: state.strategyLine,
                pitch: state.pitch,
              },
            )
          ) {
            dispatch({
              type: "event",
              event,
              ts: timestamp(),
            });

            if (event.event === "done") {
              filed = event.data.agent;
            }

            if (event.event === "error") {
              return;
            }
          }
        } catch (error) {
          dispatch({
            type: "failed",
            message: errorText(error),
                   ts: timestamp(),
          });

          return;
        }

        if (!filed) {
          dispatch({
            type: "failed",
            message:
            "the stream ended before the agent was filed",
            ts: timestamp(),
          });

          return;
        }

        refreshVault();

        if (!mounted.current) return;

        const { id } = filed;

    window.history.replaceState(
      null,
      "",
      `/agents/${encodeURIComponent(id)}`,
    );

    await Promise.all([
      api.agent(id).then(
        (agent) =>
        dispatch({
          type: "loaded",
          agent,
        }),
        (error: unknown) =>
        dispatch({
          type: "loadFailed",
          message: errorText(error),
                 ts: timestamp(),
        }),
      ),

      api.chat(id).then(
        (reply) =>
        dispatch({
          type: "introduced",
          reply,
        }),
        (error: unknown) =>
        dispatch({
          type: "introFailed",
          message: errorText(error),
                 ts: timestamp(),
        }),
      ),
    ]);
  }

  const { agent } = state;
  const live =
  agent !== null &&
  state.phase === "ready";

  return (
    <FileLayout
    label="New agent"
    chat={(className) =>
      live ? (
        <ChatColumn
        agent={agent}
        initialLines={state.lines}
        className={className}
        />
      ) : (
        <RecruitChat
        state={state}
        input={input}
        onInput={setInput}
        onSend={() => void sendMessage()}
        onRecruit={() => void recruit()}
        className={className}
        />
      )
    }
    perf={(className) =>
      agent ? (
        <PerformanceColumn
        agent={agent}
        className={className}
        />
      ) : (
        <RecruitPerformance
        state={state}
        className={className}
        />
      )
    }
    />
  );
}
