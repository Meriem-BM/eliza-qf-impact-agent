import { Scraper } from "agent-twitter-client";
import { elizaLogger } from "@elizaos/core";

export function generateTweet(feedback: string): string {
  return `🚀 New User Feedback: "${feedback}" #ElizaOS #UserFeedback`;
}

export async function postTweet(content: string): Promise<boolean> {
  try {
    const scraper = new Scraper();

    const username = process.env.TWITTER_USERNAME;
    const password = process.env.TWITTER_PASSWORD;
    const email = process.env.TWITTER_EMAIL;
    const twitter2faSecret = process.env.TWITTER_2FA_SECRET; // Optional for 2FA login

    if (!username || !password) {
      elizaLogger.error(
        "Twitter credentials are missing in environment variables."
      );
      return false;
    }

    // Log in to Twitter
    await scraper.login(username, password, email, twitter2faSecret);

    if (!(await scraper.isLoggedIn())) {
      elizaLogger.error("Twitter login failed.");
      return false;
    }

    // Send tweet
    elizaLogger.log("Attempting to send tweet:", content);

    const result = await scraper.sendTweet(content);
    const body = await result.json();

    elizaLogger.log("Tweet response:", body);

    if (body.errors) {
      elizaLogger.error(
        `Twitter API error (${body.errors[0].code}): ${body.errors[0].message}`
      );
      return false;
    }

    if (!body?.data?.create_tweet?.tweet_results?.result) {
      elizaLogger.error("Failed to post tweet: No tweet result in response");
      return false;
    }

    return true;
  } catch (error) {
    elizaLogger.error("Error posting tweet:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return false;
  }
}
