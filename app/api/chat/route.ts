import OpenAI from "openai";
import { OpenAIStream, StreamingTextResponse } from "ai";

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("openai: ", openai);

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { messages } = await req.json();
  console.log("messages: ", messages);

  // Ask OpenAI for a streaming chat completion given the prompt
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    stream: true,
    messages,
  });
  console.log("response: ", response);

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(response);
  // Respond with the stream
  return new StreamingTextResponse(stream);
}

// export default async function handler(req, res) {
//   res.status(200).json({ message: "API is working" });
// }
