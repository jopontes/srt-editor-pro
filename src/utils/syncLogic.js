export function splitSubtitleProportionally(startMs, endMs, textBlocks) {
    if (!textBlocks || textBlocks.length === 0) return [];
    if (textBlocks.length === 1) {
        return [{ start: startMs, end: endMs, text: textBlocks[0] }];
    }

    const totalChars = textBlocks.reduce((acc, curr) => acc + curr.replace(/\s+/g, '').length, 0);
    const totalDuration = endMs - startMs;

    let currentStart = startMs;

    return textBlocks.map((text, index) => {
        if (index === textBlocks.length - 1) {
            return { start: Math.round(currentStart), end: endMs, text };
        }

        const charsInBlock = text.replace(/\s+/g, '').length;
        const ratio = totalChars === 0 ? 1 / textBlocks.length : charsInBlock / totalChars;
        const durationForBlock = totalDuration * ratio;
        const endForBlock = currentStart + durationForBlock;

        const block = {
            start: Math.round(currentStart),
            end: Math.round(endForBlock),
            text,
        };

        currentStart = endForBlock;
        return block;
    });
}

export function syncContinuousText(fullText, oldSubtitles) {
    const newTexts = fullText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split(/\n\n+/)
        .map(t => t.trim())
        .filter(Boolean);

    if (newTexts.length === 0) return [];

    if (oldSubtitles.length === 0) {
        let start = 0;
        return newTexts.map((text, idx) => {
            const end = start + 3000;
            const blk = { id: Date.now() + idx, start, end, text };
            start = end;
            return blk;
        });
    }

    const oldTexts = oldSubtitles.map(s => s.text);

    let startMatchCount = 0;
    while (startMatchCount < oldTexts.length && startMatchCount < newTexts.length && oldTexts[startMatchCount] === newTexts[startMatchCount]) {
        startMatchCount++;
    }

    let endMatchCountOld = 0;
    let endMatchCountNew = 0;
    while (
        endMatchCountOld < (oldTexts.length - startMatchCount) &&
        endMatchCountNew < (newTexts.length - startMatchCount) &&
        oldTexts[oldTexts.length - 1 - endMatchCountOld] === newTexts[newTexts.length - 1 - endMatchCountNew]
    ) {
        endMatchCountOld++;
        endMatchCountNew++;
    }

    if (startMatchCount === oldTexts.length && startMatchCount === newTexts.length) {
        return oldSubtitles;
    }

    const result = [];

    for (let i = 0; i < startMatchCount; i++) {
        result.push({ ...oldSubtitles[i], text: newTexts[i] });
    }

    const changedOldStartIdx = startMatchCount;
    const changedOldEndIdx = oldTexts.length - 1 - endMatchCountOld;
    const changedNewStartIdx = startMatchCount;
    const changedNewEndIdx = newTexts.length - 1 - endMatchCountNew;

    let timePoolStart = 0;
    let timePoolEnd = 0;

    if (changedOldStartIdx <= changedOldEndIdx) {
        timePoolStart = oldSubtitles[changedOldStartIdx].start;
        timePoolEnd = oldSubtitles[changedOldEndIdx].end;
    } else {
        if (changedOldStartIdx < oldSubtitles.length) {
            timePoolStart = oldSubtitles[changedOldStartIdx].start;
            timePoolEnd = timePoolStart;
        } else if (oldSubtitles.length > 0) {
            timePoolStart = oldSubtitles[oldSubtitles.length - 1].end;
            timePoolEnd = timePoolStart + 2000;
        }
    }

    const changedOldSubs = oldSubtitles.slice(changedOldStartIdx, changedOldEndIdx + 1);
    const changedNewTexts = newTexts.slice(changedNewStartIdx, changedNewEndIdx + 1);

    if (changedNewTexts.length > 0) {
        if (changedOldSubs.length > 0) {
            // Mapa de caracteres blindado focado em ancorar as frases reais
            const charMap = [];
            for (const sub of changedOldSubs) {
                const chars = sub.text.split('');
                const validChars = chars.filter(c => /[a-zA-Z0-9À-ÿ]/.test(c));
                const duration = sub.end - sub.start;

                let currentStart = sub.start;
                validChars.forEach((char) => {
                    const charDuration = duration / validChars.length;
                    charMap.push({
                        char: char.toLowerCase(),
                        start: currentStart,
                        end: currentStart + charDuration,
                        originalBlockEnd: sub.end
                    });
                    currentStart += charDuration;
                });
            }

            let charIndex = 0;
            changedNewTexts.forEach((txt, idx) => {
                const blockChars = txt.split('').filter(c => /[a-zA-Z0-9À-ÿ]/.test(c));
                let blockStart = null;
                let blockEnd = null;

                for (let i = 0; i < blockChars.length; i++) {
                    if (charIndex < charMap.length) {
                        const mappedChar = charMap[charIndex];
                        if (blockStart === null) blockStart = mappedChar.start;
                        blockEnd = mappedChar.end;
                        charIndex++;
                    } else {
                        if (blockStart === null) blockStart = blockEnd || timePoolStart;
                        blockEnd = (blockEnd || timePoolStart) + 100;
                    }
                }

                if (idx === changedNewTexts.length - 1 && charIndex >= charMap.length && charMap.length > 0) {
                    blockEnd = Math.max(blockEnd || 0, timePoolEnd);
                }

                if (blockStart === null) blockStart = timePoolStart;
                if (blockEnd === null) blockEnd = timePoolEnd;

                result.push({
                    id: Date.now() + Math.random(),
                    start: Math.round(blockStart),
                    end: Math.round(blockEnd),
                    text: txt
                });
            });
        } else {
            const totalChars = changedNewTexts.reduce((sum, txt) => sum + txt.replace(/\s+/g, '').length, 0);
            const totalDuration = timePoolEnd - timePoolStart;
            let currentStart = timePoolStart;

            changedNewTexts.forEach((txt, idx) => {
                const chars = txt.replace(/\s+/g, '').length;
                const ratio = totalChars === 0 ? (1 / changedNewTexts.length) : (chars / totalChars);
                let duration = totalDuration * ratio;
                if (duration === 0) duration = 1000;

                const currentEnd = (idx === changedNewTexts.length - 1 && totalDuration > 0) ? timePoolEnd : currentStart + duration;

                result.push({
                    id: Date.now() + Math.random(),
                    start: Math.round(currentStart),
                    end: Math.round(currentEnd),
                    text: txt
                });
                currentStart = currentEnd;
            });
        }
    }

    for (let i = oldTexts.length - endMatchCountOld; i < oldTexts.length; i++) {
        const newTextIdx = newTexts.length - endMatchCountNew + (i - (oldTexts.length - endMatchCountOld));
        result.push({ ...oldSubtitles[i], text: newTexts[newTextIdx] });
    }

    return result;
}

