import StreamZip from 'node-stream-zip';
import fs from 'fs';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Get ZIP file path from command line argument
const zipFilePath = process.argv[2];
if (!zipFilePath) {
  console.error('Usage: node dist/server.js <path-to-zip-file>');
  process.exit(1);
}
if (!fs.existsSync(zipFilePath)) {
  console.error(`File not found: ${zipFilePath}`);
  process.exit(1);
}

// Helper to read and parse tweets from the ZIP archive
async function getTweetsFromZip(): Promise<any[]> {
  const zip = new StreamZip.async({ file: zipFilePath });
  try {
    const entry = await zip.entry('data/tweets.js');
    if (!entry) throw new Error('data/tweets.js not found in ZIP');
    const content = await zip.entryData('data/tweets.js');
    let text = content.toString('utf-8');
    // Remove assignment if present (e.g., window.YTD.tweets.part0 = ...)
    text = text.replace(/^[^{\[]+/, '');
    // Remove trailing semicolon if present
    text = text.replace(/;\s*$/, '');
    let tweetsRaw;
    try {
      tweetsRaw = JSON.parse(text);
    } catch (e) {
      // Try to eval if it's a JS assignment
      tweetsRaw = eval(text);
    }
    // tweetsRaw is usually an array of objects with a 'tweet' property
    const tweets = Array.isArray(tweetsRaw)
      ? tweetsRaw.map((t: any) => t.tweet || t)
      : [];
    // Sort by date (most recent first)
    tweets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return tweets;
  } finally {
    await zip.close();
  }
}

// Helper to expand URLs in tweet text
function expandLinks(text: string, urls: any[]): string {
  if (!urls || !Array.isArray(urls)) return text;
  let result = text;
  for (const url of urls) {
    if (url.url && url.expanded_url) {
      result = result.replace(url.url, url.expanded_url);
    }
  }
  return result;
}

// Simplify tweet object
function simplifyTweet(tweet: any) {
  return {
    id: tweet.id_str || tweet.id,
    display_name: tweet.user?.name || tweet.user?.display_name || '',
    username: tweet.user?.screen_name || tweet.user?.username || '',
    text: expandLinks(tweet.full_text || tweet.text || '', tweet.entities?.urls || []),
    created_at: tweet.created_at,
  };
}

// Helper to replace @mentions, hashtags, and URLs with LLM-friendly tokens
function cleanTweetText(text: string): string {
  // Remove all leading @mentions (possibly multiple, separated by spaces)
  let cleaned = text.replace(/^(?:@[\w_]+\s+)+/, '');
  return cleaned
    .replace(/https?:\/\/\S+/g, '[LINK]')      // Replace URLs
    .replace(/@[\w_]+/g, '[USERNAME]')           // Replace @mentions
    .replace(/#[\w_]+/g, '[HASHTAG]')            // Replace hashtags
    .replace(/\s{2,}/g, ' ')                     // Collapse multiple spaces
    .trim();
}

// MCP Server setup
const server = new McpServer({
  name: 'Twitter Archive MCP',
  version: '1.0.0',
});

// Resource: tweet-list://recent
server.resource(
  'tweet-list',
  'tweet-list://recent',
  async () => {
    const tweets = await getTweetsFromZip();
    // Return a list of simplified tweet objects, each with its ID as identifier
    return {
      contents: tweets.map(tweet => 
        ({
          uri: `tweet://${tweet.id_str || tweet.id}`,
          ...simplifyTweet(tweet)
        })
      ),
    };
  }
);

// Resource: tweet://{id}
server.resource(
  'tweet',
  new ResourceTemplate('tweet://{id}', { list: undefined }),
  async (uri, { id }) => {
    const tweets = await getTweetsFromZip();
    const tweet = tweets.find((t) => (t.id_str || t.id) === id);
    if (!tweet) {
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({ error: 'Tweet not found', id }),
          },
        ],
      };
    }
    // Use the tweet ID as the identifier
    let simplifiedTweet = simplifyTweet(tweet);
    return {
      contents: [
        {
          uri: `tweet://${tweet.id_str || tweet.id}`,
          ...simplifiedTweet
        },
      ],
    };
  }
);

server.resource(
  'tweet-text',
  new ResourceTemplate('tweet-text://{id}', { list: undefined }),
  async (uri, { id }) => {
    const tweets = await getTweetsFromZip();
    const tweet = tweets.find((t) => (t.id_str || t.id) === id);
    if (!tweet) {
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({ error: 'Tweet not found', id }),
          },
        ],
      };
    }
    // Return just the text of the tweet
    return {
      contents: [
        {
          uri: `tweet-text://${tweet.id_str || tweet.id}`,
          text: tweet.full_text || tweet.text,
        },
      ],
    };
  }
);

// Tool: sample_tweets (returns a random sample of tweet resource URIs)
// Tool: sample_tweet_texts (returns a random sample of tweet texts)
server.tool(
  'sample_tweet_texts',
  { sampleSize: z.string().optional() },
  async ({ sampleSize }) => {
    let n = 5;
    if (sampleSize) {
      const parsed = parseInt(sampleSize, 10);
      if (!isNaN(parsed) && parsed > 0) n = parsed;
    }
    const tweets = await getTweetsFromZip();
    // Filter out retweets (only original tweets by the archive owner)
    const originalTweets = tweets.filter(t => !t.full_text.startsWith('RT @'));
    // Sample n unique tweets
    const sample = [];
    const used = new Set();
    while (sample.length < Math.min(n, originalTweets.length)) {
      const idx = Math.floor(Math.random() * originalTweets.length);
      if (!used.has(idx)) {
        used.add(idx);
        const rawText = originalTweets[idx].full_text || originalTweets[idx].text;
        sample.push(cleanTweetText(rawText));
      }
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(sample, null, 2),
        },
      ],
    };
  }
);

// Start MCP server on stdio
(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
})();
