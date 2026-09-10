declare module 'twitter-text/dist/parseTweet.js' {
  export default function parseTweet(text: string): { valid: boolean; weightedLength: number };
}
