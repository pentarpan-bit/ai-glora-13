
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Chat } from '@google/genai';
import { Modality } from '@google/genai';
import type { Domain, ChatMessage } from '../types';
import { Role } from '../types';
import { getAiClient } from '../services/geminiService';
import Markdown from 'react-markdown';
import { MicrophoneIcon } from './Icons';

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

const LoadingIndicator: React.FC = () => (
    <div className="flex items-center justify-center space-x-2">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
    </div>
);


interface VoicePanelProps {
  domain: Domain;
}

export const VoicePanel: React.FC<VoicePanelProps> = ({ domain }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [input, setInput] = useState('');
  const [chat, setChat] = useState<Chat | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);

  // Initialize chat session
  useEffect(() => {
    const ai = getAiClient();
    const newChat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: domain.systemInstruction,
      },
    });
    setChat(newChat);
    setMessages([]);
  }, [domain]);
  
  const speakText = useCallback(async (text: string) => {
    if (!text || !outputAudioContextRef.current) return;
    try {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio && outputAudioContextRef.current) {
            const audioCtx = outputAudioContextRef.current;
            const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                audioCtx,
                24000,
                1,
            );
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            source.start();
        }
    } catch(error) {
        console.error("TTS Error:", error);
    }
  }, []);

  const handleSendMessage = useCallback(async (text: string) => {
    const messageToSend = text.trim();
    if (!messageToSend || !chat) return;

    if (isListening) {
        recognitionRef.current?.stop();
    }

    const userMessage: ChatMessage = {
      role: Role.USER,
      text: messageToSend,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setInput('');

    try {
        const result = await chat.sendMessage(messageToSend);
        const modelResponseText = result.text;

        const modelMessage: ChatMessage = {
            role: Role.MODEL,
            text: modelResponseText,
            timestamp: new Date().toLocaleTimeString(),
        };
        setMessages((prev) => [...prev, modelMessage]);
        
        await speakText(modelResponseText);

    } catch (error) {
        console.error('Error sending message:', error);
        const errorMessage: ChatMessage = {
            role: Role.MODEL,
            text: 'Sorry, I encountered an error. Please try again.',
            timestamp: new Date().toLocaleTimeString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
    } finally {
        setIsLoading(false);
    }
  }, [chat, isListening, speakText]);

  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

  // Initialize SpeechRecognition
  useEffect(() => {
    // Fix: Cast window to any to avoid property does not exist error for SpeechRecognition.
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition is not supported by this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Stop after one utterance
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        if (transcript) {
             setInput(transcript);
             handleSendMessageRef.current(transcript);
        }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);


  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize AudioContext for playback
  useEffect(() => {
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    return () => {
        outputAudioContextRef.current?.close();
    }
  }, []);

  const handleToggleListening = () => {
    if (isLoading) return;
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };


  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <div className="flex-1 overflow-y-auto pr-4 space-y-6">
        {messages.map((msg, index) => (
          <div key={index} className={`flex gap-3 ${msg.role === Role.USER ? 'justify-end' : 'justify-start'}`}>
            {msg.role === Role.MODEL && <div className="w-8 h-8 bg-gradient-to-tr from-teal-400 to-cyan-400 rounded-full flex-shrink-0"></div>}
            <div className={`max-w-xl p-4 rounded-2xl shadow-md ${msg.role === Role.USER ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-br-none' : 'bg-slate-700 rounded-bl-none'}`}>
              <div className="prose prose-invert prose-sm max-w-none">
                 <Markdown>{msg.text}</Markdown>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-right">{msg.timestamp}</p>
            </div>
          </div>
        ))}
         {isLoading && (
            <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 bg-gradient-to-tr from-teal-400 to-cyan-400 rounded-full flex-shrink-0"></div>
                <div className="max-w-xl p-4 rounded-2xl shadow-md bg-slate-700 rounded-bl-none">
                    <LoadingIndicator />
                </div>
            </div>
         )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 shadow-2xl">
        <div className="flex items-center gap-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(input); } }}
            placeholder={isListening ? 'Listening... Tap mic to cancel' : 'Tap mic to speak, or type here...'}
            className="flex-1 bg-transparent border-none focus:ring-0 resize-none text-gray-200 placeholder-slate-500"
            rows={1}
            disabled={isLoading}
          />
          <button onClick={handleToggleListening} disabled={isLoading} className={`p-2 rounded-full transition-colors text-slate-400 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-slate-700 hover:text-white'}`}>
            <MicrophoneIcon />
          </button>
          <button onClick={() => handleSendMessage(input)} disabled={isLoading || !input.trim()} className="p-2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors text-white">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};
