
import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { VoicePanel } from './components/VoicePanel';
import { VideoPanel } from './components/VideoPanel';
import { DOMAINS } from './constants';
import type { Domain } from './types';
import { ChatIcon, VideoIcon, VoiceIcon } from './components/Icons';

type Feature = 'chat' | 'voice' | 'video';

const App: React.FC = () => {
  const [activeDomain, setActiveDomain] = useState<Domain>(DOMAINS[0]);
  const [activeFeature, setActiveFeature] = useState<Feature>('chat');

  const FeatureButton: React.FC<{
    feature: Feature;
    // Fix: Prefixed JSX.Element with React to resolve "Cannot find namespace 'JSX'" error.
    icon: React.JSX.Element;
    label: string;
  }> = ({ feature, icon, label }) => (
    <button
      onClick={() => setActiveFeature(feature)}
      className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2 px-4 py-2 rounded-lg transition-all duration-300 transform hover:scale-105 ${
        activeFeature === feature
          ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-cyan-500/30'
          : 'bg-slate-700/50 hover:bg-slate-600/70 text-slate-300'
      }`}
    >
      {icon}
      <span className="text-xs sm:text-sm font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden">
      <Sidebar activeDomain={activeDomain} setActiveDomain={setActiveDomain} />
      <main className="flex-1 flex flex-col bg-slate-800/50 backdrop-blur-sm">
        <header className="flex flex-col sm:flex-row justify-between items-center p-4 border-b border-slate-700/50 bg-slate-900/30">
          <div className="flex items-center gap-3">
             <h1 className="text-xl md:text-2xl font-orbitron text-yellow-300 [text-shadow:0_0_8px_#fde047] tracking-wider">
               Glora AI: <span className="text-white font-semibold">{activeDomain.name}</span>
             </h1>
             <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" title="Live Connection: AI is auto-updating"></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 mt-2 sm:mt-0">
            <FeatureButton feature="chat" icon={<ChatIcon />} label="Chat" />
            <FeatureButton feature="voice" icon={<VoiceIcon />} label="Voice" />
            <FeatureButton feature="video" icon={<VideoIcon />} label="Video" />
          </div>
        </header>
        <div className="flex-1 relative overflow-hidden">
          <div className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${activeFeature === 'chat' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <ChatPanel domain={activeDomain} />
          </div>
          <div className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${activeFeature === 'voice' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <VoicePanel domain={activeDomain} />
          </div>
          <div className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${activeFeature === 'video' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <VideoPanel />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
