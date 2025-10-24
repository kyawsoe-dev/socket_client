const API_BASE = "https://socket-server-ohp4.onrender.com/api/v1";
const SOCKET_URL = "https://socket-server-ohp4.onrender.com";

//  STATE
let socket = null;
let currentUser = null;
let token = null;
let conversations = [];
let currentConversation = null;
let messagesCursorMap = {};
let typingTimeout = null;
let lastTypingEmit = 0;
let receivedMessages = new Set();
let selectedGroupMembers = [];

const sendSound = new Audio("/assets/audio/send.mp3");
const receiveSound = new Audio("/assets/audio/receive.mp3");
const typingSound = new Audio("/assets/audio/typing1.mp3");

function apiHeaders(withAuth = true) {
  const headers = { "Content-Type": "application/json" };
  if (withAuth && token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function scrollToBottom(chatbox) {
  chatbox.scrollTop = chatbox.scrollHeight;
}

function showTyping(typingIndicator, text) {
  typingIndicator.textContent = text;
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => (typingIndicator.textContent = ""), 2000);
}

function saveAuth(tk, user) {
  localStorage.setItem("token", tk);
  localStorage.setItem("user", JSON.stringify(user));
  token = tk;
  currentUser = user;
}

function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  token = null;
  currentUser = null;
}

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  const authView = document.getElementById("authView");
  const mainView = document.getElementById("mainView");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const loginIdentifier = document.getElementById("loginIdentifier");
  const loginPassword = document.getElementById("loginPassword");
  const regUsername = document.getElementById("regUsername");
  const regEmail = document.getElementById("regEmail");
  const regDisplayName = document.getElementById("regDisplayName");
  const regPassword = document.getElementById("regPassword");
  const meDisplay = document.getElementById("meDisplay");
  const logoutBtn = document.getElementById("logoutBtn");
  const conversationsList = document.getElementById("conversationsList");
  const openGroupModalBtn = document.getElementById("openGroupModalBtn");
  const searchUsersInput = document.getElementById("searchUsersInput");
  const searchedUsersList = document.getElementById("searchedUsersList");

  const chatbox = document.getElementById("chatMessages");
  const typingIndicator = document.getElementById("typing");
  const messageInput = document.getElementById("messageInput");
  const emojiButton = document.getElementById("emojiBtn");
  const convTitle = document.getElementById("convTitle");
  const convAvatar = document.getElementById("convAvatar");
  const convMembers = document.getElementById("convMembers");
  const backBtn = document.getElementById("backBtn");

  const groupModal = document.getElementById("groupModal");
  const closeGroupModalBtn = document.getElementById("closeGroupModalBtn");
  const createGroupBtn = document.getElementById("createGroupBtn");
  const groupTitle = document.getElementById("groupTitle");
  const groupMemberSearch = document.getElementById("groupMemberSearch");
  const groupMembersList = document.getElementById("groupMembersList");
  const selectedMembers = document.getElementById("selectedMembers");

  const appTitle = document.getElementById("appTitle");

  //  EMOJI PICKER
  if (emojiButton && messageInput) {
    try {
      const module = await import(
        "https://cdn.jsdelivr.net/npm/@joeattardi/emoji-button@4.6.4/dist/index.js"
      );
      const { EmojiButton } = module;

      const picker = new EmojiButton({ position: "top-end", theme: "auto" });
      picker.on("emoji", (selection) => {
        messageInput.value += selection.emoji;
        messageInput.focus();
      });
      emojiButton.addEventListener("click", () =>
        picker.togglePicker(emojiButton)
      );
    } catch (err) {
      console.error("Emoji picker load failed:", err);
      emojiButton.style.display = "none";
    }
  }

  //  SHOW/HIDE VIEWS
  function showAuthView() {
    authView.style.display = "";
    mainView.style.display = "none";
    groupModal.style.display = "none";
    appTitle.textContent = "KS Chat App — Login";
  }

  function showMainView() {
    authView.style.display = "none";
    mainView.style.display = "";
    appTitle.textContent = "KS Chat App";
  }

  //  TOGGLE MOBILE VIEWS
  function showConversationList() {
    console.log("Showing conversation list");
    document.querySelector(".sidebar").style.display = "flex";
    document.querySelector(".chat-panel").classList.remove("active");
    convMembers.classList.add("hidden");
    if (backBtn) backBtn.style.display = "none";
  }

  function showChatPanel() {
    console.log("Showing chat panel");
    document.querySelector(".sidebar").style.display = "none";
    document.querySelector(".chat-panel").classList.add("active");
    if (backBtn) backBtn.style.display = "inline-flex";
  }

  // Back button handlers
  backBtn?.addEventListener("click", () => {
    console.log("Back button clicked");
    showConversationList();
    currentConversation = null;
    convTitle.textContent = "Select a conversation";
    convAvatar.textContent = "";
    convMembers.innerHTML = "";
    convMembers.classList.add("hidden");
    chatbox.innerHTML = "";
    typingIndicator.textContent = "";
  });

  // Group title toggle
  document
    .querySelector(".chat-header-title")
    ?.addEventListener("click", () => {
      if (currentConversation) {
        console.log(
          "Toggling convMembers, current hidden:",
          convMembers.classList.contains("hidden")
        );
        convMembers.classList.toggle("hidden");
        console.log(
          "After toggle, hidden:",
          convMembers.classList.contains("hidden")
        );
      } else {
        console.log("No current conversation, cannot toggle convMembers");
      }
    });

  //  SOCKET
  function connectSocket() {
    if (!token) return;
    socket = io(SOCKET_URL, { auth: { token } });

    socket.on("connect", () => {
      console.log("socket connected", socket.id);
      appendSystemMessage("Connected to server");
    });

    socket.on("disconnect", () => {
      console.log("socket disconnected");
      appendSystemMessage("Disconnected from server");
    });

    socket.on("chat message", renderIncomingMessage);

    socket.on("typing", ({ conversationId, username }) => {
      if (
        currentConversation &&
        Number(conversationId) === Number(currentConversation.id)
      ) {
        showTyping(typingIndicator, `${username} is typing...`);
        const now = Date.now();
        if (now - lastTypingEmit > 1000) {
          typingSound.currentTime = 0;
          typingSound.play().catch(() => {});
        }
        lastTypingEmit = now;
      }
    });

    socket.on("read", ({ conversationId, userId, lastReadAt }) => {
      if (
        currentConversation &&
        Number(conversationId) === Number(currentConversation.id)
      ) {
        const user = currentConversation.members.find(
          (m) => m.user.id === userId
        )?.user;
        const name = user
          ? user.displayName || user.username
          : `User ${userId}`;
        appendSystemMessage(
          `${name} read at ${new Date(lastReadAt).toLocaleTimeString()}`
        );
      }
    });
  }

  function appendSystemMessage(text) {
    const el = document.createElement("div");
    el.className = "system";
    el.textContent = text;
    chatbox.appendChild(el);
    scrollToBottom(chatbox);
  }

  //  INIT AFTER AUTH
  async function initAfterAuth() {
    if (!token || !currentUser) return;
    showMainView();
    meDisplay.textContent = `${
      currentUser.displayName || currentUser.username
    }`;
    connectSocket();
    await loadConversations();
    if (window.innerWidth > 768 && conversations.length > 0) {
      console.log("Selecting first conversation on desktop view");
      openConversation(conversations[0]);
    }
  }

  //  AUTH HANDLERS
  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = regUsername.value.trim();
    const email = regEmail.value.trim() || undefined;
    const displayName = regDisplayName.value.trim() || undefined;
    const password = regPassword.value;
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: apiHeaders(false),
        body: JSON.stringify({ username, email, password, displayName }),
      });
      const data = await res.json();
      if (res.ok) {
        saveAuth(data.token, data.user);
        await initAfterAuth();
      } else alert(data.error || "Register failed");
    } catch (err) {
      console.error(err);
      alert("Register request failed");
    }
  });

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const usernameOrEmail = loginIdentifier.value.trim();
    const password = loginPassword.value;
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: apiHeaders(false),
        body: JSON.stringify({ usernameOrEmail, password }),
      });
      const data = await res.json();
      if (res.ok) {
        saveAuth(data.token, data.user);
        await initAfterAuth();
      } else alert(data.error || "Login failed");
    } catch (err) {
      console.error(err);
      alert("Login request failed");
    }
  });

  logoutBtn?.addEventListener("click", () => {
    if (socket) socket.disconnect();
    clearAuth();
    showAuthView();
  });

  //  MESSAGE INPUT
  messageForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });

  messageInput?.addEventListener("input", emitTyping);

  function emitTyping() {
    if (!socket?.connected || !currentConversation) return;
    socket.emit("typing", { conversationId: currentConversation.id });
  }

  async function sendMessage() {
    if (!currentConversation) return alert("Select a conversation first");
    const text = messageInput.value.trim();
    if (!text) return;

    const payload = {
      conversationId: currentConversation.id,
      content: text,
      type: "TEXT",
      metadata: {},
    };

    const optimisticId = `tmp-${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      uuid: null,
      conversationId: currentConversation.id,
      senderId: currentUser.id,
      content: text,
      type: "TEXT",
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    appendMessageToChat(optimistic, true);
    messageInput.value = "";
    scrollToBottom(chatbox);

    try {
      if (socket?.connected) {
        socket.emit("chat message", payload, (ack) => {
          if (ack?.success && ack.message) {
            replaceOptimisticMessage(optimisticId, ack.message);
            updateConversationPreview(currentConversation.id, ack.message);
          }
        });
        sendSound.play().catch(() => {});
      } else {
        const res = await fetch(
          `${API_BASE}/conversations/${currentConversation.id}/messages`,
          {
            method: "POST",
            headers: apiHeaders(true),
            body: JSON.stringify({ content: text, type: "TEXT", metadata: {} }),
          }
        );
        const saved = await res.json();
        if (res.ok) {
          replaceOptimisticMessage(optimisticId, saved);
          updateConversationPreview(currentConversation.id, saved);
        }
        sendSound.play().catch(() => {});
      }
    } catch (err) {
      console.error("sendMessage", err);
      alert("Failed to send message");
    }
  }

  function appendMessageToChat(msg, optimistic = false) {
    if (receivedMessages.has(msg.id)) return;
    receivedMessages.add(msg.id);

    const el = document.createElement("div");
    el.className = `message ${
      msg.senderId === currentUser.id ? "right" : "left"
    }`;
    el.dataset.msgId = msg.id;

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    let name = "";
    if (msg.senderId === currentUser.id) {
      name = currentUser.displayName || currentUser.username;
    } else {
      if (currentConversation?.members) {
        const m = currentConversation.members.find(
          (m) => m.user.id === msg.senderId
        );
        if (m) name = m.user.displayName || m.user.username;
      }
      if (!name) name = `User ${msg.senderId}`;
      const nameSpan = document.createElement("div");
      nameSpan.className = "username";
      nameSpan.textContent = name;
      bubble.appendChild(nameSpan);
    }

    const textSpan = document.createElement("div");
    textSpan.className = "text";
    textSpan.textContent = msg.content || "";

    const timeSpan = document.createElement("div");
    timeSpan.className = "timestamp";
    timeSpan.textContent = formatTime(msg.createdAt);

    bubble.appendChild(textSpan);
    bubble.appendChild(timeSpan);

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = name.charAt(0).toUpperCase();
    el.appendChild(avatar);
    el.appendChild(bubble);

    if (optimistic) el.style.opacity = "0.7";
    chatbox.appendChild(el);
    scrollToBottom(chatbox);
  }

  function replaceOptimisticMessage(tmpId, realMsg) {
    const node = chatbox.querySelector(`[data-msg-id="${tmpId}"]`);
    if (node) {
      node.remove();
    }
    appendMessageToChat(realMsg);
  }

  function renderIncomingMessage(msg) {
    if (receivedMessages.has(msg.id)) return;
    appendMessageToChat(msg);
    if (msg.senderId !== currentUser.id) {
      receiveSound.currentTime = 0;
      receiveSound.play().catch(() => {});
    }
    updateConversationPreview(msg.conversationId, msg);
    scrollToBottom(chatbox);
  }

  function updateConversationPreview(convId, newMsg) {
    const conv = conversations.find((c) => c.id === convId);
    if (conv) {
      conv.lastMessage = newMsg;
      renderConversations();
    }
  }

  //  CONVERSATIONS
  async function loadConversations() {
    try {
      const res = await fetch(`${API_BASE}/conversations`, {
        headers: apiHeaders(true),
      });
      if (!res.ok) throw new Error("Failed to load conversations");
      conversations = await res.json();
      console.log("Loaded conversations:", conversations);
      renderConversations();
    } catch (err) {
      console.error("loadConversations", err);
      alert("Could not load conversations");
    }
  }

  function renderConversations() {
    conversationsList.innerHTML = "";
    conversations.forEach((c, index) => {
      const li = document.createElement("li");
      li.className = `conversation-item${
        currentConversation && currentConversation.id === c.id ? " active" : ""
      }`;
      const title = c.isGroup
        ? c.title || "Untitled Group"
        : conversationTitleFromMembers(c.members);
      const preview = c.lastMessage?.content
        ? c.lastMessage.content.slice(0, 50) + "..."
        : "";
      li.innerHTML = `
        <div class="conv-avatar">${title.charAt(0).toUpperCase()}</div>
        <div class="conv-info">
          <div class="conv-title">${title}</div>
          <div class="conv-meta">${preview}</div>
        </div>
      `;
      li.addEventListener("click", () => {
        console.log(`Opening conversation: ${title}`);
        openConversation(c);
        if (window.innerWidth <= 768) {
          showChatPanel();
        }
      });
      conversationsList.appendChild(li);
    });
  }

  function conversationTitleFromMembers(members) {
    if (!members || members.length !== 2) return "Conversation";
    const other = members.find((m) => m.user.id !== currentUser.id);
    return (
      other?.user.displayName ||
      other?.user.username ||
      `User ${other?.user.id}`
    );
  }

  async function openConversation(conv) {
    console.log(
      "Opening conversation ID:",
      conv.id,
      "isGroup:",
      conv.isGroup,
      "members:",
      conv.members
    );
    currentConversation = conv;
    const title = conv.isGroup
      ? conv.title || "Group"
      : conversationTitleFromMembers(conv.members);
    convTitle.textContent = title;
    convAvatar.textContent = title.charAt(0).toUpperCase();

    if (conv.isGroup) {
      if (
        !conv.members ||
        !Array.isArray(conv.members) ||
        conv.members.length === 0
      ) {
        console.warn("No valid members for group chat:", conv);
        convMembers.innerHTML =
          '<div class="member-count">No members available</div>';
      } else {
        const memberNames = conv.members
          .filter((m) => m.user && m.user.id !== currentUser.id)
          .map((m) => {
            const name =
              m.user?.displayName ||
              m.user?.username ||
              `User ${m.user?.id || "unknown"}`;
            return `<span class="member">${name}</span>`;
          })
          .join(", ");
        const memberCount = conv.members.length;
        convMembers.innerHTML = `
          <div class="member-list">${memberNames}</div>
          <div class="member-count">Total: ${memberCount} member${
          memberCount !== 1 ? "s" : ""
        }</div>
        `;
        console.log("Set convMembers HTML:", convMembers.innerHTML);
      }
    } else if (conv.members) {
      const other = conv.members.find((m) => m.user.id !== currentUser.id);
      const name = other
        ? other.user.displayName ||
          other.user.username ||
          `User ${other.user.id}`
        : "No other member";
      convMembers.innerHTML = `
        <div class="member-list">${name}</div>
        <div class="member-count">Total: 2 members</div>
      `;
      console.log("Set convMembers HTML for 1:1:", convMembers.innerHTML);
    } else {
      convMembers.innerHTML =
        '<div class="member-count">No members available</div>';
      console.log("No members for conversation:", conv);
    }

    convMembers.classList.add("hidden");
    chatbox.innerHTML = "";
    typingIndicator.textContent = "";
    receivedMessages.clear();

    if (socket?.connected) socket.emit("join", { conversationId: conv.id });

    await loadMessages(conv.id);

    if (socket?.connected) socket.emit("markRead", { conversationId: conv.id });
  }

  async function loadMessages(conversationId, limit = 50, cursor) {
    try {
      const url = new URL(
        `${API_BASE}/conversations/${conversationId}/messages`
      );
      url.searchParams.set("limit", limit);
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString(), { headers: apiHeaders(true) });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const msgs = await res.json();
      receivedMessages.clear();
      msgs.forEach((m) => appendMessageToChat(m));
      scrollToBottom(chatbox);
      if (msgs.length) messagesCursorMap[conversationId] = msgs[0].id;
    } catch (err) {
      console.error("loadMessages", err);
    }
  }

  //  USER SEARCH FOR NEW CHAT
  searchUsersInput?.addEventListener(
    "input",
    debounce(async () => {
      const query = searchUsersInput.value.trim();
      if (query === "") {
        searchedUsersList.innerHTML = "";
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE}/conversations/users/search?query=${encodeURIComponent(
            query
          )}`,
          {
            headers: apiHeaders(true),
          }
        );
        if (!res.ok) throw new Error("User search failed");
        const users = await res.json();
        searchedUsersList.innerHTML = "";
        users.forEach((user) => {
          const li = document.createElement("li");
          li.textContent = `${user.displayName || user.username} (@${
            user.username
          })`;
          li.addEventListener("click", async () => {
            console.log(`Creating 1:1 with user: ${user.username}`);
            await createOneToOne(user.id);
            searchedUsersList.innerHTML = "";
            searchUsersInput.value = "";
            await loadConversations();
            if (window.innerWidth <= 768) {
              showChatPanel();
            }
          });
          searchedUsersList.appendChild(li);
        });
      } catch (err) {
        console.error("User search failed", err);
      }
    })
  );

  async function createOneToOne(otherUserId) {
    try {
      const res = await fetch(`${API_BASE}/conversations/one-to-one`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ otherUserId }),
      });
      if (!res.ok)
        throw new Error((await res.json()).message || "Cannot create 1:1");
      const conv = await res.json();
      await loadConversations();
      openConversation(conv);
    } catch (err) {
      console.error("createOneToOne", err);
      alert("Create one-to-one failed: " + err.message);
    }
  }

  //  GROUP
  openGroupModalBtn?.addEventListener("click", () => {
    groupModal.style.display = "flex";
    selectedGroupMembers = [];
    selectedMembers.innerHTML = "";
    groupMembersList.innerHTML = "";
    groupMemberSearch.value = "";
  });

  closeGroupModalBtn?.addEventListener("click", () => {
    groupModal.style.display = "none";
    selectedGroupMembers = [];
    selectedMembers.innerHTML = "";
    groupMembersList.innerHTML = "";
  });

  groupMemberSearch?.addEventListener(
    "input",
    debounce(async () => {
      const query = groupMemberSearch.value.trim();
      if (query === "") {
        groupMembersList.innerHTML = "";
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE}/conversations/users/search?query=${encodeURIComponent(
            query
          )}`,
          {
            headers: apiHeaders(true),
          }
        );
        if (!res.ok) throw new Error("Group member search failed");
        const users = await res.json();
        groupMembersList.innerHTML = "";
        users.forEach((user) => {
          if (selectedGroupMembers.some((m) => m.id === user.id)) return;
          const li = document.createElement("li");
          li.textContent = `${user.displayName || user.username} (@${
            user.username
          })`;
          li.addEventListener("click", () => {
            selectedGroupMembers.push(user);
            renderSelectedMembers();
            groupMembersList.innerHTML = "";
            groupMemberSearch.value = "";
          });
          groupMembersList.appendChild(li);
        });
      } catch (err) {
        console.error("Group member search failed", err);
      }
    })
  );

  function renderSelectedMembers() {
    selectedMembers.innerHTML = "";
    selectedGroupMembers.forEach((user) => {
      const span = document.createElement("span");
      span.className = "selected-member";
      span.textContent = user.displayName || user.username;
      const remove = document.createElement("span");
      remove.className = "remove";
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        selectedGroupMembers = selectedGroupMembers.filter(
          (m) => m.id !== user.id
        );
        renderSelectedMembers();
      });
      span.appendChild(remove);
      selectedMembers.appendChild(span);
    });
  }

  createGroupBtn?.addEventListener("click", async () => {
    const title = groupTitle.value.trim();
    const memberIds = selectedGroupMembers.map((m) => m.id);
    try {
      const res = await fetch(`${API_BASE}/conversations/group`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ title, memberIds }),
      });
      if (!res.ok)
        throw new Error((await res.json()).message || "Create group failed");
      const group = await res.json();
      groupModal.style.display = "none";
      groupTitle.value = "";
      selectedGroupMembers = [];
      selectedMembers.innerHTML = "";
      await loadConversations();
      openConversation(group);
      if (window.innerWidth <= 768) {
        showChatPanel();
      }
    } catch (err) {
      console.error(err);
      alert("Could not create group: " + err.message);
    }
  });

  //  BOOTSTRAP
  token = localStorage.getItem("token");
  const storedUser = localStorage.getItem("user");
  if (token && storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
      await initAfterAuth();
    } catch {
      clearAuth();
      showAuthView();
    }
  } else showAuthView();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.log("Service Worker failed:", err));
  });
}
