import { useState, useRef, useEffect } from 'react';
import { parseSrt } from './utils/srtParser';
import { exportSrt, exportVtt } from './utils/srtExporter';
import { syncContinuousText, autoFormatText } from './utils/syncLogic';
import { extractAudioFromVideo } from './utils/audioExtractor';
import { detectLanguage } from './utils/languageDetector';
import VisualTimeline from './components/VisualTimeline';

function App() {
  const [subtitles, setSubtitles] = useState([]);
  const [continuousText, setContinuousText] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isLocalVideo, setIsLocalVideo] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [viewMode, setViewMode] = useState('block'); // 'block', 'text'
  const [isFormatting, setIsFormatting] = useState(false);
  const [currentVideoFile, setCurrentVideoFile] = useState(null);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);

  // New states for Smart Naming and Zoom
  const [srtFileName, setSrtFileName] = useState(null);
  const [videoFileName, setVideoFileName] = useState(null);
  const [targetLanguage, setTargetLanguage] = useState("PT-BR");
  const [zoomLevel, setZoomLevel] = useState(100);

  const getExportBaseName = () => {
    return srtFileName || videoFileName || "Subtitles";
  };

  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const animationRef = useRef(null);
  const videoRef = useRef(null);
  const continuousEditorRef = useRef(null);
  const blockRefs = useRef([]);
  const lastTimeRef = useRef(0);

  const [videoDuration, setVideoDuration] = useState(0);

  const maxTime = Math.max(
    subtitles.length > 0 ? Math.max(...subtitles.map(s => s.end)) + 2000 : 0,
    videoDuration > 0 ? videoDuration * 1000 : 0
  );

  useEffect(() => {
    if (document.activeElement !== continuousEditorRef.current) {
      setContinuousText(subtitles.map(sub => sub.text).join('\n\n'));
    }
  }, [subtitles]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      const parsed = parseSrt(content);
      setSubtitles(parsed);
      setTargetLanguage(detectLanguage(parsed));
      setSrtFileName(file.name.replace(/\.[^/.]+$/, ""));
      setCurrentTime(0);
      setIsPlaying(false);
    };
    reader.readAsText(file);
  };

  const handleVideoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCurrentVideoFile(file);
    setIsVideoLoading(true);
    setVideoFileName(file.name.replace(/\.[^/.]+$/, ""));
    if (videoUrl && videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoUrl(URL.createObjectURL(file));
    setIsLocalVideo(true);
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleGenerateCaptions = async () => {
    if (!currentVideoFile) return;

    setIsGeneratingCaptions(true);
    try {
      const audioBlob = await extractAudioFromVideo(currentVideoFile);

      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.wav');
      formData.append('model_id', 'scribe_v1');

      const apiKey = localStorage.getItem('ELEVENLABS_API_KEY') || prompt("Please enter your ElevenLabs API Key:");
      if (!apiKey) {
        setIsGeneratingCaptions(false);
        return;
      }
      localStorage.setItem('ELEVENLABS_API_KEY', apiKey);

      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text?output_format=srt', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${await response.text()}`);
      }

      const responseData = await response.text();
      let parsed = [];

      try {
        const json = JSON.parse(responseData);
        if (json.words && json.words.length > 0) {
          let chunks = [];
          let currentChunk = { id: 1, start: json.words[0].start * 1000, end: json.words[0].end * 1000, text: "" };
          let wordCount = 0;

          for (const w of json.words) {
            if (w.type === "spacing") continue;

            if (wordCount >= 7 || (w.start * 1000 - currentChunk.end > 500)) {
              if (currentChunk.text.trim()) chunks.push(currentChunk);
              currentChunk = { id: chunks.length + 1, start: w.start * 1000, end: w.end * 1000, text: "" };
              wordCount = 0;
            }

            const textToAdd = (w.text || "").trim();
            if (textToAdd) {
              currentChunk.text += (currentChunk.text ? " " : "") + textToAdd;
              currentChunk.end = w.end * 1000;
              wordCount++;
            }
          }
          if (currentChunk.text.trim()) chunks.push(currentChunk);
          parsed = chunks;
        } else {
          parsed = [];
        }
      } catch (e) {
        parsed = parseSrt(responseData);
      }

      setSubtitles(parsed);
      setTargetLanguage(detectLanguage(parsed));
      setCurrentTime(0);
    } catch (error) {
      console.error("Transcription error:", error);
      alert("Failed to transcribe audio: " + error.message);
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  useEffect(() => {
    if (videoUrl) return;

    if (isPlaying) {
      lastTimeRef.current = performance.now();

      const loop = (time) => {
        const delta = time - lastTimeRef.current;
        lastTimeRef.current = time;

        setCurrentTime((prev) => {
          const nextTime = prev + delta;
          if (nextTime >= maxTime && maxTime > 0) {
            setIsPlaying(false);
            return maxTime;
          }
          return nextTime;
        });

        if (isPlaying) {
          animationRef.current = requestAnimationFrame(loop);
        }
      };

      animationRef.current = requestAnimationFrame(loop);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, maxTime, videoUrl]);

  const handleNativeVideoLoaded = () => {
    setIsVideoLoading(false);
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  const handleNativeVideoTimeUpdate = () => {
    if (videoRef.current && isPlaying && isLocalVideo) {
      setCurrentTime(videoRef.current.currentTime * 1000);
    }
  };

  const togglePlayPause = () => {
    if (subtitles.length === 0 && !videoUrl) return;

    if (videoUrl) {
      if (!isPlaying && currentTime >= maxTime && maxTime > 0) {
        if (isLocalVideo && videoRef.current) videoRef.current.currentTime = 0;
        setCurrentTime(0);
      }

      if (isLocalVideo && videoRef.current) {
        if (isPlaying) {
          videoRef.current.pause();
        } else {
          videoRef.current.play().catch(e => console.error("Error playing video:", e));
        }
      }

      setIsPlaying(!isPlaying);
      return;
    }

    if (currentTime >= maxTime && !isPlaying && maxTime > 0) {
      setCurrentTime(0);
    }
    setIsPlaying(!isPlaying);
  };

  const activeSubtitle = subtitles.find(
    sub => currentTime >= sub.start && currentTime <= sub.end
  );

  useEffect(() => {
    if (activeSubtitle) {
      const activeIndex = subtitles.findIndex(s => s.id === activeSubtitle.id);
      if (activeIndex !== -1 && blockRefs.current[activeIndex]) {
        blockRefs.current[activeIndex].scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }

    if (continuousEditorRef.current && subtitles.length > 0 && maxTime > 0 && isPlaying) {
      const percentage = currentTime / maxTime;
      const scrollHeight = continuousEditorRef.current.scrollHeight;
      const clientHeight = continuousEditorRef.current.clientHeight;

      if (document.activeElement !== continuousEditorRef.current) {
        const targetScroll = Math.max(0, (scrollHeight * percentage) - (clientHeight / 2));
        continuousEditorRef.current.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      }
    }
  }, [activeSubtitle, currentTime, maxTime, isPlaying, subtitles]);

  const seekToTime = (timeMs) => {
    setCurrentTime(timeMs);
    if (videoUrl) {
      if (isLocalVideo && videoRef.current) {
        videoRef.current.currentTime = timeMs / 1000;
      }
    }
  };

  const handleContinuousChange = (e) => {
    const newText = e.target.value;
    setContinuousText(newText);
    const syncedSubtitles = syncContinuousText(newText, subtitles);
    setSubtitles(syncedSubtitles);
  };

  const handleContinuousClick = (e) => {
    const el = e.target;
    const cursorPos = el.selectionStart;

    let charCount = 0;
    for (let i = 0; i < subtitles.length; i++) {
      const blockLength = subtitles[i].text.length + (i < subtitles.length - 1 ? 2 : 0);

      if (cursorPos >= charCount && cursorPos <= charCount + blockLength) {
        seekToTime(subtitles[i].start);
        break;
      }

      charCount += blockLength;
    }
  };

  const handleAutoFormat = async () => {
    setIsFormatting(true);
    try {
      const formattedText = await autoFormatText(continuousText, 42, 2);
      const syncedSubtitles = syncContinuousText(formattedText, subtitles);
      setSubtitles(syncedSubtitles);
      setViewMode('block');
    } catch (e) {
      console.error(e);
    } finally {
      setIsFormatting(false);
    }
  };

  const handleBlockChange = (index, fieldOrObject, value) => {
    if (index === 'all') {
      setSubtitles(fieldOrObject);
      return;
    }

    const newSubs = [...subtitles];
    if (typeof fieldOrObject === 'object') {
      newSubs[index] = fieldOrObject;
    } else {
      newSubs[index] = { ...newSubs[index], [fieldOrObject]: value };
    }
    setSubtitles(newSubs);
  };

  const handleExport = () => {
    const content = exportSrt(subtitles);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const suffix = viewMode === 'text' ? 'formatado' : 'editado';
    a.download = `${getExportBaseName()}_${targetLanguage}_${suffix}.srt`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportVtt = () => {
    const content = exportVtt(subtitles);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const suffix = viewMode === 'text' ? 'formatado' : 'editado';
    a.download = `${getExportBaseName()}_${targetLanguage}_${suffix}.vtt`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeleteBlock = (idx) => {
    const newSubs = [...subtitles];
    newSubs.splice(idx, 1);
    setSubtitles(newSubs);
  };

  const handleAddBlock = () => {
    const lastSub = subtitles[subtitles.length - 1];
    const newStart = lastSub ? lastSub.end + 100 : 0;
    const newEnd = newStart + 2000;

    setSubtitles([...subtitles, {
      id: Date.now(),
      start: newStart,
      end: newEnd,
      text: "New Subtitle Block..."
    }]);
  };

  const formatTime = (ms) => {
    const date = new Date(ms || 0);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    const mll = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss},${mll}`;
  };

  const formatSimpleTime = (ms) => {
    const date = new Date(ms || 0);
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden selection:bg-purple-500/30">
      <header className="h-16 bg-[var(--bg-surface)] border-b border-[var(--border-dim)] flex items-center justify-between px-6 shrink-0 relative z-20">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <span className="material-symbols-outlined text-white text-[20px]">subtitles</span>
          </div>
          <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400 tracking-tight">
            SRT Editor <span className="font-light text-purple-300">Pro</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center bg-[var(--bg-deep)] rounded-lg p-1 border border-[var(--border-dim)]">
            <span className="text-xs font-mono text-[var(--accent-cyan)] px-3 py-1 border-r border-[var(--border-dim)]">
              {formatTime(currentTime).split(',')[0]}
            </span>
            <span className="text-xs font-mono text-[var(--text-muted)] px-3 py-1">
              {subtitles.length} blocks
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input type="file" accept=".srt" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <button className="btn-tactile text-[var(--text-secondary)] h-9 px-3 rounded-md flex items-center gap-2 text-sm font-medium" onClick={() => fileInputRef.current.click()}>
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              Import SRT
            </button>

            <div className="flex items-center gap-2 border-r border-white/10 pr-4 ml-2">
              <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Lang</span>
              <select
                className="bg-[var(--bg-deep)] border border-[var(--border-dim)] text-[var(--text-secondary)] text-xs rounded-md px-2 py-1 focus:ring-1 focus:ring-violet-500 outline-none"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
              >
                <option value="PT-BR">PT-BR</option>
                <option value="EN-US">EN-US</option>
                <option value="EN-UK">EN-UK</option>
                <option value="ES">ES</option>
                <option value="FR">FR</option>
              </select>
            </div>

            <div className="relative group flex ml-1">
              <button className="btn-primary-tactile text-white h-9 px-3 rounded-l-md flex items-center gap-2 text-sm font-medium border-r border-white/20" onClick={handleExport} disabled={subtitles.length === 0}>
                <span className="material-symbols-outlined text-[18px]">download</span> Export SRT
              </button>
              <button className="btn-primary-tactile text-white h-9 px-2 rounded-r-md flex items-center gap-2 text-sm font-medium" onClick={handleExportVtt} disabled={subtitles.length === 0} title="Export VTT">
                VTT
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden flex-col">
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Sidebar Editors */}
          <div className="w-[30%] min-w-[350px] flex flex-col border-r border-[var(--border-dim)] bg-[var(--bg-deep)] z-10">
            <div className="h-12 bg-[var(--bg-surface)] border-b border-[var(--border-dim)] flex items-center px-4 gap-2 shrink-0">
              <button
                className={`px-4 py-1.5 rounded text-xs font-medium transition-colors border ${viewMode === 'block' ? 'bg-[var(--bg-surface-active)] text-[var(--text-primary)] border-[var(--border-highlight)] shadow-sm' : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-light)]'}`}
                onClick={() => setViewMode('block')}
              >
                Block Editor
              </button>
              <button
                className={`px-4 py-1.5 rounded text-xs font-medium transition-colors border ${viewMode === 'text' ? 'bg-[var(--bg-surface-active)] text-[var(--text-primary)] border-[var(--border-highlight)] shadow-sm' : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-light)]'}`}
                onClick={() => setViewMode('text')}
              >
                Text View
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {subtitles.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm flex-col gap-4">
                  <span className="material-symbols-outlined text-4xl opacity-50">subtitles_off</span>
                  <p>Import an SRT or generate captions from a video</p>
                </div>
              ) : viewMode === 'block' ? (
                <div className="flex flex-col gap-3 max-w-4xl mx-auto">
                  {subtitles.map((sub, idx) => {
                    const isActive = activeSubtitle && activeSubtitle.id === sub.id;
                    return (
                      <div
                        key={sub.id}
                        ref={el => blockRefs.current[idx] = el}
                        className={`border rounded-xl p-4 transition-all relative ${isActive ? 'bg-[var(--bg-surface-light)] border-violet-500/30 active-block-glow' : 'bg-[var(--bg-surface)] border-[var(--border-dim)] hover:border-[var(--border-highlight)] opacity-90'}`}
                      >
                        {isActive && <div className="absolute -left-[1px] top-4 bottom-4 w-1 bg-[var(--accent-primary)] rounded-r"></div>}

                        <div className="flex justify-between items-center mb-3">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${isActive ? 'text-violet-300 bg-violet-500/10 border-violet-500/20' : 'text-[var(--text-muted)] bg-[var(--bg-deep)] border-[var(--border-dim)]'}`}>
                            #{idx + 1}
                          </span>

                          <div className="flex items-center gap-2">
                            <div className={`flex items-center bg-[var(--bg-deep)] rounded border overflow-hidden ${isActive ? 'border-violet-500/30 shadow-inner' : 'border-[var(--border-dim)]'}`}>
                              <span className={`material-symbols-outlined text-[14px] px-1.5 border-r ${isActive ? 'text-[var(--accent-primary)] border-violet-900/30' : 'text-[var(--text-secondary)] border-[var(--border-dim)]'}`}>first_page</span>
                              <input
                                className={`bg-transparent border-none font-mono text-xs w-28 p-1 text-center focus:ring-0 ${isActive ? 'text-[var(--accent-primary)] font-bold' : 'text-[var(--text-secondary)]'}`}
                                value={formatTime(sub.start)}
                                readOnly
                                onClick={() => seekToTime(sub.start)}
                              />
                            </div>
                            <span className="text-[var(--text-muted)] text-xs">→</span>
                            <div className={`flex items-center bg-[var(--bg-deep)] rounded border overflow-hidden ${isActive ? 'border-cyan-500/30 shadow-inner' : 'border-[var(--border-dim)]'}`}>
                              <span className={`material-symbols-outlined text-[14px] px-1.5 border-r ${isActive ? 'text-[var(--accent-cyan)] border-cyan-900/30' : 'text-[var(--text-secondary)] border-[var(--border-dim)]'}`}>last_page</span>
                              <input
                                className={`bg-transparent border-none font-mono text-xs w-28 p-1 text-center focus:ring-0 ${isActive ? 'text-[var(--accent-cyan)] font-bold' : 'text-[var(--text-secondary)]'}`}
                                value={formatTime(sub.end)}
                                readOnly
                                onClick={() => seekToTime(sub.end - 100)}
                              />
                            </div>

                            <div className="w-px h-4 bg-[var(--border-dim)] mx-1"></div>

                            <button className="text-[var(--text-muted)] hover:text-red-400 transition-colors" onClick={() => handleDeleteBlock(idx)}>
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        </div>

                        <textarea
                          className={`w-full bg-transparent border-none p-0 focus:ring-0 resize-none h-auto leading-relaxed ${isActive ? 'text-white text-base font-medium' : 'text-[var(--text-primary)] text-sm'}`}
                          rows="2"
                          value={sub.text}
                          onChange={(e) => handleBlockChange(idx, 'text', e.target.value)}
                          onClick={() => seekToTime(sub.start)}
                        />

                        {isActive && (
                          <div className="mt-3 flex gap-2">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">Track 1</span>
                            <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">schedule</span> {((sub.end - sub.start) / 1000).toFixed(1)}s flex</span>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <button
                    className="w-full py-3 border border-dashed border-[var(--border-highlight)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] hover:bg-violet-900/5 transition-all flex items-center justify-center gap-2 mt-2 mb-8"
                    onClick={handleAddBlock}
                  >
                    <span className="material-symbols-outlined">add_circle</span>
                    <span>Insert New Block</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col h-full gap-4">
                  <textarea
                    ref={continuousEditorRef}
                    className="w-full h-full bg-transparent color-[var(--text-primary)] font-main text-base leading-[1.8] border-none resize-none outline-none p-2 focus:ring-0 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    value={continuousText}
                    onChange={handleContinuousChange}
                    onClick={handleContinuousClick}
                    onKeyUp={(e) => {
                      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                        handleContinuousClick(e);
                      }
                    }}
                    placeholder="Type or paste subtitles here. Use double line breaks to split blocks."
                  />
                  <button
                    className="btn-primary-tactile text-white py-2 rounded-lg text-sm font-medium w-full flex items-center justify-center gap-2 shrink-0 mb-4"
                    onClick={handleAutoFormat}
                    disabled={isFormatting}
                  >
                    <span className="material-symbols-outlined text-[18px]">auto_fix</span>
                    {isFormatting ? "Formatting..." : "Auto Format Blocks"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Center Stage Video */}
          <div className="flex-1 flex flex-col bg-[var(--bg-deep)] min-w-[500px]">
            <div className="p-4 flex items-center justify-between border-b border-[var(--border-dim)] bg-[var(--bg-surface)]">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[var(--text-muted)]">movie</span>
                <span className="text-sm font-medium text-[var(--text-secondary)]">Preview Stage</span>
              </div>

              <input type="file" accept="video/mp4,video/webm,video/ogg" className="hidden" ref={videoInputRef} onChange={handleVideoUpload} />
              <button className="btn-tactile px-3 py-1.5 rounded text-xs font-medium text-[var(--text-primary)] flex items-center gap-2" onClick={() => videoInputRef.current.click()}>
                <span className="material-symbols-outlined text-[16px]">video_file</span> Load Local Video
              </button>
            </div>

            <div className="flex-1 relative flex flex-col items-center justify-center group overflow-hidden bg-black border-b border-[var(--border-dim)] shadow-2xl">
              {!videoUrl && (
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-black to-slate-900 opacity-60"></div>
              )}

              {isVideoLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 text-white font-medium gap-3">
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  Loading Video...
                </div>
              )}

              {videoUrl && isLocalVideo ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onLoadedMetadata={handleNativeVideoLoaded}
                  onTimeUpdate={handleNativeVideoTimeUpdate}
                  onClick={togglePlayPause}
                  className="w-full h-full object-contain cursor-pointer"
                  style={{ pointerEvents: isPlaying ? 'none' : 'auto' }}
                />
              ) : (
                <span className="text-[var(--text-muted)] z-10 flex flex-col items-center gap-4">
                  <span className="material-symbols-outlined text-5xl opacity-40">movie_edit</span>
                  <p className="text-sm">Video Preview Area</p>
                </span>
              )}

              {videoUrl && isLocalVideo && (
                <div
                  onClick={togglePlayPause}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, cursor: 'pointer', zIndex: 1 }}
                />
              )}

              {subtitles.length > 0 && activeSubtitle && (
                <div className="absolute bottom-12 w-[80%] text-center z-10 pointer-events-none">
                  <span
                    className="inline-block px-4 py-2 bg-black/60 backdrop-blur-sm rounded-md text-white text-xl font-medium shadow-lg border border-white/10"
                    style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                  >
                    {activeSubtitle.text.split('\n').map((line, i) => (
                      <span key={i}>{line}<br /></span>
                    ))}
                  </span>
                </div>
              )}
            </div>

            {videoUrl && isLocalVideo && subtitles.length === 0 && (
              <div className="p-4 bg-[var(--bg-surface)]">
                <button
                  className="btn-primary-tactile w-full py-3 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2"
                  onClick={handleGenerateCaptions}
                  disabled={isGeneratingCaptions}
                >
                  <span className="material-symbols-outlined">{isGeneratingCaptions ? 'hourglass_top' : 'auto_fix_high'}</span>
                  {isGeneratingCaptions ? "AI is transcribing... please wait" : "Generate Captions Automatically"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Timeline */}
        <div className="h-[280px] flex flex-col bg-[var(--bg-surface)] border-t border-[var(--border-dim)] shrink-0 transition-all duration-300 relative z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.3)]">
          <button className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[var(--bg-surface)] border-t border-l border-r border-[var(--border-dim)] rounded-t-lg px-6 h-6 flex items-center justify-center text-[var(--text-secondary)] hover:text-white cursor-pointer z-40 transition-colors shadow-[0_-2px_10px_rgba(0,0,0,0.2)]">
            <span className="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
          </button>
          <div className="h-12 flex items-center justify-between px-6 border-b border-[var(--border-dim)] bg-[var(--bg-surface)] shrink-0">
            <div className="flex items-center gap-4">
              <button className="text-[var(--text-secondary)] hover:text-white transition-colors" title="Previous Block">
                <span className="material-symbols-outlined text-[20px]">skip_previous</span>
              </button>
              <button
                className="w-8 h-8 rounded-full bg-[var(--accent-primary)] hover:bg-violet-500 text-white flex items-center justify-center shadow-lg shadow-violet-500/30 transition-all hover:scale-105"
                onClick={togglePlayPause}
                disabled={subtitles.length === 0 && !videoUrl}
              >
                <span className="material-symbols-outlined filled text-[20px]">{isPlaying ? 'pause' : 'play_arrow'}</span>
              </button>
              <button className="text-[var(--text-secondary)] hover:text-white transition-colors" title="Next Block">
                <span className="material-symbols-outlined text-[20px]">skip_next</span>
              </button>
            </div>

            <div className="flex items-center gap-3 flex-1 justify-center">
              <span className="text-xs font-mono text-[var(--text-muted)]">{formatSimpleTime(currentTime)}</span>
              <div className="w-1/2 min-w-[300px] h-2 bg-[var(--bg-deep)] rounded-full border border-[var(--border-dim)] overflow-hidden relative mx-4">
                <div
                  className="absolute top-0 left-0 bottom-0 bg-[var(--accent-cyan)] transition-colors opacity-80"
                  style={{ width: `${maxTime > 0 ? (currentTime / maxTime) * 100 : 0}%` }}
                ></div>
              </div>
              <span className="text-xs font-mono text-[var(--text-muted)]">{formatSimpleTime(maxTime)}</span>
            </div>

            <div className="flex items-center gap-2">
              <button className="text-[var(--text-secondary)] hover:text-white transition-colors flex items-center" title="Zoom Out" onClick={() => setZoomLevel(z => Math.max(100, z - 50))}>
                <span className="material-symbols-outlined text-[18px]">zoom_out</span>
              </button>

              <div className="w-32 h-1.5 bg-white/10 rounded-full relative mx-2 cursor-pointer"
                onMouseDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const updateZoom = (clientX) => {
                    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                    setZoomLevel(100 + p * 900); // 100% to 1000% zoom
                  };
                  updateZoom(e.clientX);

                  const handleMouseMove = (mv) => {
                    mv.preventDefault();
                    updateZoom(mv.clientX);
                  };
                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                  };

                  document.addEventListener('mousemove', handleMouseMove);
                  document.addEventListener('mouseup', handleMouseUp);
                }}>
                <div className="absolute top-0 left-0 h-full bg-[var(--text-secondary)] rounded-full pointer-events-none" style={{ width: `${((zoomLevel - 100) / 900) * 100}%` }}></div>
                <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md pointer-events-none" style={{ left: `calc(${((zoomLevel - 100) / 900) * 100}% - 8px)` }}></div>
              </div>

              <button className="text-[var(--text-secondary)] hover:text-white transition-colors flex items-center" title="Zoom In" onClick={() => setZoomLevel(z => Math.min(1000, z + 50))}>
                <span className="material-symbols-outlined text-[18px]">zoom_in</span>
              </button>
              <div className="w-px h-6 bg-[var(--border-dim)] mx-2"></div>
              <button className="text-[var(--text-secondary)] hover:text-white transition-colors flex items-center" title="Settings">
                <span className="material-symbols-outlined text-[18px]">tune</span>
              </button>
            </div>
          </div>

          <div className="flex-1 bg-[var(--bg-deep)] flex min-h-0 w-full relative">
            <VisualTimeline
              subtitles={subtitles}
              currentTime={currentTime}
              maxTime={maxTime}
              onSeek={seekToTime}
              onSubtitleUpdate={handleBlockChange}
              activeSubtitleId={activeSubtitle?.id}
              zoomLevel={zoomLevel}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
