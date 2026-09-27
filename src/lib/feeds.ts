/**
 * The site's own JSON feeds that a project can demo live (a project's `demo` frontmatter). The one
 * place a feed is described: the projects schema takes its enum from FEED_KINDS, FeedDemo renders
 * from FEEDS, and a project page's facts window names the feed from it.
 */
export const FEED_KINDS = ['cafe-feed', 'recipes-feed'] as const;

export type FeedKind = (typeof FEED_KINDS)[number];

export const FEEDS: Record<FeedKind, { src: string; heading: string }> = {
  'cafe-feed': { src: '/izzys-cafe.json', heading: 'What the sign reads right now' },
  'recipes-feed': { src: '/recipes.json', heading: 'What the feed holds right now' },
};
