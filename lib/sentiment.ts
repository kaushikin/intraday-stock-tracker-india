export type SentimentResult = {
  label: 'positive' | 'negative' | 'neutral';
  score: number;
};
export function parseSentiment(input: unknown): SentimentResult {
  const values =
    Array.isArray(input) && Array.isArray(input[0]) ? input[0] : input;
  if (!Array.isArray(values) || !values.length)
    throw new Error('Invalid sentiment response.');
  const scores = values.map((v: any) => {
    if (
      !v ||
      !['positive', 'negative', 'neutral'].includes(v.label) ||
      !Number.isFinite(v.score) ||
      v.score < 0 ||
      v.score > 1
    )
      throw new Error('Invalid sentiment label or score.');
    return { label: v.label, score: v.score } as SentimentResult;
  });
  return scores.sort((a, b) => b.score - a.score)[0];
}
export type Headline = {
  title: string;
  link: string;
  source?: string;
  publishedAt: string;
};
export function recentHeadlines(
  items: Headline[],
  now = new Date()
): Headline[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const time = Date.parse(item.publishedAt),
        title = item.title.trim().toLowerCase();
      if (
        !title ||
        !/^https?:\/\//.test(item.link) ||
        !Number.isFinite(time) ||
        time > now.getTime() ||
        now.getTime() - time > 24 * 3600_000 ||
        seen.has(title)
      )
        return false;
      seen.add(title);
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 5);
}
