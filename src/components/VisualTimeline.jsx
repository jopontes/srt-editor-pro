import React, { useRef, useState, useEffect } from 'react';

export default function VisualTimeline({ subtitles, currentTime, maxTime, onSeek, onSubtitleUpdate, activeSubtitleId, zoomLevel = 100 }) {
    const timelineRef = useRef(null);
    const [draggingBlock, setDraggingBlock] = useState(null);

    // Dynamic markers setup logic
    const markers = [];
    const durationSecs = Math.ceil(maxTime / 1000);
    const interval = durationSecs > 300 ? 60 : durationSecs > 60 ? 15 : 5;

    for (let s = 0; s <= durationSecs; s += interval) {
        const date = new Date(s * 1000);
        const mm = String(date.getUTCMinutes()).padStart(2, '0');
        const ss = String(date.getUTCSeconds()).padStart(2, '0');
        markers.push({ seconds: s, label: `${mm}:${ss}` });
    }

    const handleTimelineClick = (e) => {
        if (draggingBlock) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
        const scrollWidth = timelineRef.current.scrollWidth;

        let ratio = clickX / scrollWidth;
        ratio = Math.max(0, Math.min(1, ratio));
        onSeek(ratio * maxTime);
    };

    useEffect(() => {
        if (!draggingBlock) return;

        const handleMouseMove = (e) => {
            if (!timelineRef.current || !maxTime || maxTime === 0) return;
            const rect = timelineRef.current.getBoundingClientRect();
            const scrollWidth = timelineRef.current.scrollWidth;

            const mouseX = e.clientX - rect.left + timelineRef.current.scrollLeft;
            const timeAtMouse = Math.max(0, Math.min(maxTime, (mouseX / scrollWidth) * maxTime));

            const subIndex = subtitles.findIndex(s => s.id === draggingBlock.id);
            if (subIndex === -1) return;
            const sub = subtitles[subIndex];

            if (draggingBlock.isLeftEdge) {
                const newStart = Math.min(timeAtMouse, sub.end - 100);
                const prevEnd = subIndex > 0 ? subtitles[subIndex - 1].end : 0;
                const finalStart = Math.max(prevEnd, newStart);
                onSubtitleUpdate(subIndex, { ...sub, start: Math.round(finalStart) });
            } else if (draggingBlock.isRightEdge) {
                const newEnd = Math.max(timeAtMouse, sub.start + 100);

                if (e.shiftKey) {
                    const originalSub = draggingBlock.initialSubtitles[subIndex];
                    const timeDelta = newEnd - originalSub.end;

                    const updatedSubs = [...draggingBlock.initialSubtitles];
                    for (let i = subIndex; i < updatedSubs.length; i++) {
                        const s = updatedSubs[i];
                        if (i === subIndex) {
                            updatedSubs[i] = { ...s, end: Math.round(newEnd) };
                        } else {
                            updatedSubs[i] = {
                                ...s,
                                start: Math.round(s.start + timeDelta),
                                end: Math.round(s.end + timeDelta)
                            };
                        }
                    }
                    onSubtitleUpdate('all', updatedSubs, null);
                } else {
                    const nextStart = subIndex < subtitles.length - 1 ? subtitles[subIndex + 1].start : maxTime;
                    const finalEnd = Math.min(nextStart, newEnd);
                    onSubtitleUpdate(subIndex, { ...sub, end: Math.round(finalEnd) });
                }
            } else {
                const duration = sub.end - sub.start;
                let newStart = timeAtMouse - draggingBlock.startOffset;
                let newEnd = newStart + duration;

                if (e.shiftKey) {
                    const timeDelta = newStart - draggingBlock.initialStart;
                    const updatedSubs = [...draggingBlock.initialSubtitles];

                    for (let i = subIndex; i < updatedSubs.length; i++) {
                        const s = updatedSubs[i];
                        const sDuration = s.end - s.start;
                        let sNewStart = s.start + timeDelta;

                        if (i === subIndex && sNewStart < 0) sNewStart = 0;

                        updatedSubs[i] = {
                            ...s,
                            start: Math.round(sNewStart),
                            end: Math.round(sNewStart + sDuration)
                        };
                    }
                    onSubtitleUpdate('all', updatedSubs, null);

                } else {
                    const prevEnd = subIndex > 0 ? subtitles[subIndex - 1].end : 0;
                    const nextStart = subIndex < subtitles.length - 1 ? subtitles[subIndex + 1].start : maxTime;

                    if (newStart < prevEnd) {
                        newStart = prevEnd;
                        newEnd = newStart + duration;
                    }
                    if (newEnd > nextStart) {
                        newEnd = nextStart;
                        newStart = newEnd - duration;
                    }

                    onSubtitleUpdate(subIndex, { ...sub, start: Math.round(newStart), end: Math.round(newEnd) });
                }
            }
        };

        const handleMouseUp = () => setDraggingBlock(null);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingBlock, subtitles, maxTime, onSubtitleUpdate]);

    useEffect(() => {
        if (timelineRef.current && maxTime > 0) {
            const percentage = currentTime / maxTime;
            const scrollWidth = timelineRef.current.scrollWidth;
            const clientWidth = timelineRef.current.clientWidth;

            const scrubberPos = scrollWidth * percentage;
            const scrollLeft = timelineRef.current.scrollLeft;

            if (scrubberPos < scrollLeft || scrubberPos > scrollLeft + clientWidth - 50) {
                timelineRef.current.scrollTo({
                    left: Math.max(0, scrubberPos - clientWidth / 2),
                    behavior: 'smooth'
                });
            }
        }
    }, [currentTime, maxTime]);

    const scrubberPercentage = maxTime > 0 ? (currentTime / maxTime) * 100 : 0;

    return (
        <div className="h-full min-w-[1000px] relative w-full overflow-x-auto overflow-y-hidden custom-scrollbar" ref={timelineRef} onClick={handleTimelineClick}>

            {/* Header Markers */}
            <div className="h-8 border-b border-[var(--border-dim)] flex items-end pb-1 sticky top-0 bg-[var(--bg-deep)] z-10 w-[max-content]" style={{ minWidth: `${Math.max(100, zoomLevel)}%` }}>
                <div className="relative w-full h-full text-[10px] font-mono text-[var(--text-muted)] select-none pointer-events-none">
                    {markers.map(m => (
                        <span key={m.seconds} className="absolute bottom-0" style={{ left: `${(m.seconds * 1000 / maxTime) * 100}%`, transform: 'translateX(-50%)' }}>
                            {m.label}
                        </span>
                    ))}
                </div>
            </div>

            <div className="p-4 flex flex-col gap-4 relative h-full w-[max-content]" style={{ minWidth: `${Math.max(100, zoomLevel)}%` }}>
                {/* Playhead Scrubber Line */}
                <div className="absolute top-0 bottom-0 w-px bg-[var(--accent-pink)] z-30 pointer-events-none" style={{ left: `${scrubberPercentage}%` }}>
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-[var(--accent-pink)] -ml-[6px]"></div>
                </div>

                {/* Subtitle Track Area */}
                <div className="relative h-20 bg-[var(--bg-surface-active)]/30 rounded-lg border border-[var(--border-dim)] w-full group mt-2">
                    <div className="absolute top-2 left-2 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider flex items-center gap-2">
                        Track 1 [Main]
                        <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 cursor-pointer hover:text-white transition-opacity">visibility</span>
                    </div>

                    {subtitles.map((sub) => {
                        if (maxTime === 0) return null;
                        const leftPerc = (sub.start / maxTime) * 100;
                        const widthPerc = ((sub.end - sub.start) / maxTime) * 100;
                        const isActive = activeSubtitleId === sub.id;

                        return (
                            <div
                                key={sub.id}
                                className={`absolute top-7 bottom-2 border rounded cursor-pointer ${isActive ? 'bg-violet-900/40 border-[var(--accent-primary)] shadow-[0_0_10px_rgba(124,58,237,0.2)] z-10' : 'bg-[var(--bg-surface-light)] border-[var(--border-highlight)] hover:bg-[var(--bg-surface-active)]'}`}
                                style={{ left: `${leftPerc}%`, width: `${widthPerc}%`, minWidth: '10px' }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    const rect = timelineRef.current.getBoundingClientRect();
                                    const mouseX = e.clientX - rect.left + timelineRef.current.scrollLeft;
                                    setDraggingBlock({
                                        id: sub.id,
                                        isLeftEdge: false,
                                        isRightEdge: false,
                                        startOffset: (mouseX / timelineRef.current.scrollWidth) * maxTime - sub.start,
                                        initialStart: sub.start,
                                        initialSubtitles: subtitles
                                    });
                                }}
                            >
                                <div className="h-full w-full p-1.5 overflow-hidden flex flex-col justify-center select-none">
                                    {isActive && widthPerc > 5 && (
                                        <div className="flex justify-between items-center text-[9px] font-mono text-violet-200 mb-0.5 px-0.5">
                                            <span>{(sub.start / 1000).toFixed(1)}</span>
                                            <span>{(sub.end / 1000).toFixed(1)}</span>
                                        </div>
                                    )}
                                    <div className={`text-[10px] truncate ${isActive ? 'text-white font-medium px-0.5' : 'text-[var(--text-muted)]'}`}>
                                        {sub.text.replace(/\n/g, ' ')}
                                    </div>
                                </div>
                                <div
                                    className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-[var(--accent-primary)] opacity-50 z-20"
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        setDraggingBlock({
                                            id: sub.id,
                                            isLeftEdge: true,
                                            isRightEdge: false,
                                            initialSubtitles: subtitles
                                        });
                                    }}
                                />
                                <div
                                    className={`absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize opacity-50 z-20 ${isActive ? 'bg-[var(--accent-cyan)]/20 hover:bg-[var(--accent-cyan)]' : 'hover:bg-gray-400'}`}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        setDraggingBlock({
                                            id: sub.id,
                                            isLeftEdge: false,
                                            isRightEdge: true,
                                            initialSubtitles: subtitles
                                        });
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Audio Waveform decorative layer */}
                <div className="relative h-12 bg-transparent rounded-lg border-t border-[var(--border-dim)] mt-2 opacity-30 pointer-events-none overflow-hidden flex">
                    {Array.from({ length: 150 }).map((_, i) => {
                        // Use a simple deterministic pseudo-random formula based on index to avoid React purity warnings
                        const height = 10 + ((Math.sin(i * 0.5) * Math.cos(i * 0.8) + 1) * 35);
                        return (
                            <div key={i} className="flex items-center mx-[1px]" style={{ height: '100%' }}>
                                <div className="w-[3px] bg-slate-500 rounded-full" style={{ height: `${height}%` }}></div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
