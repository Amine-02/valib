import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { supabaseAdmin } from './supabaseClient.js';
import {
  applyPagination,
  normalizeAscendingRange,
  toIntInRange,
} from '../utils/query.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;
const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_DIRECTION = 'desc';
const MIN_PUBLISHED_YEAR = 1500;
const MAX_PUBLISHED_YEAR = 2026;
const SORTABLE_BOOK_FIELDS = new Set([
  'id',
  'title',
  'author',
  'genre',
  'status',
  'created_at',
  'published_year',
]);

const GEMINI_MODEL = 'gemini-3-flash-preview';
const SUMMARY_SYSTEM_INSTRUCTION =
  'You are a book assistant. Return exactly two short plain-text phrases summarizing the book. No bullets, no markdown.';
const REVIEW_SYSTEM_INSTRUCTION =
  'You are a concise literary reviewer. Return only valid JSON with score and quotes. No markdown. Every quote string must be wrapped with double quote characters.';
const DEFAULT_REVIEW = {
  score: 4,
  quotes: [
    '"Engaging and easy to follow."',
    '"A solid read with memorable moments."',
  ],
};
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function applyBookSorting(query, filters = {}) {
  const rawSort = String(filters.sort || DEFAULT_SORT_FIELD)
    .trim()
    .toLowerCase();
  const sort = SORTABLE_BOOK_FIELDS.has(rawSort) ? rawSort : DEFAULT_SORT_FIELD;

  const rawDirection = String(
    filters.direction || filters.order || DEFAULT_SORT_DIRECTION
  )
    .trim()
    .toLowerCase();
  const ascending = rawDirection === 'asc';

  return query.order(sort, { ascending });
}

function applyBookFilters(query, filters = {}) {
  let next = query;

  if (filters.status) {
    next = next.eq('status', filters.status);
  }

  if (filters.genre) {
    next = next.ilike('genre', `%${filters.genre}%`);
  }

  const publishedYear = toIntInRange(filters.published_year, {
    min: MIN_PUBLISHED_YEAR,
    max: MAX_PUBLISHED_YEAR,
  });
  if (publishedYear !== null) {
    next = next.eq('published_year', publishedYear);
  }

  let publishedYearFrom = toIntInRange(filters.published_year_from, {
    min: MIN_PUBLISHED_YEAR,
    max: MAX_PUBLISHED_YEAR,
  });
  let publishedYearTo = toIntInRange(filters.published_year_to, {
    min: MIN_PUBLISHED_YEAR,
    max: MAX_PUBLISHED_YEAR,
  });
  [publishedYearFrom, publishedYearTo] = normalizeAscendingRange(
    publishedYearFrom,
    publishedYearTo
  );

  if (publishedYearFrom !== null) {
    next = next.gte('published_year', publishedYearFrom);
  }

  if (publishedYearTo !== null) {
    next = next.lte('published_year', publishedYearTo);
  }

  if (filters.search) {
    const safe = filters.search.trim();
    next = next.or(
      `title.ilike.%${safe}%,author.ilike.%${safe}%,genre.ilike.%${safe}%,summary.ilike.%${safe}%`
    );
  }

  return next;
}

export async function getAllBooks(filters = {}) {
  const query = applyPagination(
    applyBookSorting(
      applyBookFilters(supabaseAdmin.from('books').select('*'), filters),
      filters
    ),
    filters,
    { defaultPageSize: DEFAULT_PAGE_SIZE, maxPageSize: MAX_PAGE_SIZE }
  );

  const { data, error } = await query;
  if (error) throw error;

  return data;
}

export async function getBooksCount(filters = {}) {
  const query = applyBookFilters(
    supabaseAdmin.from('books').select('*', { count: 'exact', head: true }),
    filters
  );

  const { count, error } = await query;
  if (error) throw error;

  return count ?? 0;
}

export async function getBookById(bookId) {
  const { data, error } = await supabaseAdmin
    .from('books')
    .select('*')
    .eq('id', bookId)
    .single();

  if (error) throw error;
  return data;
}

