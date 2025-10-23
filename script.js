import { EmojiButton } from "https://cdn.jsdelivr.net/npm/@joeattardi/emoji-button@4.6.4/dist/index.js";

// const socket = io("http://localhost:3000");
const socket = io("https://socket-server-ohp4.onrender.com");

const chatbox = document.getElementById("chatbox");
const usernameInput = document.getElementById("usernameInput");
const messageInput = document.getElementById("messageInput");
const typingIndicator = document.getElementById("typing");
const sendButton = document.getElementById("sendButton");
const emojiButton = document.querySelector("#emojiButton");

const sendSound = new Audio("/assets/audio/send.mp3");
const receiveSound = new Audio("/assets/audio/receive.mp3");
const typingSound = new Audio("/assets/audio/typing1.mp3");

socket.on("connect", () => {
  const status = document.createElement("p");
  status.textContent = "Connected to Socket.IO Server";
  status.classList.add("system");
  chatbox.appendChild(status);
  scrollToBottom();
});

socket.on("chat message", (msg) => {
  if (!msg.username || !msg.text) return;

  const currentUser = usernameInput.value.trim() || "Kyaw Soe";
  const isSender =
    msg.username.trim().toLowerCase() === currentUser.toLowerCase();

  if (!isSender) receiveSound.play();

  const messageElement = document.createElement("div");
  messageElement.classList.add("message");
  if (isSender) messageElement.classList.add("sender");

  const avatar = document.createElement("div");
  avatar.classList.add("avatar");
  avatar.textContent = msg.username.charAt(0).toUpperCase();

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");

  const nameSpan = document.createElement("span");
  nameSpan.classList.add("username");
  nameSpan.textContent = msg.username;

  const textSpan = document.createElement("span");
  textSpan.textContent = msg.text;

  const timeSpan = document.createElement("div");
  timeSpan.classList.add("timestamp");
  timeSpan.textContent = msg.time;

  bubble.appendChild(nameSpan);
  bubble.appendChild(textSpan);
  bubble.appendChild(timeSpan);

  if (isSender) {
    messageElement.appendChild(bubble);
    messageElement.appendChild(avatar);
  } else {
    messageElement.appendChild(avatar);
    messageElement.appendChild(bubble);
  }

  chatbox.appendChild(messageElement);
  scrollToBottom();
});

// Typing indicator
let lastTypingSoundTime = 0;
const typingSoundInterval = 1000;
socket.on("typing", (username) => {
  typingIndicator.textContent = `${username} is typing...`;

  const now = Date.now();
  if (now - lastTypingSoundTime > typingSoundInterval) {
    typingSound.currentTime = 0;
    typingSound.play();
    lastTypingSoundTime = now;
  }

  clearTimeout(window.typingTimeout);
  window.typingTimeout = setTimeout(() => {
    typingIndicator.textContent = "";
  }, 1000);
});

// Send Message
function sendMessage() {
  const username = usernameInput.value.trim() || "Kyaw Soe";
  const text = messageInput.value.trim();
  if (!text) return;

  const msg = { username, text };
  socket.emit("chat message", msg);
  messageInput.value = "";

  sendSound.play();
}

sendButton.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", (event) => {
  const username = usernameInput.value.trim() || "Kyaw Soe";
  socket.emit("typing", username);

  if (event.key === "Enter") sendMessage();
});

function scrollToBottom() {
  chatbox.scrollTop = chatbox.scrollHeight;
}

const picker = new EmojiButton({ theme: "auto", position: "top-end" });

picker.on("emoji", (selection) => {
  messageInput.value += selection.emoji;
  messageInput.focus();
});

emojiButton.addEventListener("click", () => {
  picker.togglePicker(emojiButton);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.log("Service Worker failed:", err));
  });
}
