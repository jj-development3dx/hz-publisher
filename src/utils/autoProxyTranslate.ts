import { translate } from '@vitalets/google-translate-api';
import { HttpProxyAgent } from 'http-proxy-agent';
import * as cheerio from 'cheerio';

interface ProxyInfo {
    ip: string;
    port: string;
    https: boolean;
    google: boolean;
    anonymity: string;
}

/**
 * Fetches and parses proxies from free-proxy-list.net (HTML Scraping)
 * @returns {Promise<ProxyInfo[]>} A list of potential proxies.
 */
async function fetchFPLProxies(): Promise<ProxyInfo[]> {
    console.log('Fetching proxy list from free-proxy-list.net...');
    try {
        const response = await fetch('https://free-proxy-list.net/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch FPL: ${response.statusText}`);
        }
        const html = await response.text();
        const $ = cheerio.load(html);
        const proxies: ProxyInfo[] = [];

        $('table.table-striped tbody tr').each((i, elem) => {
            const columns = $(elem).find('td');
            if (columns.length >= 7) {
                const ip = $(columns[0]).text().trim();
                const port = $(columns[1]).text().trim();
                const anonymity = $(columns[4]).text().trim().toLowerCase();
                const google = $(columns[5]).text().trim().toLowerCase() === 'yes';
                const https = $(columns[6]).text().trim().toLowerCase() === 'yes';

                if (ip && port) {
                    proxies.push({ ip, port, https, google, anonymity });
                }
            }
        });

        console.log(`Fetched ${proxies.length} potential proxies from FPL.`);
        return proxies;
    } catch (error) {
        console.error('Failed to fetch or parse FPL proxy list:', error);
        return [];
    }
}

/**
 * Fetches proxies from Geonode API (JSON)
 * Filters for HTTPS, Google compatibility, and high anonymity via API parameters.
 * @returns {Promise<ProxyInfo[]>} A list of potential proxies.
 */
async function fetchGeonodeProxies(): Promise<ProxyInfo[]> {
    console.log('Fetching proxy list from Geonode API...');
    const geonodeUrl = 'https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc&filterGoogle=true&filterHttps=true&anonymityLevel=elite&anonymityLevel=anonymous';
    try {
        const response = await fetch(geonodeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch Geonode: ${response.statusText}`);
        }
        const result = await response.json();
        const proxies: ProxyInfo[] = (result.data || []).map((p: any) => ({
            ip: p.ip,
            port: p.port,
            https: p.protocols?.includes('https') ?? false,
            google: p.google ?? false,
            anonymity: p.anonymityLevel || 'unknown'
        }));

        console.log(`Fetched ${proxies.length} potential proxies from Geonode.`);
        return proxies;
    } catch (error) {
        console.error('Failed to fetch or parse Geonode proxy list:', error);
        return [];
    }
}

/**
 * Filters proxies based on desired criteria (HTTPS, Google support, high anonymity).
 * @param {ProxyInfo[]} proxies - The list of proxies to filter.
 * @returns {ProxyInfo[]} The filtered list of proxies.
 */
function filterProxies(proxies: ProxyInfo[]): ProxyInfo[] {
    const filtered = proxies.filter(p =>
        p.https &&
        p.google &&
        (p.anonymity === 'anonymous' || p.anonymity === 'elite proxy')
    );
    console.log(`Filtered down to ${filtered.length} high-quality proxies.`);
    return filtered;
}

/**
 * Attempts translation using a specific list of proxies.
 * @param sourceText Text to translate.
 * @param targetLang Target language code.
 * @param proxies List of proxies to try.
 * @param timeoutMs Timeout per proxy.
 * @returns {Promise<string | null>} Translated text or null if all proxies in the list failed.
 */
async function tryTranslateWithProxies(sourceText: string, targetLang: string, proxies: ProxyInfo[], timeoutMs: number): Promise<string | null> {
    if (proxies.length === 0) {
        console.log("No proxies provided to attempt translation.");
        return null;
    }

    console.log(`Attempting translation with ${proxies.length} proxies.`);
    for (const proxy of proxies) {
        const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
        console.log(`\nAttempting via proxy: ${proxy.ip}:${proxy.port}`);

        const ac = new AbortController();
        const timer = setTimeout(() => {
            console.log(`Proxy ${proxy.ip}:${proxy.port} timed out after ${timeoutMs}ms.`);
            ac.abort();
        }, timeoutMs);

        const signal: AbortSignal = ac.signal as AbortSignal;
        const fetchOptions = {
            agent: new HttpProxyAgent(proxyUrl),
            signal: signal,
        };

        try {
            const { text } = await translate(sourceText, { fetchOptions, to: targetLang });
            clearTimeout(timer);
            console.log(`Success with proxy ${proxy.ip}:${proxy.port}! Result: ${text}`);
            return text;
        } catch (error: any) {
            clearTimeout(timer);
            if (error.name === 'AbortError') {
            } else if (error instanceof Error) {
                console.error(`Proxy ${proxy.ip}:${proxy.port} failed: ${error.message}`);
            } else {
                console.error(`Proxy ${proxy.ip}:${proxy.port} failed with unknown error:`, error);
            }
        }
    }
    console.log("All proxies in the current batch failed.");
    return null;
}

/**
 * Attempts to translate text using proxies from multiple sources, with a final direct fallback.
 * @param {string} sourceText - The text to translate.
 * @param {string} targetLang - The target language code (e.g., 'es').
 * @param {number} [timeoutMs=7000] - Timeout for each proxy attempt in milliseconds.
 * @returns {Promise<string>} The translated text.
 * @throws {Error} If translation fails after trying all sources and a direct attempt.
 */
export async function translateWithAutoProxy(sourceText: string, targetLang: string, timeoutMs: number = 7000): Promise<string> {
    console.log(`--- Starting translation for: "${sourceText}" to ${targetLang} ---`);

    console.log("\n--- Stage 1: Trying free-proxy-list.net Proxies ---");
    const fplProxiesRaw = await fetchFPLProxies();
    const fplProxiesFiltered = filterProxies(fplProxiesRaw);
    let translatedText = await tryTranslateWithProxies(sourceText, targetLang, fplProxiesFiltered, timeoutMs);

    if (translatedText !== null) {
        return translatedText;
    }

    console.log("\n--- Stage 2: Trying Geonode Proxies ---");
    const geonodeProxies = await fetchGeonodeProxies(); 
    translatedText = await tryTranslateWithProxies(sourceText, targetLang, geonodeProxies, timeoutMs);

    if (translatedText !== null) {
        return translatedText;
    }

    console.warn('\n--- Stage 3: All proxy sources failed. Attempting direct translation ---');
    try {
        const { text } = await translate(sourceText, { to: targetLang });
        console.log(`Direct translation successful! Result: ${text}`);
        return text;
    } catch (directError: any) {
        console.error(`Direct translation also failed: ${directError.message}`);
        throw new Error('Translation failed after trying all proxy sources and a direct attempt.');
    }
} 