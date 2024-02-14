// pages/api/chatbot.ts

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { ChatData } from "../../models/chat_data";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Check for POST request
  // if (req.method !== "POST") {
  //   return res.status(405).end("Method Not Allowed");
  // }

  // Initialize the OpenAI client with your API key
  const openai = new OpenAI({
    apiKey: "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",
  });
  let chatData: ChatData[] = [];

  try {
    const assistant = await openai.beta.assistants.retrieve(
      "asst_PFzJ2Ki429plsdFmnUPfGsoV"
    );

    const thread = await openai.beta.threads.retrieve(
      "thread_mibjNqV0sFffn0NRoiWuU4iR"
    );

    // Sort these on time to make sure its always the right way
    const messages = await openai.beta.threads.messages.list(thread.id);

    console.log("messages: ", messages.data);
    messages.data.reverse().forEach((message) => {
      console.log("Role: ", message.role);
      console.log("Content: ", message.content[0].text.value);
    });
    messages.data.forEach((message) => {
      chatData.push({
        messageId: message.id,
        role: message.role,
        message: message.content[0].text.value,
        threadId: thread.id,
      });
    });

    console.log("chatData: ", chatData);

    // Send back the first choice's message content
    res.status(200).json({ messages: chatData, threadId: thread.id });
  } catch (error) {
    console.error("OpenAI API error:", error);
    res.status(500).json({ error: "Failed to fetch response from OpenAI" });
  }

  async function createUserMessage(threadId: string, message: string) {
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });
  }
}
