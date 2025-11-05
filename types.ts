
import type React from 'react';

export enum Role {
  USER = 'user',
  MODEL = 'model',
}

export interface ChatMessage {
  role: Role;
  text: string;
  image?: string;
  timestamp: string;
}

export interface Domain {
  id: string;
  name: string;
  // Fix: Prefixed JSX.Element with React to resolve "Cannot find namespace 'JSX'" error.
  icon: React.JSX.Element;
  systemInstruction: string;
  placeholder: string;
}

export interface GroundingChunk {
  web?: {
    // Fix: Made web properties optional to match the Gemini API type and resolve type conflicts.
    uri?: string;
    title?: string;
  };
}
