import express from "express";
import bodyParser from "body-parser";
import { generateTweet, postTweet } from "../utils/twitterHandler.ts";
import { elizaLogger } from "@elizaos/core";

const app = express();
const PORT = process.env.WEBHOOK_PORT || 4000; // Default port for webhook

app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
  try {
    const feedback = req.body.form_response.answers;

    // Extract feedback text (adjust based on your Typeform structure)
    const userFeedback = feedback.map((answer: any) => answer.text).join(" ");

    elizaLogger.log("Received Feedback:", userFeedback);

    // Generate tweet content
    const tweet = generateTweet(userFeedback);

    // Post the tweet
    const success = await postTweet(tweet);

    if (success) {
      res
        .status(200)
        .json({ success: true, message: "Tweet posted successfully." });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Tweet failed to post." });
    }
  } catch (error) {
    elizaLogger.error("Error processing feedback:", error);
    res
      .status(500)
      .json({ success: false, message: "Error processing feedback" });
  }
});

export function startWebhookServer() {
  app.listen(PORT, () => {
    elizaLogger.success(`Webhook server listening on port ${PORT}`);
  });
}
