const API_BASE = "https://socket-server-ohp4.onrender.com/api/v1";
const SOCKET_URL = "https://socket-server-ohp4.onrender.com";

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
let onlineUsers = new Set();
let lastActiveMap = new Map();

const sendSound = new Audio("/assets/audio/send.mp3");
const receiveSound = new Audio("/assets/audio/receive.mp3");
const typingSound = new Audio("/assets/audio/typing.mp3");

function apiHeaders(withAuth = true) {
  const headers = { "Content-Type": "application/json" };
  if (withAuth && token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function formatTime(iso) {
  try {
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (isToday) {
      return timeStr;
    } else {
      const dateStr = date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });
      return `${dateStr} ${timeStr}`;
    }
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

  const groupInfoModal = document.getElementById("groupInfoModal");
  const closeGroupInfo = document.getElementById("closeGroupInfo");
  const groupInfoAvatar = document.getElementById("groupInfoAvatar");
  const groupInfoName = document.getElementById("groupInfoName");
  const groupInfoCount = document.getElementById("groupInfoCount");
  const groupMemberList = document.getElementById("groupMemberList");
  const groupManage = document.getElementById("groupManage");
  const addMemberSearch = document.getElementById("addMemberSearch");
  const addMemberList = document.getElementById("addMemberList");

  const meSection = document.getElementById("meSection");
  const meDrawer = document.getElementById("meDrawer");
  const drawerOverlay = document.getElementById("drawerOverlay");
  const drawerAvatar = document.getElementById("drawerAvatar");
  const drawerName = document.getElementById("drawerName");
  const drawerUsername = document.getElementById("drawerUsername");
  const drawerLogoutBtn = document.getElementById("drawerLogoutBtn");
  const drawerNewGroup = document.getElementById("drawerNewGroup");


  const suggestedContainer = document.getElementById("suggestedUsersContainer");
  const toggleBtn = document.getElementById("toggleSuggestedBtn");

  if (toggleBtn && suggestedContainer) {
    const saved = localStorage.getItem("suggestedPanelOpen");
    const savedOpen = saved === "true";
    const shouldBeOpen = savedOpen;

    suggestedContainer.classList.toggle("active", shouldBeOpen);
    toggleBtn.innerHTML = shouldBeOpen
      ? '<i class="fas fa-user-minus"></i>'
      : '<i class="fas fa-user-plus"></i>';

    toggleBtn.addEventListener("click", () => {
      const willBeOpen = !suggestedContainer.classList.contains("active");
      suggestedContainer.classList.toggle("active", willBeOpen);
      toggleBtn.innerHTML = willBeOpen
        ? '<i class="fas fa-user-minus"></i>'
        : '<i class="fas fa-user-plus"></i>';

      localStorage.setItem("suggestedPanelOpen", willBeOpen);
    });

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const savedOpen = localStorage.getItem("suggestedPanelOpen") === "true";
        suggestedContainer.classList.toggle("active", savedOpen);
        toggleBtn.innerHTML = savedOpen
          ? '<i class="fas fa-user-minus"></i>'
          : '<i class="fas fa-user-plus"></i>';
      }, 150);
    });

    window.addEventListener("resize", () => {
      const chatInput = document.querySelector(".chat-input");
      if (window.visualViewport) {
        const offset = window.innerHeight - window.visualViewport.height;
        chatInput.style.bottom = offset > 0 ? `${offset}px` : "0";
      }
    });

    window.addEventListener('resize', () => {
      const view = document.querySelector('.auth-view');
      if (window.visualViewport) {
        const offset = window.innerHeight - window.visualViewport.height;
        view.style.paddingBottom = offset > 0 ? `${offset + 20}px` : '1rem';
      }
    });
  }

  document.getElementById("openSidebarBtn")?.addEventListener("click", () => {
    document.querySelector(".sidebar").classList.add("active");
    document.getElementById("sidebarOverlay").classList.add("active");
  });

  document.getElementById("sidebarOverlay").addEventListener("click", () => {
    document.querySelector(".sidebar").classList.remove("active");
    document.getElementById("sidebarOverlay").classList.remove("active");
  });

  document.getElementById("backBtn").addEventListener("click", () => {
    document.querySelector(".chat-panel").classList.remove("active");
    document.querySelector(".sidebar").classList.add("active");
    document.getElementById("sidebarOverlay").classList.add("active");
  });

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

  function showAlert(message, type = "info") {
    Swal.fire({
      icon: type,
      text: message,
      confirmButtonText: "OK",
    });
  }

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

  // Check field availability
  async function checkAvailability(field, value, msgElem) {
    if (!value) {
      msgElem.textContent = "";
      msgElem.style.color = "";
      return true;
    }

    try {
      const res = await fetch(
        `${API_BASE}/auth/check?field=${field}&value=${encodeURIComponent(value)}`
      );
      const data = await res.json();

      const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);

      if (data.available) {
        msgElem.textContent = `${fieldLabel} available`;
        msgElem.style.color = "green";
        return true;
      } else {
        msgElem.textContent = `${fieldLabel} already in use`;
        msgElem.style.color = "red";
        return false;
      }
    } catch (err) {
      console.error(err);
      msgElem.textContent = "";
      return false;
    }
  }

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

  function updateSubmitState() {
    submitBtn.disabled = !(usernameValid && emailValid && passwordMatchValid);
  }

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
    backBtn.style.display = "inline-flex";
    history.pushState({ chatOpen: true }, "");
  }

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
    history.back();
    document.querySelector('.chat-panel').classList.remove('active');
  });

  // Handle browser back button
  window.addEventListener('popstate', (event) => {
    if (document.querySelector(".chat-panel").classList.contains("active")) {
      backBtn.click();
    } else if (event.state && event.state.chatOpen) {
      history.pushState({ chatOpen: true }, "");
    }
  });

  const header = document.querySelector(".chat-header-title");

  if (header) {
    header.addEventListener("click", () => {
      const convMembers = document.getElementById("convMembers");
      if (currentConversation && convMembers) {
        convMembers.classList.toggle("hidden");
      }
    });
  }

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

    socket.on("message edited", (updated) => {
      const el = chatbox.querySelector(`[data-msg-id="${updated.id}"]`);
      if (el) {
        const text = el.querySelector(".text");
        text.textContent = updated.content;
        const time = el.querySelector(".timestamp");
        time.textContent = formatTime(updated.updatedAt || updated.createdAt) + " (edited)";
      }
    });

    socket.on("message deleted", (id) => {
      const el = chatbox.querySelector(`[data-msg-id="${id}"]`);
      if (el) {
        updateDeletedMessage(el);
      }
    });

    socket.on("typing", ({ conversationId, username }) => {
      if (
        currentConversation &&
        Number(conversationId) === Number(currentConversation.id)
      ) {
        showTyping(typingIndicator, `${username} is typing...`);
        const now = Date.now();
        if (now - lastTypingEmit > 1000) {
          typingSound.currentTime = 0;
          typingSound.play().catch(() => { });
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

    socket.on("users online", (ids) => {
      onlineUsers = new Set(ids);
      updateOnlineStatuses();
      updateConvStatus();
    });

    socket.on("user online", ({ userId }) => {
      onlineUsers.add(userId);
      updateOnlineStatuses();
      updateConvStatus();
    });

    socket.on("user offline", async ({ userId }) => {
      onlineUsers.delete(userId);
      updateOnlineStatuses();
      await handleUserOffline(userId);
      updateConvStatus();
    });
  }

  async function handleUserOffline(userId) {
    if (currentConversation && !currentConversation.isGroup) {
      const other = currentConversation.members.find(m => m.user.id !== currentUser.id);
      if (other && other.user.id === userId) {
        try {
          const res = await fetch(`${API_BASE}/conversations/users/${userId}`, {
            headers: apiHeaders(true),
          });
          if (res.ok) {
            const fullUser = await res.json();
            lastActiveMap.set(userId, fullUser.lastActive);
          }
        } catch (err) {
          console.error("Failed to fetch last active:", err);
        }
      }
    }
  }

  function updateOnlineStatuses() {
    document.querySelectorAll("[data-userid]").forEach((el) => {
      const userId = Number(el.dataset.userid);
      el.classList.toggle("online", onlineUsers.has(userId));
    });
  }

  function updateConvStatus() {
    if (!currentConversation || !convCount) return;

    if (currentConversation.isGroup) {
      const total = currentConversation.members.length;
      const onlineCount = currentConversation.members.filter(m => onlineUsers.has(m.user.id)).length;
      convCount.textContent = `${total} member${total > 1 ? 's' : ''}, ${onlineCount} online`;
    } else {
      const other = currentConversation.members.find(m => m.user.id !== currentUser.id);
      if (other) {
        const id = other.user.id;
        if (onlineUsers.has(id)) {
          convCount.textContent = "Online";
        } else {
          const lastActive = lastActiveMap.get(id);
          convCount.textContent = lastActive ? `Last seen ${formatTime(lastActive)}` : "Offline";
        }
      } else {
        convCount.textContent = "";
      }
    }
  }

  function appendSystemMessage(text) {
    const el = document.createElement("div");
    el.className = "system";
    el.textContent = text;
    chatbox.appendChild(el);
    scrollToBottom(chatbox);
  }

  async function initAfterAuth() {
    const user = JSON.parse(localStorage.getItem("user")) || null;
    if (!token || !user) return;

    showMainView();

    const displayName = user.displayName || user.username;
    meDisplay.textContent = displayName;

    const meAvatar = document.getElementById("meAvatar");
    if (meAvatar) {
      meAvatar.textContent = displayName.charAt(0).toUpperCase();
    }

    // Drawer
    drawerAvatar.textContent = displayName.charAt(0).toUpperCase();
    drawerName.textContent = displayName;
    drawerUsername.textContent = `@${user.username}`;

    const drawerEmail = document.getElementById("drawerEmail");
    if (drawerEmail) {
      drawerEmail.textContent = user.email || "";
    }

    connectSocket();
    await loadConversations();
    await loadSuggestedUsers();

    if (!conversations || conversations.length === 0) {
      showConversationList();
      document.querySelector('.chat-panel').style.display = "none";
    } else if (window.innerWidth > 768) {
      openConversation(conversations[0]);
    }

    if (meSection && meDrawer && drawerOverlay && drawerLogoutBtn) {
      meSection.addEventListener("click", () => {
        meDrawer.classList.add("open");
        drawerOverlay.classList.add("open");
      });

      drawerOverlay.addEventListener("click", () => {
        meDrawer.classList.remove("open");
        drawerOverlay.classList.remove("open");
      });

      drawerLogoutBtn.addEventListener("click", () => {
        clearAuth();
        if (socket) socket.disconnect();
        location.reload();
      });
    } else {
      console.warn("Drawer elements not found, skipping drawer initialization");
    }
  }



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
        sendSound.play().catch(() => { });
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
        sendSound.play().catch(() => { });
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
    el.className = `message ${msg.senderId === currentUser.id ? "right" : "left"
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
    const isEdited = msg.updatedAt && new Date(msg.updatedAt) > new Date(msg.createdAt);
    timeSpan.textContent = formatTime(msg.createdAt) + (isEdited ? " (edited)" : "");

    bubble.appendChild(textSpan);
    bubble.appendChild(timeSpan);

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = name.charAt(0).toUpperCase();
    el.appendChild(avatar);
    el.appendChild(bubble);

    if (msg.senderId === currentUser.id) {
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
      editBtn.onclick = () => editMessage(msg.id, bubble);
      el.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      deleteBtn.onclick = () => deleteMessage(msg.id, el);
      el.appendChild(deleteBtn);
    }

    if (optimistic) el.style.opacity = "0.7";
    chatbox.appendChild(el);
    scrollToBottom(chatbox);
  }

  async function editMessage(id, bubbleEl) {
    const textEl = bubbleEl.querySelector(".text");
    const original = textEl.textContent.trim();

    textEl.innerHTML = `<textarea class="edit-message-input">${original}</textarea>`;
    const textarea = textEl.querySelector(".edit-message-input");

    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";

    textarea.focus();

    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    });

    textarea.addEventListener("blur", async () => {
      const newContent = textarea.value.trim();
      if (newContent === original) {
        textEl.textContent = original;
        return;
      }

      try {
        if (socket.connected) {
          socket.emit("edit message", { messageId: id, content: newContent }, (ack) => {
            if (ack.success) {
              textEl.textContent = newContent;
            } else {
              textEl.textContent = original;
              showAlert(ack.error, "error");
            }
          });
        } else {
          const res = await fetch(`${API_BASE}/conversations/messages/${id}`, {
            method: "PUT",
            headers: apiHeaders(true),
            body: JSON.stringify({ content: newContent }),
          });

          if (res.ok) {
            textEl.textContent = newContent;
          } else {
            textEl.textContent = original;
            showAlert("Edit failed", "error");
          }
        }
      } catch (e) {
        console.error("Edit error:", e);
        textEl.textContent = original;
        showAlert("Edit failed", "error");
      }
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        textarea.blur();
      }
      if (e.key === "Escape") {
        textEl.textContent = original;
      }
    });
  }


  function deleteMessage(id, msgEl) {
    Swal.fire({
      title: "Delete message?",
      text: "This will delete the message for everyone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete",
    }).then((result) => {
      if (result.isConfirmed) {
        if (socket.connected) {
          socket.emit("delete message", { messageId: id }, (ack) => {
            if (ack.success) {
              updateDeletedMessage(msgEl);
            } else {
              showAlert(ack.error || "Delete failed", "error");
            }
          });
        } else {
          fetch(`${API_BASE}/conversations/messages/${id}`, {
            method: "DELETE",
            headers: apiHeaders(true),
          })
            .then((res) => {
              if (res.ok) {
                updateDeletedMessage(msgEl);
              } else {
                showAlert("Delete failed", "error");
              }
            })
            .catch(() => showAlert("Delete failed", "error"));
        }
      }
    });
  }

  function updateDeletedMessage(el) {
    const text = el.querySelector(".text");
    text.textContent = "This message was deleted";
    text.style.fontStyle = "italic";
    text.style.color = "#8e8e93";
    const time = el.querySelector(".timestamp");
    time.textContent += " (deleted)";
    el.querySelector(".edit-btn")?.remove();
    el.querySelector(".delete-btn")?.remove();
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
      receiveSound.play().catch(() => { });
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
      li.className = `conversation-item${currentConversation && currentConversation.id === c.id ? " active" : ""
        }`;

      const title = c.isGroup
        ? c.title || "Untitled Group"
        : conversationTitleFromMembers(c.members);

      const preview = c.lastMessage?.content
        ? c.lastMessage.content.slice(0, 50) + "..."
        : "";

      const time = c.lastMessage ? formatTime(c.lastMessage.createdAt) : "";

      if (!c.isGroup) {
        const other = c.members.find((m) => m.user.id !== currentUser.id);
        li.dataset.userid = other?.user.id;
      }

      li.innerHTML = `
      <div class="conv-avatar">${title.charAt(0).toUpperCase()}</div>
      <div class="conv-info">
        <div class="conv-title">${title}</div>
        <div class="conv-meta">
          <span class="preview">${preview}</span>
          <span class="time">${time}</span>
        </div>
      </div>
    `;

      li.addEventListener("click", () => {
        openConversation(c);
        if (window.innerWidth <= 768) showChatPanel();
      });

      conversationsList.appendChild(li);
    });

    conversationsList.scrollTop = 0;
    updateOnlineStatuses();
  }

  function conversationTitleFromMembers(members) {
    if (!members || members.length !== 2) return;

    const other = members.find((m) => m.user && m.user.id !== currentUser.id);

    if (!other) return "Unknown User";

    return (
      other.user.displayName || other.user.username || `User ${other.user.id}`
    );
  }

  const convCount = document.getElementById("convCount");

  async function openConversation(conv) {
    currentConversation = conv;

    if (chatbox) chatbox.innerHTML = "";

    renderConversations();

    const title = conv.isGroup
      ? conv.title || "Group"
      : conversationTitleFromMembers(conv.members);
    convTitle.textContent = title;
    convAvatar.textContent = title.charAt(0).toUpperCase();

    if (conv.isGroup) {
      convTitle.onclick = () => openGroupInfo(conv);
    } else {
      convTitle.onclick = null;
    }

    if (socket?.connected) socket.emit("join", { conversationId: conv.id });

    await loadMessages(conv.id);

    if (socket?.connected) socket.emit("markRead", { conversationId: conv.id });

    if (!conv.isGroup) {
      const other = conv.members.find((m) => m.user.id !== currentUser.id);
      if (other && !lastActiveMap.has(other.user.id)) {
        try {
          const res = await fetch(`${API_BASE}/conversations/user/${other.user.id}`, {
            headers: apiHeaders(true),
          });
          if (res.ok) {
            const fullUser = await res.json();
            lastActiveMap.set(other.user.id, fullUser.data.lastActive);
          }
        } catch (err) {
          console.error("Failed to fetch user last active:", err);
        }
      }
    }

    const chatPanel = document.querySelector(".chat-panel");
    chatPanel.classList.add("active");

    if (window.innerWidth > 768) {
      chatPanel.style.display = "flex";
    }

    updateConvStatus();
  }

  async function refreshConversation(id) {
    try {
      const res = await fetch(`${API_BASE}/conversations/${id}`, {
        headers: apiHeaders(true),
      });
      if (!res.ok) throw new Error("Failed to refresh conversation");
      const updated = await res.json();
      const index = conversations.findIndex((c) => c.id === id);
      if (index > -1) conversations[index] = updated;
      currentConversation = updated;
      renderConversations();
      openGroupInfo(updated);
    } catch (err) {
      console.error("refreshConversation", err);
      showAlert("Failed to refresh group", "error");
    }
  }

  function openGroupInfo(conv) {
    groupInfoModal.classList.add("active");
    document.querySelector('.chat-panel').classList.add('group-modal-open');
    groupInfoAvatar.textContent = conv.title?.charAt(0).toUpperCase() || "G";
    groupInfoName.textContent = conv.title || "Group";
    groupInfoCount.textContent = `${conv.members.length} member${conv.members.length !== 1 ? "s" : ""}`;

    const isOwner = conv.members.find(m => m.user.id === currentUser.id)?.role === "OWNER";

    groupManage.style.display = isOwner ? "block" : "none";
    editGroupTitleBtn.style.display = isOwner ? "inline-block" : "none";

    editGroupTitleBtn.onclick = () => {
      groupInfoName.contentEditable = true;
      groupInfoName.focus();
      editGroupTitleBtn.style.display = "none";
      saveGroupTitleBtn.style.display = "inline-block";
    };

    saveGroupTitleBtn.onclick = async () => {
      const newTitle = groupInfoName.textContent.trim();
      if (!newTitle) {
        showAlert("Title cannot be empty", "error");
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/conversations/group/${conv.id}/title`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...apiHeaders(true),
          },
          body: JSON.stringify({ title: newTitle }),
        });
        if (!res.ok) throw new Error("Failed to update group title");
        const data = await res.json();
        groupInfoName.textContent = data.group.title;
        showAlert("Group title updated", "success");
        groupInfoName.contentEditable = false;
        editGroupTitleBtn.style.display = "inline-block";
        saveGroupTitleBtn.style.display = "none";
        currentConversation.title = data.group.title;
      } catch (err) {
        console.error(err);
        showAlert("Failed to update title", "error");
      }
    };

    groupMemberList.innerHTML = conv.members.map(m => {
      const user = m.user;
      if (!user) return "";
      const userId = user.id;
      const displayName = user.displayName || user.username || `User ${userId}`;
      const avatarLetter = displayName.charAt(0).toUpperCase();
      const isMemberOwner = m.role === "OWNER";
      const isYou = userId === currentUser.id;
      let html = `
      <div class="group-member ${isMemberOwner ? "owner" : ""} ${isYou ? "you" : ""}" data-userid="${userId}">
        <div class="group-member-avatar">${avatarLetter}</div>
        <div class="group-member-info">
          <div class="group-member-name">
            ${displayName}${isMemberOwner ? '<span class="owner-badge">👑 Owner</span>' : ""}
          </div>
          ${isYou ? '<span class="you-label">(You)</span>' : ""}
        </div>
    `;
      if (isOwner && !isYou && !isMemberOwner) {
        html += `<button class="remove-member-btn">Remove</button>`;
      }
      html += `</div>`;
      return html;
    }).join("");

    document.querySelectorAll(".group-member").forEach(el => {
      el.querySelector(".remove-member-btn")?.addEventListener("click", async () => {
        const confirmResult = await Swal.fire({
          title: "Remove Member?",
          text: "Are you sure you want to remove this member from the group?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonColor: "#d33",
          cancelButtonColor: "#3085d6",
          confirmButtonText: "Yes, remove",
          cancelButtonText: "Cancel",
        });
        if (confirmResult.isConfirmed) {
          const userId = el.dataset.userid;
          try {
            const res = await fetch(`${API_BASE}/conversations/${conv.id}/members/${userId}`, {
              method: "DELETE",
              headers: apiHeaders(true),
            });
            if (res.ok) {
              await Swal.fire({
                title: "Removed!",
                text: "The member has been removed successfully.",
                icon: "success",
                timer: 500,
                showConfirmButton: false,
              });
              await refreshConversation(conv.id);
            } else {
              Swal.fire({ title: "Error", text: "Failed to remove member.", icon: "error" });
            }
          } catch (err) {
            console.error(err);
            Swal.fire({ title: "Error", text: "An unexpected error occurred.", icon: "error" });
          }
        }
      });

      el.addEventListener("click", async (e) => {
        if (e.target.classList.contains("remove-member-btn")) return;
        const userId = el.dataset.userid;
        if (userId && userId !== currentUser.id) {
          await openOrCreatePrivateChat(userId);
          groupInfoModal.classList.remove("active");
        }
      });
    });

    addMemberSearch.value = "";
    addMemberList.innerHTML = "";
    addMemberSearch.addEventListener("input", debounce(async () => {
      const query = addMemberSearch.value.trim();
      if (!query) {
        addMemberList.innerHTML = "";
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/conversations/users/search?query=${encodeURIComponent(query)}`, {
          headers: apiHeaders(true),
        });
        if (!res.ok) throw new Error("Search failed");
        const users = await res.json();
        const currentIds = currentConversation.members.map(m => m.user.id);
        const filtered = users.users.filter(u => !currentIds.includes(u.id));
        addMemberList.innerHTML = "";
        filtered.forEach(u => {
          const li = document.createElement("li");
          li.className = "add-member-item";
          li.dataset.userid = u.id;
          li.innerHTML = `
          <div class="user-avatar">${(u.displayName || u.username).charAt(0).toUpperCase()}</div>
          <div class="user-info">
            <div class="user-name">${u.displayName || u.username} <small>@${u.username}</small></div>
          </div>
          <button class="add-member-btn" title="Add to group"><i class="fas fa-plus"></i></button>
        `;
          const btn = li.querySelector(".add-member-btn");
          const clickHandler = async () => {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
            await addGroupMember(currentConversation.id, u.id);
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-plus"></i>`;
          };
          li.addEventListener("click", clickHandler);
          btn.addEventListener("click", e => { e.stopPropagation(); clickHandler(); });
          addMemberList.appendChild(li);
        });
      } catch (err) {
        console.error("Add-member search error:", err);
        showAlert("Search failed", "error");
      }
    }, 400));

    updateOnlineStatuses();
  }


  async function addGroupMember(conversationId, userIdToAdd) {
    const convId = Number(conversationId);
    const userId = Number(userIdToAdd);

    if (isNaN(convId) || convId <= 0) return showAlert("Invalid group", "error");
    if (isNaN(userId) || userId <= 0) return showAlert("Invalid user", "error");

    try {
      const res = await fetch(`${API_BASE}/conversations/${convId}/members`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ userId }),
      });

      let errorMsg = "Could not add member";
      if (!res.ok) {
        let detail = "";
        try { const err = await res.json(); detail = err.error || ""; } catch { detail = await res.text(); }
        switch (res.status) {
          case 400: errorMsg = detail || "Invalid request"; break;
          case 401: errorMsg = "Please log in again"; break;
          case 403: errorMsg = "Only owner can add members"; break;
          case 404: errorMsg = "Group not found"; break;
          case 500: errorMsg = "Server error"; break;
          default: errorMsg = detail || `Error ${res.status}`;
        }
        return showAlert(errorMsg, "error");
      }

      const data = await res.json();

      const idx = conversations.findIndex(c => c.id === convId);
      if (idx !== -1) {
        conversations[idx] = data.conversation;
        renderConversations();
      }

      if (currentConversation?.id === convId) openConversation(data.conversation);

      showAlert("Member added!", "success");

    } catch (err) {
      console.error("addGroupMember:", err);
      showAlert("Network error. Check connection.", "error");
    }
  }

  closeGroupInfo.onclick = () => {
    groupInfoModal.classList.remove("active");
    document.querySelector('.chat-panel').classList.remove('group-modal-open');
    groupInfoName.contentEditable = false;
    editGroupTitleBtn.style.display = "none";
    saveGroupTitleBtn.style.display = "none";
  };


  async function openOrCreatePrivateChat(otherUserId) {
    if (!otherUserId || (typeof otherUserId !== 'string' && typeof otherUserId !== 'number')) {
      showAlert("Invalid user ID", "error");
      console.warn("openOrCreatePrivateChat: Invalid otherUserId", otherUserId);
      return;
    }

    const userIdNum = parseInt(otherUserId, 10);
    if (isNaN(userIdNum) || userIdNum <= 0) {
      showAlert("Invalid user ID", "error");
      console.warn("openOrCreatePrivateChat: Invalid number", otherUserId);
      return;
    }

    if (userIdNum === currentUser.id) {
      return;
    }

    const existingConv = conversations.find(
      (c) =>
        !c.isGroup &&
        c.members.some((m) => parseInt(m.user.id) === userIdNum)
    );

    if (existingConv) {
      console.log("Opening existing chat:", existingConv.id);
      openConversation(existingConv);
      return;
    }

    const loadingAlert = Swal.fire({
      title: "Creating chat...",
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const res = await fetch(`${API_BASE}/conversations/one-to-one`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({
          otherUserId: userIdNum
        }),
      });

      loadingAlert.close();

      if (!res.ok) {
        let errorMessage = "Could not create chat";

        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorData.error || `Error ${res.status}`;
        } catch {
          errorMessage = `Server error (${res.status})`;
        }

        console.error(`API Error ${res.status}:`, errorMessage);
        showAlert(errorMessage, "error");
        return;
      }

      const newConv = await res.json();

      if (!newConv?.id) {
        console.error("Invalid conversation response:", newConv);
        showAlert("Chat created but failed to load", "error");
        return;
      }

      conversations.unshift(newConv);
      renderConversations();
      openConversation(newConv);

      console.log("New private chat created:", newConv.id);

      Swal.fire({
        icon: "success",
        title: "Chat created!",
        text: "Start messaging now",
        timer: 500,
        showConfirmButton: false
      });

    } catch (err) {
      loadingAlert.close();

      console.error("openOrCreatePrivateChat error:", err);

      let userMessage = "Could not create chat";
      if (err.name === "TypeError" && err.message.includes("fetch")) {
        userMessage = "No internet connection";
      } else if (err.message.includes("Failed to fetch")) {
        userMessage = "Network error. Check your connection.";
      }

      showAlert(userMessage, "error");
    }
  }


  function openGroupChat(groupId) {
    if (!groupId || (typeof groupId !== "string" && typeof groupId !== "number")) {
      showAlert("Invalid group ID", "error");
      console.warn("openGroupChat: Invalid groupId", groupId);
      return;
    }

    const groupIdNum = parseInt(groupId, 10);
    if (isNaN(groupIdNum) || groupIdNum <= 0) {
      showAlert("Invalid group ID", "error");
      console.warn("openGroupChat: Invalid number", groupId);
      return;
    }

    const groupConv = conversations.find(
      (c) => c.isGroup && c.id === groupIdNum
    );

    if (!groupConv) {
      showAlert("Group conversation not found", "error");
      console.warn("Group conversation not found for ID:", groupIdNum);
      return;
    }

    openConversation(groupConv);
  }


  async function loadMessages(conversationId, limit = 100, cursor) {
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

  searchUsersInput?.addEventListener(
    "input",
    debounce(async () => {
      const query = searchUsersInput.value.trim();
      if (!query) {
        searchedUsersList.innerHTML = "";
        return;
      }

      try {
        const res = await fetch(
          `${API_BASE}/conversations/users/search?query=${encodeURIComponent(query)}`,
          { headers: apiHeaders(true) }
        );

        if (!res.ok) throw new Error("Search failed");

        const data = await res.json();
        searchedUsersList.innerHTML = "";

        data.users.forEach((user) => {
          const li = document.createElement("li");
          li.className = "search-item user-item";
          li.dataset.userid = user.id;
          li.innerHTML = `
          <div class="user-avatar">${(user.displayName || user.username)
              .charAt(0)
              .toUpperCase()}</div>
          <div class="user-info">
            <div class="user-name">${user.displayName || user.username}</div>
            <div class="user-sub">@${user.username}</div>
          </div>
        `;
          li.addEventListener("click", async () => {
            await openOrCreatePrivateChat(user.id);
            searchedUsersList.innerHTML = "";
            searchUsersInput.value = "";
            if (window.innerWidth <= 768) showChatPanel();
          });
          searchedUsersList.appendChild(li);
        });

        data.groups.forEach((group) => {
          const li = document.createElement("li");
          li.className = "search-item group-item";
          li.dataset.groupid = group.id;
          li.innerHTML = `
          <div class="user-avatar">G</div>
          <div class="user-info">
            <div class="user-name">${group.title}</div>
            <div class="user-sub">Group Chat</div>
          </div>
        `;
          li.addEventListener("click", async () => {
            await openGroupChat(group.id);
            searchedUsersList.innerHTML = "";
            searchUsersInput.value = "";
            if (window.innerWidth <= 768) showChatPanel();
          });
          searchedUsersList.appendChild(li);
        });

        updateOnlineStatuses();
      } catch (err) {
        console.error("Search failed", err);
      }
    }, 400)
  );


  openGroupModalBtn?.addEventListener("click", () => {
    groupModal.style.display = "flex";
    selectedGroupMembers = [];
    selectedMembers.innerHTML = "";
    groupMembersList.innerHTML = "";
    groupMemberSearch.value = "";
  });

  drawerNewGroup?.addEventListener("click", () => {
    openGroupModalBtn?.click();
    meDrawer?.classList.remove("open");
    drawerOverlay?.classList.remove("open");
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
          li.innerHTML = `
            <div class="user-avatar">${(user.displayName || user.username)
              .charAt(0)
              .toUpperCase()}</div>
            <div class="user-info">
              <div class="user-name">${user.displayName || user.username
            } (@${user.username})</div>
            </div>
          `;
          li.dataset.userid = user.id;
          li.addEventListener("click", () => {
            selectedGroupMembers.push(user);
            renderSelectedMembers();
            groupMembersList.innerHTML = "";
            groupMemberSearch.value = "";
          });
          groupMembersList.appendChild(li);
        });
        updateOnlineStatuses();
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

  async function loadSuggestedUsers() {
    try {
      const res = await fetch(`${API_BASE}/conversations/users/suggested`, {
        headers: apiHeaders(true),
      });

      if (!res.ok) throw new Error("Failed to fetch suggested users");
      const users = await res.json();

      const existingUserIds = conversations.flatMap((c) =>
        c.members.map((m) => m.user.id)
      );
      const filteredUsers = users.filter(
        (u) => !existingUserIds.includes(u.id)
      );

      const suggestedList = document.getElementById("suggestedUsersList");
      suggestedList.innerHTML = "";

      filteredUsers.forEach((user) => {
        const li = document.createElement("li");
        li.classList.add("suggested-user-item");
        li.dataset.userid = user.id;

        li.innerHTML = `
          <div class="conv-avatar">
            ${(user.displayName || user.username).charAt(0).toUpperCase()}
          </div>
          <span>${user.displayName ? `${user.displayName} (@${user.username})` : user.username}</span>
        `;


        li.addEventListener("click", async () => {
          await openOrCreatePrivateChat(user.id);
          document.getElementById("suggestedUsersContainer").style.display =
            "none";
        });

        suggestedList.appendChild(li);
      });

      document.getElementById("suggestedUsersContainer").style.display =
        filteredUsers.length > 0 ? "block" : "none";
      updateOnlineStatuses();
    } catch (err) {
      console.error("loadSuggestedUsers:", err);
    }
  }

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

  let originalHeight = window.innerHeight;
  window.addEventListener('resize', () => {
    if (window.innerHeight < originalHeight) {
      chatbox.style.paddingBottom = '0';
      scrollToBottom(chatbox);
    } else {
      originalHeight = window.innerHeight;
    }
  });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.log("Service Worker failed:", err));
  });
}