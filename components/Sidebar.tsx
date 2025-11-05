
import React from 'react';
import { DOMAINS } from '../constants';
import type { Domain } from '../types';
import { HeartIcon, LoveLogoIcon, AppleIcon, AndroidIcon, DesktopIcon } from './Icons';

interface SidebarProps {
  activeDomain: Domain;
  setActiveDomain: (domain: Domain) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeDomain,
  setActiveDomain,
}) => {
  return (
    <aside className="hidden md:flex flex-col w-64 bg-slate-900/70 backdrop-blur-md border-r border-slate-700/50 p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2">
           <LoveLogoIcon />
          <h2 className="font-orbitron text-2xl font-bold text-yellow-300 [text-shadow:0_0_4px_#fde047]">Glora</h2>
        </div>
        <p className="text-xs text-slate-400 mt-3 leading-relaxed">
          An elegant, futuristic AI assistant with vast capabilities. Interact via text, voice, and image with a super-intellectual AI designed to analyze, strategize, and assist in all aspects of life.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 -mr-2">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Capabilities
        </h3>
        <nav className="space-y-1">
          {DOMAINS.map((domain) => (
            <button
              key={domain.id}
              onClick={() => setActiveDomain(domain)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeDomain.id === domain.id
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-md shadow-cyan-500/20'
                  : 'text-gray-300 hover:bg-slate-700/50 hover:text-white'
              }`}
            >
              {domain.icon}
              <span>{domain.name}</span>
            </button>
          ))}
        </nav>
      </div>

       <div className="flex-shrink-0 mt-auto pt-4 border-t border-slate-700/50">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Platforms
          </h3>
          <div className="flex space-x-4 text-gray-400 mb-4 items-center">
             <AppleIcon />
             <AndroidIcon />
             <DesktopIcon />
          </div>

          <div className="pt-4 mt-4 border-t border-slate-700/50">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Contact
            </h3>
            <div className="text-xs text-slate-400 space-y-2">
              <div>
                <p className="font-bold">Pemilik Utama & Pencipta AI Glora:</p>
                <a href="mailto:pentarpan@gmail.com" className="text-teal-300 hover:underline flex items-center gap-1">
                  <span className="opacity-75">📧</span> pentarpan@gmail.com
                </a>
              </div>
              <div>
                <p className="font-bold">Admin & Pengembang:</p>
                <a href="mailto:glorafamily6@gmail.com" className="text-teal-300 hover:underline flex items-center gap-1">
                  <span className="opacity-75">📧</span> glorafamily6@gmail.com
                </a>
              </div>
            </div>
          </div>
          
          <div className="text-xs text-gray-500 text-center pt-4 mt-4 border-t border-slate-700/50">
            Made with <HeartIcon />
          </div>
       </div>

    </aside>
  );
};
