// services/ragService.js
// Retrieval Augmented Generation for Scrapbot.
// Retrieves relevant knowledge base chunks and injects into system prompt.

import db from '../db.js';
import https from 'https';
import http from 'http';

// Embedding model endpoint - uses the same vLLM instance or a separate embeddings service
// For now we use a simple keyword/trigram search as fallback if embeddings aren't available
const EMBEDDING_ENDPOINT = process.env.EMBEDDING_ENDPOINT || null;

// Cache recent retrievals to avoid repeated DB hits for similar queries
const retrievalCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Simple keyword-based retrieval using PostgreSQL full-text search.
 * Falls back gracefully if pgvector isn't available.
 */
async function retrieveByKeyword(query, limit = 3) {
  try {
    const { rows } = await db.query(`
      SELECT title, content, domain, category, tags,
             ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) AS rank
      FROM public.knowledge_base
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
         OR content ILIKE $2
      ORDER BY rank DESC
      LIMIT $3
    `, [query, `%${query.split(' ').slice(0, 3).join('%')}%`, limit]);
    return rows;
  } catch (e) {
    console.warn('[ragService] keyword retrieval error:', e.message);
    return [];
  }
}

/**
 * Tag-based retrieval for domain-specific queries.
 */
async function retrieveByTags(tags, limit = 2) {
  if (!tags || !tags.length) return [];
  try {
    const { rows } = await db.query(`
      SELECT title, content, domain, category, tags
      FROM public.knowledge_base
      WHERE tags && $1::text[]
      ORDER BY array_length(tags & $1::text[], 1) DESC
      LIMIT $2
    `, [tags, limit]);
    return rows;
  } catch (e) {
    return [];
  }
}

/**
 * Detect query intent to determine which tags to search.
 */
function detectQueryTags(query) {
  const lower = query.toLowerCase();
  const tags = [];

  if (/obs|stream|broadcast|scene|source|encoder|bitrate|capture/.test(lower)) tags.push('obs', 'streaming', 'setup');
  if (/mic|microphone|audio|sound|echo|noise/.test(lower)) tags.push('microphone', 'audio', 'hardware');
  if (/camera|webcam|lighting|light/.test(lower)) tags.push('camera', 'lighting', 'hardware');
  if (/slot|spin|rtp|volatility|bonus|megaways|scatter|wild/.test(lower)) tags.push('slots', 'gambling', 'casino');
  if (/kick|twitch|platform|stream key|follow|sub/.test(lower)) tags.push('kick', 'platform', 'streaming');
  if (/grow|viewer|audience|schedule|consistency/.test(lower)) tags.push('growth', 'streaming');
  if (/scraplet|sbs|overlay|showrunner|scrapbot|dashboard/.test(lower)) tags.push('scraplet', 'SBS');
  if (/hardware|pc|cpu|gpu|capture card/.test(lower)) tags.push('hardware', 'setup');

  return tags;
}

/**
 * Main retrieval function.
 * Returns formatted context string for injection into system prompt.
 */
export async function retrieveContext(query, maxChunks = 3) {
  if (!query || query.length < 5) return null;

  // Check cache
  const cacheKey = query.toLowerCase().slice(0, 50);
  const cached = retrievalCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.context;

  try {
    const tags = detectQueryTags(query);

    // Run keyword and tag searches in parallel
    const [keywordResults, tagResults] = await Promise.all([
      retrieveByKeyword(query, maxChunks),
      retrieveByTags(tags, 2),
    ]);

    // Merge and deduplicate
    const seen = new Set();
    const results = [];
    for (const row of [...keywordResults, ...tagResults]) {
      const key = row.title;
      if (!seen.has(key) && results.length < maxChunks) {
        seen.add(key);
        results.push(row);
      }
    }

    if (!results.length) return null;

    // Format as context block
    const contextBlock = results.map(r =>
      `[${r.domain.toUpperCase()} KNOWLEDGE: ${r.title}]\n${r.content.slice(0, 600)}`
    ).join('\n\n---\n\n');

    const context = `[KNOWLEDGE BASE]\n${contextBlock}`;

    // Cache it
    retrievalCache.set(cacheKey, { context, ts: Date.now() });

    return context;
  } catch (e) {
    console.warn('[ragService] retrieval error:', e.message);
    return null;
  }
}

/**
 * Check if a query is likely to benefit from RAG retrieval.
 * Skip RAG for pure banter/chat that doesn't need factual grounding.
 */
export function shouldRetrieve(query) {
  const lower = query.toLowerCase();

  // Skip for very short messages
  if (query.split(' ').length < 3) return false;

  // Skip for pure reactions/banter
  if (/^(lol|lmao|haha|nice|gg|f|pog|wow|omg|wtf)/.test(lower)) return false;

  // Retrieve for questions and technical queries
  if (/how|what|why|when|where|which|can you|help|explain|tell me|show me/.test(lower)) return true;
  if (/setup|configure|fix|problem|issue|error|not working/.test(lower)) return true;
  if (/slot|obs|kick|stream|overlay|scraplet|hardware|mic|camera/.test(lower)) return true;

  return false;
}
