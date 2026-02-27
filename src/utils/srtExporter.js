export function msToTimeString(ms) {
    const totalMs = Math.max(0, Math.round(ms || 0));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const milliseconds = totalMs % 1000;

    const h = String(hours).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    const s = String(seconds).padStart(2, '0');
    const msStr = String(milliseconds).padStart(3, '0');

    return `${h}:${m}:${s},${msStr}`;
}

export function exportSrt(subtitles) {
    return subtitles
        .map((sub, index) => {
            const id = index + 1;
            const startStr = msToTimeString(sub.start);
            const endStr = msToTimeString(sub.end);
            return `${id}\n${startStr} --> ${endStr}\n${sub.text}`;
        })
        .join('\n\n');
}

export function exportVtt(subtitles) {
    const vttBody = subtitles
        .map((sub) => {
            const startStr = msToTimeString(sub.start).replace(',', '.');
            const endStr = msToTimeString(sub.end).replace(',', '.');
            return `${startStr} --> ${endStr}\n${sub.text}`;
        })
        .join('\n\n');

    return `WEBVTT\n\n${vttBody}`;
}