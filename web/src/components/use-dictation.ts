"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { appendDictation, transcriptOf } from "@/lib/dictation";

// lib.dom ships the result types but not the recognizer itself; this is the slice we use.
type Recognizer = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: SpeechRecognitionResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognizerClass = new () => Recognizer;

function recognizerClass(): RecognizerClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

/** Dictates into a text box through the browser's speech recognition; it appends, never sends. */
export function useDictation(value: string, onChange: (next: string) => void) {
  // Rendered on the server as unsupported, then the client says whether the browser can listen.
  const supported = useSyncExternalStore(noSubscribe, () => recognizerClass() !== null, () => false);
  const [listening, setListening] = useState(false);
  const recognizer = useRef<Recognizer | null>(null);
  const latest = useRef({ value, onChange });

  useEffect(() => {
    latest.current = { value, onChange };
  });

  useEffect(() => () => recognizer.current?.abort(), []);

  function start() {
    const Recognition = recognizerClass();
    if (!Recognition) return;
    const base = latest.current.value;
    const r = new Recognition();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (event) => latest.current.onChange(appendDictation(base, transcriptOf(event.results)));
    r.onend = () => {
      if (recognizer.current === r) recognizer.current = null;
      setListening(false);
    };
    r.onerror = r.onend;
    recognizer.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      recognizer.current = null;
      setListening(false);
    }
  }

  function toggle() {
    if (recognizer.current) recognizer.current.stop();
    else start();
  }

  return { supported, listening, toggle };
}