export async function createBook(book) {
  const { data, error } = await supabaseAdmin
    .from('books')
    .insert([
      {
        title: book.title,
        author: book.author,
        genre: book.genre ?? null,
        published_year: book.published_year ?? null,
        summary: book.summary ?? null,
        status: book.status ?? 'available',
        borrower_name: book.borrower_name ?? null,
        borrower_phone: book.borrower_phone ?? null,
        borrowed_at: book.borrowed_at ?? null,
        cover_url: book.cover_url ?? null,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBook(bookId, updates) {
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('books')
    .update(payload)
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBookSummary(bookId, summary) {
  const { data, error } = await supabaseAdmin
    .from('books')
    .update({
      summary: String(summary || '').trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBookReview(bookId, review) {
  const { data, error } = await supabaseAdmin
    .from('books')
    .update({
      review: review ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBook(bookId) {
  const { data, error } = await supabaseAdmin
    .from('books')
    .delete()
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function checkOutBook(bookId, borrowerName, borrowerPhone) {
  const borrowedAt = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('books')
    .update({
      status: 'borrowed',
      borrower_name: borrowerName,
      borrower_phone: borrowerPhone,
      borrowed_at: borrowedAt,
      updated_at: borrowedAt,
    })
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function checkInBook(bookId) {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('books')
    .update({
      status: 'available',
      borrower_name: null,
      borrower_phone: null,
      borrowed_at: null,
      updated_at: now,
    })
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

function buildBookContext({ title, author, genre, publishedYear }) {
  return [
    `Title: ${String(title || '').trim() || 'Unknown'}`,
    `Author: ${String(author || '').trim() || 'Unknown'}`,
    `Genre: ${String(genre || '').trim() || 'Unknown'}`,
    `Published year: ${String(publishedYear || '').trim() || 'Unknown'}`,
  ].join('\n');
}

function normalizeTwoPhraseSummary(summary, { author } = {}) {
  const text = String(summary || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    const safeAuthor = String(author || '').trim() || 'the author';
    return `A concise story with clear themes. A notable read from ${safeAuthor}.`;
  }

  const parts = text
    .split(/[.!?;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]}. ${parts[1]}.`;
  }

  const safeAuthor = String(author || '').trim() || 'the author';
  return `${parts[0]}. It offers a brief but useful snapshot of the book by ${safeAuthor}.`;
}

function normalizeReviewScore(score) {
  const parsed = Number(score);
  if (!Number.isFinite(parsed)) return DEFAULT_REVIEW.score;

  const clamped = Math.min(5, Math.max(0, parsed));
  return Math.round(clamped * 10) / 10;
}

function normalizeReviewQuotes(quotes) {
  const normalizeQuoteText = (value) => {
    const text = String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^['"]+|['"]+$/g, '');

    if (!text) return '';
    return `"${text}"`;
  };

  if (!Array.isArray(quotes)) {
    return [...DEFAULT_REVIEW.quotes];
  }

  const cleaned = quotes
    .map((quote) => normalizeQuoteText(quote))
    .filter(Boolean)
    .slice(0, 2);

  if (cleaned.length === 2) return cleaned;
  if (cleaned.length === 1) return [cleaned[0], DEFAULT_REVIEW.quotes[1]];
  return [...DEFAULT_REVIEW.quotes];
}

function parseJsonSafe(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
    if (jsonBlockMatch?.[1]) {
      try {
        return JSON.parse(jsonBlockMatch[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function generateWithRetry(buildRequest, maxRetries = 3) {
  const retries = Math.max(1, Number(maxRetries) || 1);
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await ai.models.generateContent(buildRequest());
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    }
  }

  throw lastError;
}

export async function callAIForSummary(
  { title, author, genre, publishedYear },
  maxRetries = 3
) {
  if (!process.env.GEMINI_API_KEY) {
    return normalizeTwoPhraseSummary('', { author });
  }

  const context = buildBookContext({ title, author, genre, publishedYear });
  const prompt = [
    'Write exactly two concise sentences that summarize this book with a bit more detail.',
    'Include the main premise and one key theme, tone, or central conflict.',
    'Return plain text only.',
    context,
  ].join('\n\n');

  try {
    const response = await generateWithRetry(
      () => ({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SUMMARY_SYSTEM_INSTRUCTION,
          temperature: 0.7,
          maxOutputTokens: 200,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
        },
      }),
      maxRetries
    );

    return normalizeTwoPhraseSummary(response?.text, { author });
  } catch (error) {
    console.error('Failed to generate AI summary', error);
    return normalizeTwoPhraseSummary('', { author });
  }
}

export async function callAIForReview(
  { title, author, genre, publishedYear },
  maxRetries = 3
) {
  if (!process.env.GEMINI_API_KEY) {
    return { ...DEFAULT_REVIEW };
  }

  const context = buildBookContext({ title, author, genre, publishedYear });
  const prompt = [
    'Provide a concise review object based on common reader sentiment and public opinions.',
    'Return JSON only in this shape: {"score": number, "quotes": [string, string]}.',
    'Score must be from 0 to 5.',
    'Each quote must be short.',
    context,
  ].join('\n\n');

  try {
    const response = await generateWithRetry(
      () => ({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: REVIEW_SYSTEM_INSTRUCTION,
          temperature: 0.7,
          maxOutputTokens: 250,
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: 'object',
            properties: {
              score: { type: 'number', minimum: 0, maximum: 5 },
              quotes: {
                type: 'array',
                items: { type: 'string' },
                minItems: 2,
                maxItems: 2,
              },
            },
            required: ['score', 'quotes'],
          },
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
        },
      }),
      maxRetries
    );

    const parsed = parseJsonSafe(response?.text) || {};

    return {
      score: normalizeReviewScore(parsed.score),
      quotes: normalizeReviewQuotes(parsed.quotes),
    };
  } catch (error) {
    console.error('Failed to generate AI review', error);
    return { ...DEFAULT_REVIEW };
  }
}
