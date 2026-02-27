export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY || process.env.VITE_ELEVENLABS_API_KEY;
    const url = 'https://api.elevenlabs.io/v1/speech-to-text?output_format=srt';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': req.headers.get('content-type')
            },
            body: req.body,
            duplex: 'half'
        });

        const data = await response.text();
        const outputFormat = new URL(url).searchParams.get('output_format');
        const contentType = outputFormat === 'srt' ? 'text/plain' : 'application/json';

        return new Response(data, {
            status: response.status,
            headers: { 'Content-Type': contentType }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
