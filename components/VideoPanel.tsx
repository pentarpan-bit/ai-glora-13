

import React, { useState, useEffect, useCallback, useRef } from 'react';
// Fix: Removed non-exported type `VideosOperation`.
import { getAiClient, fileToBase64 } from '../services/geminiService';

const LOADING_MESSAGES = [
    "Initializing quantum video synthesizer...",
    "Teaching pixels to dance...",
    "Warming up the creativity cores...",
    "Reticulating splines...",
    "Polishing the final cut...",
    "This can take a few minutes, please be patient...",
];

export const VideoPanel: React.FC = () => {
    const [prompt, setPrompt] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [apiKeyReady, setApiKeyReady] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const videoRef = useRef<HTMLVideoElement>(null);

    const checkApiKey = useCallback(async () => {
        if(window.aistudio && await window.aistudio.hasSelectedApiKey()) {
            setApiKeyReady(true);
        } else {
            setApiKeyReady(false);
        }
    }, []);

    useEffect(() => {
        checkApiKey();
    }, [checkApiKey]);
    
    useEffect(() => {
        let interval: number;
        if (isLoading) {
            setLoadingMessage(LOADING_MESSAGES[0]);
            interval = window.setInterval(() => {
                setLoadingMessage(prev => {
                    const currentIndex = LOADING_MESSAGES.indexOf(prev);
                    const nextIndex = (currentIndex + 1) % LOADING_MESSAGES.length;
                    return LOADING_MESSAGES[nextIndex];
                });
            }, 4000);
        }
        return () => clearInterval(interval);
    }, [isLoading]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate, generatedVideoUrl]);


    const handleSelectKey = async () => {
        if (window.aistudio) {
            await window.aistudio.openSelectKey();
            // Assume success to avoid race conditions and re-render the UI
            setApiKeyReady(true);
        }
    }

    const handleGenerateVideo = async () => {
        if (!prompt && !image) {
            setError('Please enter a prompt or upload an image.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setGeneratedVideoUrl(null);

        try {
            const ai = getAiClient();
            const apiKey = process.env.API_KEY;

            // Fix: Removed type annotation for `operation` to allow type inference, as `VideosOperation` is not exported.
            let operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: prompt,
                ...(image && { 
                    image: { 
                        imageBytes: await fileToBase64(image), 
                        mimeType: image.type 
                    } 
                }),
                config: {
                    numberOfVideos: 1,
                    resolution: '720p',
                    aspectRatio: '16:9'
                }
            });

            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await ai.operations.getVideosOperation({ operation: operation });
            }

            if (operation.error) {
                // Fix: Cast operation.error.message to string to resolve type error.
                throw new Error(String(operation.error.message));
            }

            const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (downloadLink) {
                 const response = await fetch(`${downloadLink}&key=${apiKey}`);
                 const videoBlob = await response.blob();
                 setGeneratedVideoUrl(URL.createObjectURL(videoBlob));
            } else {
                throw new Error("Video generation completed, but no download link was found.");
            }

        } catch (e: any) {
             console.error('Video generation error:', e);
            let errorMessage = e.message || 'An unknown error occurred.';
            if (errorMessage.includes("Requested entity was not found.")) {
                errorMessage = "API Key error. Please re-select your key and try again.";
                setApiKeyReady(false); // Reset key state
            }
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setImage(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleDownloadVideo = () => {
        if (!generatedVideoUrl) return;
        const link = document.createElement('a');
        link.href = generatedVideoUrl;
        link.download = `glora-ai-video-${new Date().toISOString()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    if (!apiKeyReady) {
        return (
             <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <h2 className="text-2xl font-bold text-white mb-4">API Key Required for Video Generation</h2>
                <p className="text-slate-400 max-w-md mb-6">
                    Video generation with Veo requires you to select your own API key. This ensures that you are aware of the associated usage and billing.
                </p>
                <button onClick={handleSelectKey} className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all">
                    Select API Key
                </button>
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-sm text-teal-300 mt-4 hover:underline">
                    Learn more about billing
                </a>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 flex flex-col items-center h-full overflow-y-auto">
            <div className="w-full max-w-3xl">
                <h2 className="text-3xl font-orbitron text-yellow-300 [text-shadow:0_0_8px_#fde047] mb-2">Video Generation Studio</h2>
                <p className="text-slate-400 mb-6">Describe the video you want to create. You can also provide a starting image.</p>
                
                <div className="space-y-4 mb-6">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., A neon hologram of a cat driving at top speed"
                        className="w-full p-3 bg-slate-700/50 rounded-lg border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all text-white placeholder-slate-400"
                        rows={3}
                        disabled={isLoading}
                    />
                     <div className="flex items-center gap-4">
                        <label htmlFor="image-upload" className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                           {imagePreview ? 'Change Image' : 'Upload Start Image (Optional)'}
                        </label>
                        <input id="image-upload" type="file" onChange={handleFileChange} accept="image/*" className="hidden" disabled={isLoading} />
                         {imagePreview && (
                            <div className="relative w-24 h-14">
                                <img src={imagePreview} alt="preview" className="rounded-lg object-cover w-full h-full" />
                                <button onClick={() => { setImage(null); setImagePreview(null); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-6 w-6 flex items-center justify-center text-xs">&times;</button>
                            </div>
                        )}
                    </div>
                </div>

                <button onClick={handleGenerateVideo} disabled={isLoading || (!prompt && !image)} className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold py-3 px-4 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    {isLoading ? 'Generating...' : 'Generate Video'}
                </button>
                
                {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
                
                <div className="mt-8 w-full">
                    {isLoading && (
                        <div className="text-center p-8 bg-slate-800/50 rounded-lg border border-dashed border-slate-600">
                            <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-lg font-semibold text-white">{loadingMessage}</p>
                            <p className="text-sm text-slate-400">Video generation is a complex process and may take a few minutes.</p>
                        </div>
                    )}
                    {generatedVideoUrl && (
                         <div className="text-center">
                             <h3 className="text-2xl font-semibold mb-4 text-white">Your masterpiece is ready!</h3>
                             <video ref={videoRef} src={generatedVideoUrl} controls autoPlay loop className="w-full rounded-lg shadow-2xl shadow-black/50"></video>
                             
                             <div className="mt-4 flex items-center justify-center gap-4">
                                <span className="text-sm font-medium text-slate-400">Playback Speed:</span>
                                <div className="flex items-center gap-2">
                                    {[0.5, 1, 1.5, 2].map((rate) => (
                                        <button
                                            key={rate}
                                            onClick={() => setPlaybackRate(rate)}
                                            className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                                                playbackRate === rate
                                                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white'
                                                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                            }`}
                                        >
                                            {rate}x
                                        </button>
                                    ))}
                                </div>
                            </div>
                             
                             <button
                                onClick={handleDownloadVideo}
                                className="mt-6 bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-900 font-bold py-3 px-6 rounded-lg hover:opacity-90 transition-all transform hover:scale-105"
                             >
                                Download Video
                             </button>
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
};
