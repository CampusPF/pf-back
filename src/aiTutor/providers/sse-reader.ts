/**
 * Lee un body en formato Server-Sent Events (lo que devuelven Gemini y Groq
 * cuando se les pide streaming) y va entregando el contenido de cada línea
 * `data: ...`.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Un evento puede llegar partido en dos chunks de red: se procesa
            // sólo hasta el último salto de línea y el resto queda en buffer.
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                if (line.startsWith('data:')) yield line.slice(5).trim();
            }
        }
        if (buffer.startsWith('data:')) yield buffer.slice(5).trim();
    } finally {
        reader.releaseLock();
    }
}
