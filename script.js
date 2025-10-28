const API_BASE = "https://socket-server-ohp4.onrender.com/api/v1";
const SOCKET_URL = "https://socket-server-ohp4.onrender.com";

// const API_BASE = "http://localhost:3000/api/v1";
// const SOCKET_URL = "http://localhost:3000";

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
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");

  const authView = document.getElementById("authView");
  const mainView = document.getElementById("mainView");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const loginIdentifier = document.getElementById("loginIdentifier");
  const loginPassword = document.getElementById("loginPassword");
  const regConfirm = document.getElementById("regConfirmPassword");
  const usernameMsg = document.getElementById("usernameMsg");
  const emailMsg = document.getElementById("emailMsg");
  const passwordMatchMsg = document.getElementById("passwordMatchMsg");
  const submitBtn = registerForm.querySelector("button[type='submit']");
  const regUsername = document.getElementById("regUsername");
  const regEmail = document.getElementById("regEmail");
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

  // Alert
  function showAlert(message, type = "info") {
    Swal.fire({
      icon: type, // 'success', 'error', 'warning', 'info', 'question'
      text: message,
      confirmButtonText: "OK",
    });
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

  loginTab.addEventListener("click", () => {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
  });

  registerTab.addEventListener("click", () => {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  });

  // password toggle
  function togglePassword(id, icon) {
    const input = document.getElementById(id);
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    icon.classList.toggle("fa-eye");
    icon.classList.toggle("fa-eye-slash");
  }

  // check field availability
  async function checkAvailability(field, value, msgElem) {
    if (!value) {
      msgElem.textContent = "";
      msgElem.style.color = "";
      return true;
    }
    try {
      const res = await fetch(
        `${API_BASE}/auth/check?field=${field}&value=${encodeURIComponent(
          value
        )}`
      );
      const data = await res.json();
      if (data.available) {
        msgElem.textContent = `${
          field.charAt(0).toUpperCase() + field.slice(1)
        } available`;
        msgElem.style.color = "green";
        return true;
      } else {
        msgElem.textContent = `${
          field.charAt(0).toUpperCase() + field.slice(1)
        } already in use`;
        msgElem.style.color = "red";
        return false;
      }
    } catch (err) {
      console.error(err);
      msgElem.textContent = "";
      return false;
    }
  }

  // live validation checks
  let usernameValid = false;
  let emailValid = false;
  let passwordMatchValid = false;

  regUsername.addEventListener(
    "input",
    debounce(async () => {
      usernameValid = await checkAvailability(
        "username",
        regUsername.value.trim(),
        usernameMsg
      );
      updateSubmitState();
    }, 500)
  );

  regEmail.addEventListener(
    "input",
    debounce(async () => {
      emailValid = await checkAvailability(
        "email",
        regEmail.value.trim(),
        emailMsg
      );
      updateSubmitState();
    }, 500)
  );

  // live password match check
  function checkPasswords() {
    if (!regPassword.value && !regConfirm.value) {
      passwordMatchMsg.textContent = "";
      regConfirm.style.borderColor = "";
      passwordMatchValid = false;
      updateSubmitState();
      return;
    }

    if (regPassword.value === regConfirm.value) {
      passwordMatchMsg.textContent = "Passwords match";
      passwordMatchMsg.style.color = "green";
      regConfirm.style.borderColor = "green";
      passwordMatchValid = true;
    } else {
      passwordMatchMsg.textContent = "Passwords do not match";
      passwordMatchMsg.style.color = "red";
      regConfirm.style.borderColor = "red";
      passwordMatchValid = false;
    }
    updateSubmitState();
  }

  regPassword.addEventListener("input", checkPasswords);
  regConfirm.addEventListener("input", checkPasswords);

  // Enable submit when all valid
  function updateSubmitState() {
    submitBtn.disabled = !(usernameValid && emailValid && passwordMatchValid);
  }

  //  AUTH HANDLERS
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!(usernameValid && emailValid && passwordMatchValid)) {
      showAlert("Please fix errors before submitting.", "warning");
      return;
    }

    const registerBtn = registerForm.querySelector("button[type='submit']");
    registerBtn.disabled = true;
    const originalText = registerBtn.textContent;
    registerBtn.textContent = "Registering...";

    const username = regUsername.value.trim();
    const email = regEmail.value.trim();
    const displayName = document.getElementById("regDisplayName").value.trim();
    const password = regPassword.value;

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, displayName }),
      });
      const data = await res.json();
      if (res.ok) {
        console.log("Registered!", data);
        showAlert("Registration successful! Please log in.", "success");
        loginTab.click();
      } else {
        showAlert(data.error || "Registration failed", "error");
      }
    } catch (err) {
      console.error(err);
      showAlert("Register request failed", "error");
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = originalText;
    }
  });

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const loginBtn = loginForm.querySelector("button[type='submit']");
    const usernameOrEmail = loginIdentifier.value.trim();
    const password = loginPassword.value;

    loginBtn.disabled = true;
    const originalText = loginBtn.textContent;
    loginBtn.textContent = "Logging in...";

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
      } else {
        showAlert(data.error || "Login failed", "error");
      }
    } catch (err) {
      console.error(err);
      showAlert("Login request failed", "error");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = originalText;
    }
  });

  logoutBtn?.addEventListener("click", () => {
    if (socket) socket.disconnect();
    clearAuth();
    showAuthView();
  });

  //  TOGGLE MOBILE VIEWS
  function showConversationList() {
    const sidebar = document.querySelector(".sidebar");
    const chatPanel = document.querySelector(".chat-panel");
    const convMembers = document.getElementById("convMembers");

    sidebar.style.display = "flex";
    chatPanel.classList.remove("active");

    if (convMembers) convMembers.classList.add("hidden");

    if (backBtn) backBtn.style.display = "none";

    if (!conversations || conversations.length === 0) {
      chatPanel.style.display = "none";
    } else {
      chatPanel.style.display = "flex";
      chatbox.innerHTML = "";
    }
  }

  function showChatPanel() {
    console.log("Showing chat panel");
    document.querySelector(".sidebar").style.display = "none";
    document.querySelector(".chat-panel").classList.add("active");
    if (backBtn) backBtn.style.display = "inline-flex";
  }

  // Back button handlers
  backBtn?.addEventListener("click", () => {
    showConversationList();
    currentConversation = null;
    convTitle.textContent = "Select a conversation";
    convAvatar.textContent = "";

    const convMembers = document.getElementById("convMembers");
    if (convMembers) {
      convMembers.innerHTML = "";
      convMembers.classList.add("hidden");
    }

    if (chatbox) chatbox.innerHTML = "";
    if (typingIndicator) typingIndicator.textContent = "";
  });

  // Group title toggle
  document.addEventListener("DOMContentLoaded", () => {
    const convMembers = document.getElementById("convMembers");
    const header = document.querySelector(".chat-header-title");

    if (!convMembers || !header) {
      console.warn("convMembers or header element not found in DOM");
      return;
    }

    header.addEventListener("click", () => {
      if (currentConversation) {
        const isHidden = convMembers.classList.contains("hidden");
        console.log("Toggling convMembers, current hidden:", isHidden);

        convMembers.classList.toggle("hidden");

        console.log(
          "After toggle, hidden:",
          convMembers.classList.contains("hidden")
        );
      } else {
        console.log("No current conversation, cannot toggle convMembers");
      }
    });
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

    const displayName = currentUser.displayName || currentUser.username;
    meDisplay.textContent = displayName;

    const meAvatar = document.getElementById("meAvatar");
    if (meAvatar) {
      meAvatar.textContent = displayName.charAt(0).toUpperCase();
    }

    connectSocket();
    await loadConversations();

    if (!conversations || conversations.length === 0) {
      showConversationList();
    } else if (window.innerWidth > 768) {
      openConversation(conversations[0]);
    }
  }

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
    if (!currentConversation)
      return showAlert("Select a conversation first", "warning");
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
      showAlert("Failed to send message", "error");
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
    const convIndex = conversations.findIndex((c) => c.id === convId);
    if (convIndex === -1) return;

    conversations[convIndex].lastMessage = newMsg;

    const [conv] = conversations.splice(convIndex, 1);
    conversations.unshift(conv);

    renderConversations();
  }

  //  CONVERSATIONS
  let currentConvPage = 1;
  let totalConvPages = 1;
  let loadingConversations = false;

  async function loadConversations(page = 1) {
    if (loadingConversations) return [];
    loadingConversations = true;
    const spinner = document.getElementById("loadingSpinner");
    spinner.style.display = "block";

    try {
      const res = await fetch(
        `${API_BASE}/conversations?page=${page}&limit=20`,
        {
          headers: apiHeaders(true),
        }
      );
      if (!res.ok) throw new Error("Failed to load conversations");
      const data = await res.json();

      const convs = data.data || data;
      totalConvPages = data.totalPages || 1;

      if (page === 1) {
        conversations = convs;
        conversationsList.innerHTML = "";
      } else {
        conversations.push(...convs);
      }

      renderConversations();

      const chatPanel = document.querySelector(".chat-panel");
      if (conversations.length > 0) chatPanel.style.display = "flex";

      return convs;
    } catch (err) {
      console.error("loadConversations", err);
      showAlert("Could not load conversations", "error");
      return [];
    } finally {
      spinner.style.display = "none";
      loadingConversations = false;
    }
  }

  const conversationsListEl = document.getElementById("conversationsList");

  conversationsListEl.addEventListener("scroll", async () => {
    if (loadingConversations) return;

    const scrollBottom =
      conversationsListEl.scrollTop + conversationsListEl.clientHeight;
    const nearBottom = scrollBottom >= conversationsListEl.scrollHeight - 10;

    if (nearBottom && currentConvPage < totalConvPages) {
      currentConvPage++;
      await loadConversations(currentConvPage);
    }
  });

  function renderConversations() {
    conversationsList.innerHTML = "";

    conversations.sort((a, b) => {
      const aTime = a.lastMessage
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const bTime = b.lastMessage
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;
      return bTime - aTime;
    });

    conversations.forEach((c) => {
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
        openConversation(c);
        if (window.innerWidth <= 768) showChatPanel();
      });

      conversationsList.appendChild(li);
    });

    conversationsList.scrollTop = 0;
  }

  function conversationTitleFromMembers(members) {
    if (!members || members.length !== 2) return;
    const other = members.find((m) => m.user.id !== currentUser.id);
    return (
      other?.user.displayName ||
      other?.user.username ||
      `User ${other?.user.id}`
    );
  }

  // converstaion details
  const convCount = document.getElementById("convCount");
  const groupInfoModal = document.getElementById("groupInfoModal");
  const closeGroupInfo = document.getElementById("closeGroupInfo");
  const groupInfoAvatar = document.getElementById("groupInfoAvatar");
  const groupInfoName = document.getElementById("groupInfoName");
  const groupInfoCount = document.getElementById("groupInfoCount");
  const groupMemberList = document.getElementById("groupMemberList");

  async function openConversation(conv) {
    currentConversation = conv;

    const title = conv.isGroup
      ? conv.title || "Group"
      : conversationTitleFromMembers(conv.members);
    convTitle.textContent = title;
    convAvatar.textContent = title.charAt(0).toUpperCase();

    if (conv.isGroup) {
      const totalCount = conv.members?.length || 0;
      convCount.textContent = `${totalCount} member${
        totalCount !== 1 ? "s" : ""
      }`;
      convTitle.onclick = () => openGroupInfo(conv);
    } else {
      convCount.textContent = "";
      convTitle.onclick = null;
    }

    if (socket?.connected) socket.emit("join", { conversationId: conv.id });
    await loadMessages(conv.id);
    if (socket?.connected) socket.emit("markRead", { conversationId: conv.id });
  }

  function openGroupInfo(conv) {
    groupInfoModal.classList.add("active");
    groupInfoAvatar.textContent = conv.title?.charAt(0).toUpperCase() || "G";
    groupInfoName.textContent = conv.title || "Group";
    groupInfoCount.textContent = `${conv.members.length} member${
      conv.members.length !== 1 ? "s" : ""
    }`;

    groupMemberList.innerHTML = conv.members
      .map((m) => {
        const isOwner = m.isOwner === true;
        const name =
          m.user?.displayName || m.user?.username || `User ${m.user?.id}`;
        return `
        <div class="group-member ${isOwner ? "owner" : ""}" data-userid="${
          m.user?.id
        }">
          <div class="group-member-avatar">${name.charAt(0).toUpperCase()}</div>
          <div class="group-member-name">${name}</div>
        </div>
      `;
      })
      .join("");

    document.querySelectorAll(".group-member").forEach((el) => {
      el.addEventListener("click", (e) => {
        const userId = e.currentTarget.dataset.userid;
        if (userId && userId !== localStorage.getItem("userId")) {
          openPrivateChat(userId);
        }
      });
    });
  }

  closeGroupInfo.onclick = () => {
    groupInfoModal.classList.remove("active");
  };

  function openPrivateChat(userId) {
    console.log("Opening private chat with user:", userId);
    socket.emit("createPrivateConversation", { userId }, (response) => {
      if (response?.conversation) {
        groupInfoModal.classList.remove("active");
        openConversation(response.conversation);
      }
    });
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
      showAlert("Create one-to-one failed: " + err.message, "error");
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
      remove.textContent = "x";
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

    if (memberIds.length < 2) {
      showAlert(
        "You must include at least 2 other members (plus yourself) to create a group.",
        "warning"
      );
      return;
    }

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
      showAlert("Could not create group: " + err.message, "error");
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
