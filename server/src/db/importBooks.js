import { supabaseAdmin } from './supabaseClient.js';

const subjects = [
  'fiction',
  'fantasy',
  'science_fiction',
  'mystery',
  'romance',
  'history',
  'biography',
  'science',
  'business',
  'horror',
];

export async function importBooks() {
  const allBooks = [];

  for (const subject of subjects) {
    for (let page = 1; page <= 10; page++) {
      const url = `https://openlibrary.org/search.json?q=subject:${encodeURIComponent(subject)}&limit=100&page=${page}&sort=random`;

      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(
          `Failed request for ${subject} page ${page}: ${res.status}`
        );
      }

      const data = await res.json();
      console.log(subject, `page ${page}`, data.docs.length);

      const mappedBooks = data.docs.map((doc) => mapBook(doc, subject));
      allBooks.push(...mappedBooks);
    }
  }

  console.log(`Raw fetched books: ${allBooks.length}`);

  const cleanedBooks = cleanAndDeduplicate(allBooks);
  console.log(`After deduplication: ${cleanedBooks.length}`);

  const insertedBooks = await insertInBatches(cleanedBooks, 100);
  return insertedBooks;
}

function mapBook(doc, fallbackGenre) {
  return {
    title: doc.title ?? null,
    author: doc.author_name?.join(', ') ?? 'Unknown',
    genre: doc.subject?.[0] ?? fallbackGenre,
    published_year: doc.first_publish_year ?? null,
    cover_url: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : null,
  };
}

function getDedupKey(book) {
  return `title:${(book.title ?? '').trim().toLowerCase()}|author:${(book.author ?? '').trim().toLowerCase()}`;
}

function cleanAndDeduplicate(books) {
  const seen = new Set();
  const cleaned = [];

  for (const book of books) {
    if (!book.title || !book.author) continue;
    if (book.author === 'Unknown') continue;
    if (!book.cover_url) continue;

    const key = getDedupKey(book);
    if (seen.has(key)) continue;

    seen.add(key);
    cleaned.push(book);
  }

  return cleaned;
}

async function insertInBatches(books, batchSize = 100) {
  const inserted = [];

  for (let i = 0; i < books.length; i += batchSize) {
    const batch = books.slice(i, i + batchSize);

    const { data, error } = await supabaseAdmin
      .from('books')
      .insert(batch)
      .select();

    if (error) {
      throw new Error(
        `Supabase insert failed at batch ${i / batchSize + 1}: ${error.message}`
      );
    }

    inserted.push(...data);
    console.log(`Inserted batch ${i / batchSize + 1} (${batch.length} books)`);
  }

  return inserted;
}

importBooks()
  .then((books) => {
    console.log(`Imported ${books.length} books into Supabase`);
  })
  .catch((error) => {
    console.error('Import failed:', error);
  });
