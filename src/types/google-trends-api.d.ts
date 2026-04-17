declare module 'google-trends-api' {
  interface InterestOverTimeOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
    property?: string;
    resolution?: string;
  }

  interface RelatedQueriesOptions extends InterestOverTimeOptions {}

  export function interestOverTime(options: InterestOverTimeOptions): Promise<string>;
  export function relatedQueries(options: RelatedQueriesOptions): Promise<string>;
  export function relatedTopics(options: RelatedQueriesOptions): Promise<string>;
  export function interestByRegion(options: InterestOverTimeOptions): Promise<string>;
  export function dailyTrends(options: { geo?: string; trendDate?: Date; hl?: string }): Promise<string>;
  export function realTimeTrends(options: { geo?: string; category?: string; hl?: string }): Promise<string>;

  const googleTrends: {
    interestOverTime: typeof interestOverTime;
    relatedQueries: typeof relatedQueries;
    relatedTopics: typeof relatedTopics;
    interestByRegion: typeof interestByRegion;
    dailyTrends: typeof dailyTrends;
    realTimeTrends: typeof realTimeTrends;
  };

  export default googleTrends;
}
