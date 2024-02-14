// components/ChatInterface.tsx

import React, { useEffect, useState } from "react";
import { MessageDirection } from "@chatscope/chat-ui-kit-react/src/types/unions";
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  Avatar,
  ConversationHeader,
  InfoButton,
  MessageSeparator,
  TypingIndicator,
  VideoCallButton,
  VoiceCallButton,
} from "@chatscope/chat-ui-kit-react";

import { ChatData } from "../models/chat_data";

const ChatInterface = () => {
  const [messages, setMessages] = useState<ChatData[]>([]);

  useEffect(() => {
    fetch("/api/chatbot")
      .then((response) => response.json())
      .then((data) => {
        console.log("messages: ", data.messages);
        setMessages(data.messages); // Update state with messages
      })
      .catch((error) => console.error("Error fetching messages:", error));
  }, []);

  function getDirection(role: string): MessageDirection {
    return role === "assistant" ? "incoming" : "outgoing";
  }

  return (
    <div>
      <MainContainer>
        <ChatContainer>
          <ConversationHeader>
            <Avatar src={"public/assistant.webp"} />
            <ConversationHeader.Content userName="Your FPL Assitant" />
          </ConversationHeader>
          <MessageList>
            {messages.map((message) => (
              <Message
                key={message.messageId}
                model={{
                  message: message.message,
                  sentTime: "",
                  sender: message.role,
                  direction: getDirection(message.role),
                  position: "normal",
                }}
              />
            ))}
          </MessageList>
          <MessageInput placeholder="Type message here" />
        </ChatContainer>
      </MainContainer>
    </div>
  );
};

export default ChatInterface;
