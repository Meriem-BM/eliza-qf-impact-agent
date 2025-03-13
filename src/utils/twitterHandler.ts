import { fetchTypeformResponses } from "../service/typeform.ts";
import { Scraper } from "agent-twitter-client";
import { elizaLogger } from "@elizaos/core";
import OpenAI from "openai";
import {
  isResponseProcessed,
  markResponseAsProcessed,
} from "../db-helper/cacheHelper.ts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateTweet(response: any): Promise<string[] | null> {
  const projectName =
    response.answers.find((a: any) => a.field.id === "phIyQgeo2IDg")?.text ||
    "A QF project";

  const projectLink =
    response.answers.find((a: any) => a.field.id === "DxOQxkBzpwQt")?.text ||
    null;

  const impactSummary =
    response.answers.find((a: any) => a.field.id === "2MtLw3NY8qK8")?.text ||
    "made an impact in their community.";

  const specificChanges =
    response.answers.find((a: any) => a.field.id === "00kvvdaWUYAI")?.text ||
    "creating positive change.";

  const additionalComments =
    response.answers.find((a: any) => a.field.id === "BYCZRtNLjgAS")?.text ||
    "";

  const allowTweet =
    response.answers.find((a: any) => a.field.id === "8NDFqr4OnyPq")?.boolean ||
    false;

  if (!allowTweet) {
    console.log(`Skipping tweet for ${projectName} (user opted out).`);
    return null;
  }

  const prompt = `
  You are an expert social media assistant for a Web3 funding platform. Your task is to generate an engaging tweet or Twitter thread based on a project's feedback from a Quadratic Funding (QF) round.

  ## Context:
  A project has received funding through QF, and the project owner has shared their impact story via a feedback form.

  ## Tweet Requirements:
  - If possible, generate a **single tweet under 280 characters**.
  - If the story **cannot fit in 280 characters**, format it as a Twitter **thread** (multiple tweets).
  - Start with an **engaging hook** (e.g., "🚀 Another QF success story!", "🌟 See how Web3 funding changed lives!", etc.).
  - Mention the **project name** naturally.
  - Summarize the **impact of the funding** in an exciting way.
  - Include **specific positive changes** the funding enabled.
  - If available, include a **project link** at the end.
  - If the additional comment is meaningful, include it.
  - Add **one relevant hashtag** (choose from: #QuadraticFunding, #CryptoFunding, #ImpactMatters, #Web3Projects).

  ## Form Data Provided:
  - **Project Name**: ${projectName}
  - **Impact Summary**: ${impactSummary}
  - **Specific Changes**: ${specificChanges}
  - **Project Link**: ${projectLink ? projectLink : "N/A"}
  - **Additional Comments**: ${additionalComments ? additionalComments : "None"}

  If the tweet is too long for a single post, split it into a **Twitter thread** and return an **array** of tweets in order.
  Ensure each tweet **does not exceed 280 characters**.

  ## Example Outputs:
  **Single Tweet (if possible)**:
  "🚀 Another QF success story! ${projectName} used QF funding to ${impactSummary}. Thanks to support, they achieved ${specificChanges}. Learn more: ${projectLink} #QuadraticFunding"

  **Thread (if needed)**:
  [
    "🚀 Another QF success story! ${projectName} used QF funding to ${impactSummary}.",
    "Thanks to support, they achieved ${specificChanges}. Their work is creating real impact! 🌍",
    "Learn more about ${projectName} here: ${projectLink} #QuadraticFunding"
  ]

  **Now generate the best tweet or thread for this impact story.**
  `;

  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 300,
      temperature: 0.5,
    });

    const generatedText = aiResponse.choices[0].message.content.trim();

    // Ensure AI returns a properly formatted thread
    let tweets: string[];

    try {
      tweets = JSON.parse(generatedText);
      if (!Array.isArray(tweets)) throw new Error("Not an array");
    } catch (error) {
      // If AI doesn't return a valid array, treat it as a single tweet
      tweets = [generatedText];
    }

    return tweets;
  } catch (error) {
    console.error("Error generating tweet:", error);
    return null;
  }
}

export async function postTweet(
  tweets: string[],
  responseId: string
): Promise<boolean> {
  try {
    const scraper = new Scraper();
    const username = process.env.TWITTER_USERNAME;
    const password = process.env.TWITTER_PASSWORD;

    if (!username || !password) {
      elizaLogger.error(
        "Twitter credentials are missing in environment variables."
      );
      return false;
    }

    // Authenticate with cookies (if available)
    const cookiesString = process.env.TWITTER_COOKIES;
    if (!cookiesString) {
      throw new Error(
        "Twitter cookies not configured in environment variables"
      );
    }

    const cookiesArray = cookiesString.split(";").map((cookie) => {
      const [key, value] = cookie.split("=");
      return { key: key.trim(), value: value.trim() };
    });

    const formattedCookies = cookiesArray.map(
      (cookie) => `${cookie.key}=${cookie.value}; domain=.twitter.com; path=/`
    );

    await scraper.setCookies(formattedCookies);

    if (await scraper.isLoggedIn()) {
      const profile = await scraper.me();
      console.log(`Logged into Twitter as ${profile?.name || "user"}`);
    } else {
      throw new Error("Failed to authenticate with cookies");
    }

    let replyToId = null;
    for (const tweet of tweets) {
      const result = await scraper.sendTweet(tweet, replyToId);
      const body = await result.json();

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

      replyToId = body.data.create_tweet.tweet_results.result.rest_id;
    }

    await markResponseAsProcessed(responseId);
    return true;
  } catch (error) {
    console.log("Error posting tweet: ❌", error);
    return false;
  }
}

export async function processTypeformResponses() {
  const responses = await fetchTypeformResponses();

  if (responses.length === 0) {
    elizaLogger.log("No new Typeform responses.");
    return;
  }

  for (const response of responses) {
    if (!response.answers) {
      elizaLogger.log("Skipping response - No answers found.");
      continue;
    }

    const responseId = response.response_id;
    const allowTweet =
      response.answers.find((a: any) => a.field.id === "8NDFqr4OnyPq")
        ?.boolean || false;

    if (!allowTweet) {
      elizaLogger.log(`Skipping response ${responseId} - User opted out.`);
      continue;
    }

    // Check if response has already been processed in the database
    if (await isResponseProcessed(responseId)) {
      console.log(`Skipping duplicate response: ${responseId}`);
      continue;
    }

    const tweet = await generateTweet(response);
    if (tweet) {
      await postTweet(tweet, responseId);
    }
  }
}

export async function regenerateShortTweet(longTweet: string): Promise<string> {
  try {
    const prompt = `
      Your task is to shorten the following tweet while keeping the message intact and engaging.
      - Keep it **under 280 characters**.
      - Preserve key information, impact details, and hashtags.
      - Make sure it’s readable and still impactful.

      ## Original Tweet:
      "${longTweet}"

      ## Shorter Version:
    `;

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 100,
      temperature: 0.5,
    });

    return aiResponse.choices[0].message.content.trim().replace(/"/g, "");
  } catch (error) {
    console.error("Error generating shorter tweet:", error);
    return longTweet;
  }
}
