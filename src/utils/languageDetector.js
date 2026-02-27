export function detectLanguage(subtitles) {
    if (!subtitles || subtitles.length === 0) return "EN-US";

    const fullText = subtitles.map(s => s.text).join(" ").toLowerCase();

    const ptWords = [" que ", " não ", " de ", " do ", " da ", " para ", " com ", " um ", " uma ", " o ", " a ", " é ", " você ", " então "];
    const enWords = [" the ", " you ", " to ", " and ", " of ", " in ", " is ", " it ", " that ", " have ", " what ", " this "];
    const esWords = [" que ", " de ", " no ", " el ", " la ", " y ", " en ", " lo ", " un ", " por ", " qué ", " para "];
    const frWords = [" de ", " je ", " pas ", " le ", " la ", " tu ", " vous ", " il ", " et ", " à ", " un ", " est "];

    const countMatches = (words) => words.reduce((acc, word) => acc + (fullText.split(word).length - 1), 0);

    const scores = {
        "PT-BR": countMatches(ptWords),
        "EN-US": countMatches(enWords),
        "ES": countMatches(esWords),
        "FR": countMatches(frWords),
    };

    let maxScore = -1;
    let detected = "EN-US";

    for (const [lang, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            detected = lang;
        }
    }

    return maxScore > 0 ? detected : "EN-US";
}
