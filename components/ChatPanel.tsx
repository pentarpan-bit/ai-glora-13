

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Chat } from '@google/genai';
import { GoogleGenAI } from '@google/genai';
import type { Domain, ChatMessage, GroundingChunk } from '../types';
import { Role } from '../types';
import { getAiClient, fileToBase64 } from '../services/geminiService';
import Markdown from 'react-markdown';
import { MicrophoneIcon } from './Icons';

interface ChatPanelProps {
  domain: Domain;
}

const LoadingIndicator: React.FC = () => (
    <div className="flex items-center justify-center space-x-2">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
    </div>
);

export const ChatPanel: React.FC<ChatPanelProps> = ({ domain }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [input, setInput] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [groundingChunks, setGroundingChunks] = useState<GroundingChunk[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Fix: Use `any` for SpeechRecognition ref type to avoid "Cannot find name 'SpeechRecognition'" error.
  const recognitionRef = useRef<any | null>(null);

  useEffect(() => {
    const ai = getAiClient();
    const newChat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: domain.systemInstruction,
        tools: [{googleSearch: {}}]
      },
    });
    setChat(newChat);
    setMessages([]);
    setGroundingChunks([]);
  }, [domain]);
  
  useEffect(() => {
    // Fix: Cast window to any to avoid property does not exist error for SpeechRecognition.
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition is not supported by this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                transcript += event.results[i][0].transcript + ' ';
            }
        }
        if(transcript){
             setInput(prevInput => prevInput + transcript);
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
      recognition.stop();
    };
}, []);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() && !image) return;
    if (isListening) {
        recognitionRef.current?.stop();
    }

    const userMessage: ChatMessage = {
      role: Role.USER,
      text: input,
      image: imagePreview || undefined,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setInput('');
    setImage(null);
    setImagePreview(null);
    setGroundingChunks([]);

    try {
        if (image) {
            const ai = getAiClient();
            const base64Image = await fileToBase64(image);
            const imagePart = { inlineData: { mimeType: image.type, data: base64Image } };
            const textPart = { text: input };
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, textPart] },
                config: { systemInstruction: domain.systemInstruction },
            });

            const modelMessage: ChatMessage = {
                role: Role.MODEL,
                text: response.text,
                timestamp: new Date().toLocaleTimeString(),
            };
            setMessages((prev) => [...prev, modelMessage]);

        } else if (chat) {
            const stream = await chat.sendMessageStream({ message: input });
            let streamedText = '';
            let modelMessage: ChatMessage = {
                role: Role.MODEL,
                text: '',
                timestamp: new Date().toLocaleTimeString(),
            };
            setMessages((prev) => [...prev, modelMessage]);

            for await (const chunk of stream) {
                streamedText += chunk.text;
                setMessages((prev) =>
                    prev.map((msg, index) =>
                        index === prev.length - 1 ? { ...msg, text: streamedText } : msg
                    )
                );

                const chunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
                if(chunks){
                   setGroundingChunks(prevChunks => [...prevChunks, ...chunks]);
                }
            }
        }
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
  }, [input, image, imagePreview, chat, domain.systemInstruction, isListening]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

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
              {msg.image && <img src={msg.image} alt="upload" className="rounded-lg mb-2 max-h-60" />}
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

       {groundingChunks.length > 0 && (
         <div className="flex-shrink-0 p-3 bg-slate-800 rounded-lg">
            <h4 className="text-xs font-semibold text-gray-400 mb-2">Sources from Google Search:</h4>
            <div className="flex flex-wrap gap-2">
                {/* Fix: Used a type guard with `.filter()` to correctly narrow the type of `uri` to `string`. */}
                {Array.from(new Set(groundingChunks.map(c => c.web?.uri))).filter((uri): uri is string => !!uri).map((uri, i) => (
                     <a href={uri} key={i} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-300 bg-slate-700 px-2 py-1 rounded-md hover:bg-slate-600 transition-colors">
                        {new URL(uri).hostname}
                     </a>
                ))}
            </div>
         </div>
       )}

      <div className="flex-shrink-0 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 shadow-2xl">
        {imagePreview && (
          <div className="relative mb-2 w-24">
            <img src={imagePreview} alt="preview" className="rounded-lg" />
            <button onClick={() => { setImage(null); setImagePreview(null); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-6 w-6 flex items-center justify-center text-xs">&times;</button>
          </div>
        )}
        <div className="flex items-center gap-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
            placeholder={isListening ? 'Listening...' : domain.placeholder}
            className="flex-1 bg-transparent border-none focus:ring-0 resize-none text-gray-200 placeholder-slate-500"
            rows={1}
            disabled={isLoading}
          />
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="p-2 rounded-full hover:bg-slate-700 transition-colors text-gray-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </button>
          <button onClick={handleToggleListening} disabled={isLoading} className={`p-2 rounded-full transition-colors text-slate-400 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-slate-700 hover:text-white'}`}>
            <MicrophoneIcon />
          </button>
          <button onClick={handleSendMessage} disabled={isLoading || (!input.trim() && !image)} className="p-2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors text-white">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};