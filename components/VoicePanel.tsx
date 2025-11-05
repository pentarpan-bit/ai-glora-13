

import React, { useState, useRef, useEffect, useCallback } from 'react';
// Fix: Removed non-exported type `LiveSession`.
import type { LiveServerMessage } from '@google/genai';
import { Modality } from '@google/genai';
import type { Domain } from '../types';
import { getAiClient } from '../services/geminiService';

// Helper function to decode base64 audio data
const decode = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Helper function to decode raw PCM audio into an AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

interface VoicePanelProps {
  domain: Domain;
}

export const VoicePanel: React.FC<VoicePanelProps> = ({ domain }) => {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Idle. Press the microphone to start.');
  const [transcripts, setTranscripts] = useState<{ speaker: 'user' | 'model'; text: string }[]>([]);

  // Fix: Changed `LiveSession` to `any` because it is not an exported type.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const stopListening = useCallback(() => {
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close());
        sessionPromiseRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsListening(false);
    setStatus('Session ended. Press to start again.');
  }, []);

  const startListening = useCallback(async () => {
    setIsListening(true);
    setStatus('Initializing...');
    setTranscripts([]);
    currentInputTranscription.current = '';
    currentOutputTranscription.current = '';

    try {
      const ai = getAiClient();
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      let nextStartTime = 0;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          systemInstruction: domain.systemInstruction,
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
        },
        callbacks: {
          onopen: () => {
            setStatus('Connected. Start speaking...');
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const source = audioContextRef.current.createMediaStreamSource(stream);
            scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              let binary = '';
              for (let i = 0; i < int16.buffer.byteLength; i++) {
                binary += String.fromCharCode(new Uint8Array(int16.buffer)[i]);
              }
              const base64Data = btoa(binary);

              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then((session) => {
                    session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
                });
              }
            };
            source.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(audioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
              // Handle transcriptions
              if (message.serverContent?.outputTranscription) {
                  currentOutputTranscription.current += message.serverContent.outputTranscription.text;
              }
              if (message.serverContent?.inputTranscription) {
                  currentInputTranscription.current += message.serverContent.inputTranscription.text;
              }
              if (message.serverContent?.turnComplete) {
                const finalInput = currentInputTranscription.current;
                const finalOutput = currentOutputTranscription.current;
                
                setTranscripts(prev => [
                    ...prev, 
                    { speaker: 'user', text: finalInput },
                    { speaker: 'model', text: finalOutput }
                ]);
                
                currentInputTranscription.current = '';
                currentOutputTranscription.current = '';
              }

              // Handle audio playback
              const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
              if (audioData && outputAudioContextRef.current) {
                  const audioCtx = outputAudioContextRef.current;
                  nextStartTime = Math.max(nextStartTime, audioCtx.currentTime);
                  const decodedBytes = decode(audioData);
                  const audioBuffer = await decodeAudioData(decodedBytes, audioCtx, 24000, 1);
                  const source = audioCtx.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(audioCtx.destination);
                  source.start(nextStartTime);
                  nextStartTime += audioBuffer.duration;
              }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Session error:', e);
            setStatus(`Error: ${e.message}. Please try again.`);
            stopListening();
          },
          onclose: () => {
            setStatus('Session closed.');
            // This does not stop the microphone, so we call stopListening
            if (isListening) stopListening();
          },
        },
      });
    } catch (error) {
      console.error('Failed to start listening:', error);
      setStatus(`Error: Could not access microphone. Please check permissions.`);
      setIsListening(false);
    }
  }, [domain.systemInstruction, stopListening, isListening]);
  
  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center text-slate-300">
      <div className="w-full max-w-2xl h-1/2 bg-slate-800/50 rounded-lg p-4 overflow-y-auto mb-6 border border-slate-700">
        {transcripts.length === 0 && <p className="text-slate-500">Conversation transcript will appear here...</p>}
        {transcripts.map((t, i) => (
            <p key={i} className={`mb-2 text-left ${t.speaker === 'user' ? 'text-teal-300' : 'text-white'}`}>
                <span className="font-bold capitalize">{t.speaker}: </span>{t.text}
            </p>
        ))}
      </div>
      <p className="text-lg font-medium mb-6 h-8">{status}</p>
      <button
        onClick={toggleListening}
        className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-opacity-50 ${
          isListening ? 'bg-red-600 focus:ring-red-400' : 'bg-gradient-to-r from-teal-500 to-cyan-500 focus:ring-cyan-400'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        {isListening && <div className="absolute inset-0 rounded-full bg-red-500/50 animate-ping"></div>}
      </button>
      <p className="mt-4 text-sm text-slate-500">
        {isListening ? 'Press to stop the session' : 'Press to start a voice conversation'}
      </p>
    </div>
  );
};
