export type Category = 'inspiration' | 'developer' | 'funny' | 'stoic' | 'movies' | 'custom';

export type Quote = { id: string; text: string; author: string; category: Category };

export const CATEGORY_LABEL: Record<Category, string> = {
  inspiration: 'Inspiration',
  developer: 'Developer',
  funny: 'Funny',
  stoic: 'Stoic',
  movies: 'Movies',
  custom: 'Custom',
};

const RAW: [Category, string, string][] = [
  ['developer', 'First, solve the problem. Then, write the code.', 'John Johnson'],
  ['developer', 'Programs must be written for people to read, and only incidentally for machines to execute.', 'Harold Abelson'],
  ['developer', 'Simplicity is prerequisite for reliability.', 'Edsger W. Dijkstra'],
  ['developer', 'Make it work, make it right, make it fast.', 'Kent Beck'],
  ['developer', 'The cheapest, fastest and most reliable components are those that aren’t there.', 'Gordon Bell'],
  ['developer', 'Premature optimization is the root of all evil.', 'Donald Knuth'],
  ['developer', 'Deleted code is debugged code.', 'Jeff Sickel'],

  ['inspiration', 'The best way out is always through.', 'Robert Frost'],
  ['inspiration', 'What we do now echoes in eternity.', 'Marcus Aurelius'],
  ['inspiration', 'It always seems impossible until it’s done.', 'Nelson Mandela'],
  ['inspiration', 'Whether you think you can or you think you can’t, you’re right.', 'Henry Ford'],
  ['inspiration', 'The obstacle is the way.', 'Marcus Aurelius'],
  ['inspiration', 'Fall seven times, stand up eight.', 'Japanese proverb'],

  ['funny', 'I love deadlines. I love the whooshing noise they make as they go by.', 'Douglas Adams'],
  ['funny', 'There are only two hard things in computer science: cache invalidation and naming things.', 'Phil Karlton'],
  ['funny', 'Weeks of coding can save you hours of planning.', 'Unknown'],
  ['funny', 'It works on my machine.', 'Every developer, once'],
  ['funny', 'I’m not lazy, I’m on energy saving mode.', 'Unknown'],
  ['funny', 'A user interface is like a joke. If you have to explain it, it’s not that good.', 'Martin LeBlanc'],

  ['stoic', 'You have power over your mind, not outside events. Realize this, and you will find strength.', 'Marcus Aurelius'],
  ['stoic', 'We suffer more often in imagination than in reality.', 'Seneca'],
  ['stoic', 'No man is free who is not master of himself.', 'Epictetus'],
  ['stoic', 'It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
  ['stoic', 'First say to yourself what you would be; then do what you have to do.', 'Epictetus'],
  ['stoic', 'Waste no more time arguing what a good man should be. Be one.', 'Marcus Aurelius'],

  ['movies', 'Do, or do not. There is no try.', 'Yoda, The Empire Strikes Back'],
  ['movies', 'Roads? Where we’re going we don’t need roads.', 'Doc Brown, Back to the Future'],
  ['movies', 'It’s not who I am underneath, but what I do that defines me.', 'Batman Begins'],
  ['movies', 'Every man dies. Not every man really lives.', 'Braveheart'],
  ['movies', 'The greatest teacher, failure is.', 'Yoda, The Last Jedi'],
  ['movies', 'Why do we fall? So we can learn to pick ourselves up.', 'Batman Begins'],
];

export const BUILT_IN: Quote[] = RAW.map(([category, text, author], i) => ({
  id: `${category}-${i}`,
  text,
  author,
  category,
}));

export function parseCustom(raw: string | null): Quote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(q => q && typeof q.text === 'string' && q.text.trim())
      .slice(0, 100)
      .map((q, i) => ({
        id: `custom-${i}`,
        text: String(q.text).trim(),
        author: typeof q.author === 'string' && q.author.trim() ? String(q.author).trim() : 'Unknown',
        category: 'custom' as const,
      }));
  } catch {
    return [];
  }
}

export function pickDeck(all: Quote[], categories: Category[], favouritesOnly: boolean, favourites: Set<string>) {
  const byCategory = all.filter(q => categories.includes(q.category));
  const deck = favouritesOnly ? byCategory.filter(q => favourites.has(q.id)) : byCategory;
  // an empty selection would leave nothing to show at all, so fall back rather than blank the screen
  return deck.length > 0 ? deck : byCategory.length > 0 ? byCategory : all;
}
