/**
 * The site's own JSON feeds that a project can demo live (a project's `demo` frontmatter). The one
 * place a feed is described: FeedDemo renders from it, and a project page's facts window names it.
 */
export type FeedKind = 'cafe-feed' | 'recipes-feed';

export const FEEDS: Record<FeedKind, { src: string; heading: string }> = {
  'cafe-feed': { src: '/izzys-cafe.json', heading: 'What the sign reads right now' },
  'recipes-feed': { src: '/recipes.json', heading: 'What the feed holds right now' },
};
