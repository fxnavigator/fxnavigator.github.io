import { getNews } from '../biquote.js';
import { parseIntParam } from '../util.js';
import { NEWS_DEFAULT_COUNTRY, NEWS_DEFAULT_LANGUAGE } from '../config.js';

export async function handler(req, env, url) {
  const symbol = url.searchParams.get('symbol')?.trim().toUpperCase() || undefined;
  const language = url.searchParams.get('language')?.trim() || NEWS_DEFAULT_LANGUAGE;
  const country = url.searchParams.get('country')?.trim().toUpperCase() || NEWS_DEFAULT_COUNTRY;
  const maxResults = parseIntParam(url, 'maxResults', 12, 1, 50);

  const articles = await getNews({ symbol, language, country, maxResults });

  return {
    symbol: symbol ?? null,
    language,
    count: Array.isArray(articles) ? articles.length : 0,
    articles
  };
}