export async function autoFormatText(text, maxCharsPerLine = 42, maxLinesPerBlock = 2) {
    if (!text) return '';

    const fullString = text.replace(/\s+/g, ' ').trim();
    if (!fullString) return '';

    const systemInstruction = `Role and Objective
You are an expert subtitle editor. Your task is to format continuous text into highly readable subtitle blocks.

CRITICAL Formatting Rules:
1. Language: If the text language is English, format strictly to British English. Correct American spellings automatically.
2. Line Limits: Maximum 42 characters per line. Maximum 2 lines per block.
3. Break at Punctuation (MANDATORY): Always break lines AFTER commas, periods, or conjunctions. NEVER leave one or two words after a punctuation mark on the same line.
4. Bottom Heavy Shape (MANDATORY): The bottom line MUST ALWAYS be longer than or equal to the top line. Push words to the second line to make it longer.
5. Sentence Integrity: NEVER start a new sentence at the end of a line. If a sentence ends, force a line break or a new block.

Examples of BAD vs GOOD formatting:

BAD:
Sit with me on that for a second, because
I suspect it's true for all of us.

GOOD:
Sit with me on that for a second,
because I suspect it's true for all of us.

BAD:
I didn't default to my values. I
defaulted to what I had practiced.

GOOD:
I didn't default to my values.
I defaulted to what I had practiced.

Output ONLY the formatted plain text. Use a single line break to separate lines within the same block, and a double line break to separate completely different blocks. Do NOT output timestamps or any conversational text.`;

    try {
        const response = await fetch('/api/format', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: [{ parts: [{ text: fullString }] }],
                generationConfig: { temperature: 0.1 }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to fetch from Gemini API');
        }

        let formatted = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        return formatted;
    } catch (error) {
        console.error("Gemini API Error:", error);
        alert("Failed to format using AI.");
        return text;
    }
}