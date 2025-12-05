const API_BASE = "https://socket-server-ohp4.onrender.com/api/v1";
const token = localStorage.getItem("token");
const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

if (!token || !currentUser.id) {
    window.location.href = "/index.html";
}
const sendSound = new Audio("/assets/audio/send.mp3");
const likeSound = new Audio("/assets/audio/like.mp3");
const commentSound = new Audio("/assets/audio/comment.mp3");

let editingPostId = null;
let storyGroups = [];
let currentGroupIndex = -1;
let currentStoryIndex = -1;
let editingCommentId = null;


document.addEventListener("DOMContentLoaded", () => {
    const avatarEl = document.getElementById("userAvatar");
    const displayNameEl = document.getElementById("userDisplayName");

    const userInitial = (currentUser.displayName || currentUser.username || "U")[0].toUpperCase();
    avatarEl.textContent = userInitial;
    displayNameEl.textContent = currentUser.displayName || currentUser.username || "User";


    document.getElementById("goMessenger").onclick = () => {
        window.location.href = "/index.html";
    };

    document.getElementById("submitPost").onclick = createPost;
    document.getElementById("addStoryBtn").onclick = openAddStory;

    const toggleSearchBtn = document.getElementById("toggleSearchBtn");
    const searchInput = document.getElementById("postSearchInput");

    toggleSearchBtn.onclick = () => {
        searchInput.classList.toggle("active");
        if (searchInput.classList.contains("active")) {
            searchInput.focus();
            displayNameEl.style.display = "none";
        } else {
            searchInput.value = "";
            displayNameEl.style.display = "inline";
            loadPosts("", true);
        }
    };

    searchInput.addEventListener("focus", () => {
        displayNameEl.style.display = "none";
    });

    searchInput.addEventListener("blur", () => {
        if (!searchInput.classList.contains("active")) {
            displayNameEl.style.display = "inline";
        }
    });

    let typingTimer;
    const typingDelay = 500;

    searchInput.addEventListener("input", () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            loadPosts(searchInput.value.trim(), true);
        }, typingDelay);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            clearTimeout(typingTimer);
            loadPosts(searchInput.value.trim(), true);
        }
    });

    document.getElementById("imageModal").onclick = (e) => {
        if (e.target === document.getElementById("imageModal") || e.target.classList.contains("close-modal")) {
            document.getElementById("imageModal").classList.remove("active");
        }
    };

    document.getElementById("storyViewer").onclick = (e) => {
        if (e.target === document.getElementById("storyViewer")) {
            closeStoryViewer();
        }
    };

    loadPosts();
    loadStories();
});


// Infinite scroll
window.addEventListener("scroll", () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000) {
        loadPosts(document.getElementById("postSearchInput").value.trim());
    }
});

function autoResizeTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
}

document.querySelectorAll("#postText, #editText, #editCommentText").forEach(textarea => {
    if (textarea) {
        textarea.addEventListener("input", () => autoResizeTextarea(textarea));
        autoResizeTextarea(textarea);
    }
});

// Media Preview for URL
function setupMediaPreview(inputId, previewId) {
    var input = document.getElementById(inputId);
    var preview = document.getElementById(previewId);

    input.oninput = function (e) {
        var url = e.target.value.trim();
        preview.innerHTML = "";
        if (!url) return;

        var youtubeMatch = url.match(
            /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/
        );
        if (youtubeMatch) {
            var videoId = youtubeMatch[1];
            preview.innerHTML =
                '<iframe width="100%" height="250" ' +
                'src="https://www.youtube.com/embed/' + videoId + '" ' +
                'title="YouTube video player" frameborder="0" ' +
                'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
                'allowfullscreen></iframe>';
            return;
        }

        if (url.match(/\.(jpeg|jpg|gif|png)$/i)) {
            preview.innerHTML = '<img src="' + url + '" alt="Preview" style="width:100%; border-radius:12px;">';
            return;
        }

        if (url.match(/\.(mp4|webm|ogg)$/i)) {
            preview.innerHTML = '<video controls style="width:100%; border-radius:12px;"><source src="' + url + '"></video>';
            return;
        }

        preview.innerHTML = '<img src="' + url + '" alt="Preview" style="width:100%; border-radius:12px;">';
    };
}

setupMediaPreview("mediaUrl", "mediaPreview");
setupMediaPreview("editMediaUrl", "editMediaPreview");
setupMediaPreview("storyMediaUrl", "storyMediaPreview");


// post and comment menu button toggles
document.addEventListener("click", function (e) {
    const btn = e.target;

    if (btn.classList.contains("post-menu-btn") || btn.classList.contains("comment-menu-btn")) {
        const menu = btn.nextElementSibling;

        document.querySelectorAll(".post-menu, .comment-menu").forEach(m => {
            if (m !== menu) m.classList.remove("show");
        });

        menu.classList.toggle("show");
        return;
    }

    if (btn.closest(".post-menu") || btn.closest(".comment-menu")) {
        return;
    }

    document.querySelectorAll(".post-menu, .comment-menu").forEach(m => m.classList.remove("show"));
});


// comment button click handler
document.addEventListener("click", function (e) {
    const btn = e.target.closest(".add-comment button");
    if (!btn) return;

    const textarea = btn.parentElement.querySelector("textarea");
    const postId = textarea.id.split("-")[2];

    createComment(postId);
});

// CREATE POST
async function createPost() {
    const content = document.getElementById("postText").value.trim();
    const media = document.getElementById("mediaUrl").value.trim();

    if (!content && !media) return Swal.fire("Empty", "Write something or add media", "info");

    try {
        const res = await fetch(`${API_BASE}/social/posts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ content, media, visibility: "PUBLIC" })
        });

        if (res.ok) {
            const newPost = await res.json();
            document.getElementById("postText").value = "";
            document.getElementById("mediaUrl").value = "";
            document.getElementById("mediaPreview").innerHTML = "";

            const feed = document.getElementById("postsFeed");
            feed.insertAdjacentHTML("afterbegin", renderPost(newPost));

            sendSound.currentTime = 0;
            sendSound.play().catch(() => { });

            Swal.fire({
                icon: 'success',
                title: 'Success',
                timer: 1500,
                showConfirmButton: false,
                timerProgressBar: false
            });

        } else {
            const err = await res.json();
            Swal.fire("Error", err.error || "Failed", "error");
        }
    } catch (err) {
        console.log(err, "error");
        Swal.fire("Error", "Network error", "error");
    }
}


// Drawer
const userAvatar = document.getElementById("userAvatar");
const rightSidebar = document.getElementById("rightSidebar");
const closeSidebar = document.getElementById("closeSidebar");
const signOutBtn = document.getElementById("signOutBtn");

const user = JSON.parse(localStorage.getItem("user") || "{}");

if (user && user.displayName) {
    const drawerAvatar = document.getElementById("drawerAvatar");
    const drawerDisplayName = document.getElementById("drawerDisplayName");
    const drawerUsername = document.getElementById("drawerUsername");
    const drawerEmail = document.getElementById("drawerEmail");

    drawerAvatar.textContent = user.displayName[0];
    drawerDisplayName.textContent = user.displayName;
    drawerUsername.textContent = `@${user.username}`;
    drawerEmail.textContent = user.email;
}

// Open sidebar
userAvatar.addEventListener("click", () => {
    rightSidebar.classList.add("active");
});

// Close sidebar
closeSidebar.addEventListener("click", () => {
    rightSidebar.classList.remove("active");
});

// Sign out
signOutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/index.html";
});

// Load posts
let isLoading = false;
let hasMore = true;
let currentPage = 1;
const limit = 5;

async function loadPosts(search = "", reset = false) {
    if (isLoading || (!hasMore && !reset)) return;
    isLoading = true;

    if (reset) {
        currentPage = 1;
        hasMore = true;
        document.getElementById("postsFeed").innerHTML = "";
    }

    if (currentPage === 1) {
        document.getElementById("postsFeed").innerHTML = Array(2).fill(0).map(() => `
            <div class="post post-skeleton">
                <div class="post-header">
                    <div class="skeleton circle avatar"></div>
                    <div class="skeleton-lines">
                        <div class="skeleton line"></div>
                        <div class="skeleton line short"></div>
                    </div>
                </div>
                <div class="skeleton media"></div>
                <div class="post-actions-skeleton">
                    <div class="skeleton icon"></div>
                    <div class="skeleton icon"></div>
                    <div class="skeleton icon"></div>
                </div>
            </div>
        `).join("");
    }

    try {
        const query = new URLSearchParams({ page: currentPage, limit });
        if (search) query.append("search", search);

        const res = await fetch(`${API_BASE}/social/posts?${query}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
            localStorage.clear();
            window.location.href = "index.html";
            return;
        }

        const { data } = await res.json();

        if (data.length < limit) hasMore = false;

        const feed = document.getElementById("postsFeed");
        const html = data.map(renderPost).join("");

        if (currentPage === 1) {
            feed.innerHTML = html || "<p style='text-align:center;padding:40px;color:#666'>No posts yet.</p>";
        } else {
            feed.insertAdjacentHTML("beforeend", html);
        }

        currentPage++;
    } catch (err) {
        console.error(err);
        Swal.fire("Error", "Failed to load posts", "error");
    } finally {
        isLoading = false;
    }
}

// Render Post
function renderPost(post) {
    const author = post.author || {
        id: currentUser.id,
        displayName: currentUser.displayName,
        username: currentUser.username
    };
    const name = author.displayName || author.username;
    const isOwnPost = author.id === currentUser.id;
    const hasLiked = post.likes?.some(l => l.userId === currentUser.id);

    let mediaUrls = [];
    if (Array.isArray(post.media)) mediaUrls = post.media;
    else if (typeof post.media === "string" && post.media) mediaUrls = [post.media];

    let mediaHtml = "";
    if (mediaUrls.length === 1) {
        const url = mediaUrls[0].trim();
        const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
        if (youtubeMatch) {
            mediaHtml = `<div class="post-media single"><iframe width="100%" height="250" src="https://www.youtube.com/embed/${youtubeMatch[1]}" frameborder="0" allowfullscreen></iframe></div>`;
        } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
            mediaHtml = `<div class="post-media single"><video controls style="width:100%; border-radius:12px;"><source src="${url}"></video></div>`;
        } else {
            mediaHtml = `<div class="post-media single"><img src="${url}" onclick="openImage('${url}')" style="width:100%; cursor:pointer;" loading="lazy"></div>`;
        }
    } else if (mediaUrls.length > 1) {
        mediaHtml = `<div class="post-media grid">${mediaUrls.map(url => {
            const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
            if (yt) return `<div class="grid-item"><iframe width="100%" height="150" src="https://www.youtube.com/embed/${yt[1]}" frameborder="0" allowfullscreen></iframe></div>`;
            if (url.match(/\.(mp4|webm|ogg)$/i)) return `<div class="grid-item"><video controls><source src="${url}"></video></div>`;
            return `<div class="grid-item"><img src="${url}" onclick="openImage('${url}')" loading="lazy"></div>`;
        }).join("")}</div>`;
    }

    const menuHtml = isOwnPost ? `
        <button class="post-menu-btn">...</button>
        <div class="post-menu">
            <button onclick="editPost(${post.id}, '${escapeJs(post.content || "")}', '${mediaUrls.join(',') || ""}')">Edit Post</button>
        </div>` : "";

    const commentsHtml = (post.comments || []).map(renderComment).join("");
    const viewMore = post.comments?.length >= 2 ? `<div class="view-more-comments" onclick="loadFullComments(${post.id})">View more comments</div>` : "";

    return `
        <article class="post" id="post-${post.id}">
            <div class="post-header">
                <div class="post-avatar">${name[0].toUpperCase()}</div>
                <div style="flex:1">
                    <div class="post-author-name">${name}</div>
                    <div class="post-time">${formatTime(post.createdAt)}</div>
                </div>
                ${menuHtml}
            </div>
            ${post.content ? `<div class="post-content">${escapeHtml(post.content)}</div>` : ""}
            ${mediaHtml}
            <div class="post-stats">
                <span>${post.likes?.length || 0} likes</span> · <span id="comment-count-${post.id}">${post.comments?.length || 0} comments</span>
            </div>
            <div class="post-actions">
                <button class="action-btn ${hasLiked ? 'liked' : ''}" onclick="toggleLike(${post.id}, 'post')">
                    <i class="fa${hasLiked ? 's' : 'r'} fa-heart"></i> Like
                </button>
                <button class="action-btn" onclick="focusComment(${post.id})">Comment</button>
                <button class="action-btn">Share</button>
            </div>
            <div class="comments-section" id="comments-${post.id}">
                ${commentsHtml}
                ${viewMore}
                <div class="add-comment">
                    <textarea id="comment-text-${post.id}" placeholder="Write a comment..." onkeypress="handleCommentKeypress(event, ${post.id})"></textarea>
                    <button onclick="createComment(${post.id})"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        </article>`;
}

// Render Comment
function renderComment(comment) {
    const author = comment.author;
    const name = author.displayName || author.username;
    const isOwnComment = author.id === currentUser.id;
    const hasLiked = comment.likes?.some(l => l.userId === currentUser.id);

    const menuHtml = isOwnComment ? `
    <button class="comment-menu-btn">⋮</button>
    <div class="comment-menu">
        <button onclick="editComment(${comment.id}, '${escapeJs(comment.content)}')">Edit Comment</button>
    </div>
    ` : "";

    return `
        <div class="comment" id="comment-${comment.id}">
            <div class="comment-avatar">${name[0].toUpperCase()}</div>
            <div class="comment-body">
                <div class="comment-author">${name}</div>
                <div class="comment-text">${escapeHtml(comment.content)}</div>

                <div class="comment-actions">
                    <button 
                        class="comment-like-btn ${hasLiked ? 'liked' : ''}"
                        onclick="toggleLike(${comment.id}, 'comment')"
                    >
                        <i class="${hasLiked ? 'fas fa-heart' : 'far fa-heart'}"></i>
                        <span class="comment-like-count">(${comment.likes?.length || 0})</span>
                    </button>

                    <span>${formatTime(comment.createdAt)}</span>
                </div>
            </div>
            ${menuHtml}
        </div>
    `;
}


// Load full comments
async function loadFullComments(postId) {
    try {
        const res = await fetch(`${API_BASE}/social/posts/${postId}/comments?limit=100`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const { data } = await res.json();
        const commentsSection = document.getElementById(`comments-${postId}`);
        commentsSection.innerHTML = data.map(renderComment).join("") + commentsSection.querySelector('.add-comment').outerHTML;
        document.getElementById(`comment-count-${postId}`).textContent = `${data.length} comments`;
        commentsSection.querySelector('.view-more-comments')?.remove();
    } catch (err) {
        console.error("Load comments failed:", err);
    }
}

function focusComment(postId) {
    document.getElementById(`comment-text-${postId}`).focus();
}


function handleCommentKeypress(event, postId) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        createComment(postId);
    }
}

async function editComment(commentId, content) {
    const newContent = prompt("Edit comment:", content);
    if (newContent === null || newContent.trim() === content) return;

    try {
        const res = await fetch(`${API_BASE}/social/comments/${commentId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content: newContent.trim() }),
        });
        if (res.ok) {
            loadPosts();
        } else {
            Swal.fire("Error", "Failed to update", "error");
        }
    } catch (err) {
        console.log(err, "error");

        Swal.fire("Error", "Network error", "error");
    }
}



// TOGGLE LIKE
async function toggleLike(id, type) {
    const isPost = type === 'post';
    const container = document.querySelector(`#${type}-${id}`);
    if (!container) return;

    const btn = isPost
        ? container.querySelector(".action-btn:first-child")
        : container.querySelector(".comment-actions button");

    if (!btn) return;
    const icon = btn.querySelector("i");

    const wasLiked = btn.classList.contains("liked");

    if (wasLiked) {
        btn.classList.remove("liked");
        if (icon) icon.className = "far fa-heart";
    } else {
        btn.classList.add("liked");
        if (icon) icon.className = "fas fa-heart";
    }

    const countEl = isPost
        ? container.querySelector(".post-stats span:first-child")
        : btn;

    let count = parseInt(countEl.textContent.match(/\d+/)?.[0] || "0");
    count += wasLiked ? -1 : 1;

    countEl.textContent = isPost ? `${count} likes` : `Like (${count})`;

    likeSound.currentTime = 0;
    likeSound.play().catch(() => { });

    const method = wasLiked ? "DELETE" : "POST";
    const endpoint = isPost
        ? `/social/posts/${id}/like`
        : `/social/comments/${id}/like`;

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error();
    } catch (err) {
        if (wasLiked) {
            btn.classList.add("liked");
            if (icon) icon.className = "fas fa-heart";
            countEl.textContent = isPost ? `${count + 1} likes` : `Like (${count + 1})`;
        } else {
            btn.classList.remove("liked");
            if (icon) icon.className = "far fa-heart";
            countEl.textContent = isPost ? `${count - 1} likes` : `Like (${count - 1})`;
        }

        Swal.fire("Error", "Action failed", "error");
    }
}


// CREATE COMMENT
async function createComment(postId) {
    const textarea = document.getElementById(`comment-text-${postId}`);
    const content = textarea.value.trim();
    if (!content) return;

    try {
        const res = await fetch(`${API_BASE}/social/posts/${postId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ content })
        });

        if (res.ok) {
            const newComment = await res.json();

            commentSound.currentTime = 0;
            commentSound.play().catch(() => { });

            const section = document.getElementById(`comments-${postId}`);
            section.insertAdjacentHTML("afterbegin", renderComment(newComment));

            const countEl = document.getElementById(`comment-count-${postId}`);
            countEl.textContent = `${(parseInt(countEl.textContent) || 0) + 1} comments`;

            textarea.value = "";
            autoResizeTextarea(textarea);
        } else {
            Swal.fire("Error", "Failed to comment", "error");
        }
    } catch (err) {
        console.log(err, "error");
        Swal.fire("Error", "Network error", "error");
    }
}


// EDIT POST
async function saveEdit() {
    const content = document.getElementById("editText").value.trim();
    const media = document.getElementById("editMediaUrl").value.trim();

    if (!content && !media)
        return Swal.fire("Error", "Required", "error");

    try {
        const res = await fetch(`${API_BASE}/social/posts/${editingPostId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ content, media, visibility: "PUBLIC" })
        });

        if (res.ok) {
            const updated = await res.json();

            closeEditModal();

            const el = document.getElementById(`post-${updated.id}`);
            if (el) el.outerHTML = renderPost(updated);

            sendSound.currentTime = 0;
            sendSound.play().catch(() => { });

            Swal.fire({
                icon: 'success',
                title: 'Success',
                timer: 1500,
                showConfirmButton: false,
                timerProgressBar: false
            });

        }
    } catch (err) {
        console.log(err, "save edit error");
        Swal.fire("Error", "Failed", "error");
    }
}


// EDIT COMMENT
async function saveCommentEdit() {
    const content = document.getElementById("editCommentText").value.trim();
    if (!content) return;

    try {
        const res = await fetch(`${API_BASE}/social/comments/${editingCommentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ content })
        });

        if (res.ok) {
            const updated = await res.json();
            if (!updated.author) {
                updated.author = {
                    displayName: currentUser.displayName,
                    username: currentUser.username,
                    id: currentUser.id
                };
            }

            closeEditCommentModal();

            const el = document.getElementById(`comment-${updated.id}`);
            if (el) el.outerHTML = renderComment(updated);

            commentSound.currentTime = 0;
            commentSound.play().catch(() => { });

            Swal.fire({
                icon: 'success',
                title: 'Success',
                timer: 1500,
                showConfirmButton: false,
                timerProgressBar: false
            });
        }
    } catch (err) {
        console.log(err, "save comment edit error");
        Swal.fire("Error", "Failed", "error");
    }
}

// Stories
async function loadStories() {
    try {
        const res = await fetch(`${API_BASE}/social/stories`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const allStories = await res.json();
        const groupsMap = new Map();
        for (const story of allStories) {
            const authorId = story.author.id;
            if (!groupsMap.has(authorId)) {
                groupsMap.set(authorId, { author: story.author, stories: [] });
            }
            groupsMap.get(authorId).stories.push(story);
        }
        storyGroups = Array.from(groupsMap.values());
        for (const group of storyGroups) {
            group.stories.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }

        storyGroups.sort((g1, g2) => new Date(g2.stories[g2.stories.length - 1].createdAt) - new Date(g1.stories[g1.stories.length - 1].createdAt));
        const storiesBar = document.getElementById("storiesBar");
        storiesBar.innerHTML = storyGroups.map((group, index) => renderStoryItem(group, index)).join("");
    } catch (err) {
        console.error("Load stories failed:", err);
    }
}

function renderStoryItem(group, index) {
    const author = group.author;
    const name = author.displayName || author.username;
    const isOwn = author.id === currentUser.id;
    const isUnseen = group.stories.some(s => !s.views.some(v => v.viewerId === currentUser.id));
    const thumb = group.stories[group.stories.length - 1].media || '';
    const thumbStyle = thumb ? `background-image: url(${thumb});` : "";

    return `
        <div class="story-item ${isUnseen ? 'unseen' : ''}" onclick="openStoryViewer(${index}, 0)">
            <div class="story-ring">
                <div class="story-thumb" style="${thumbStyle}"></div>
            </div>
            <div class="story-name">${isOwn ? 'Your Story' : name}</div>
        </div>
    `;
}

window.openAddStory = function () {
    document.getElementById("addStoryModal").classList.add("active");
};

window.closeAddStory = function () {
    document.getElementById("addStoryModal").classList.remove("active");
    document.getElementById("storyMediaUrl").value = "";
    document.getElementById("storyTextInput").value = "";
    document.getElementById("storyMediaPreview").innerHTML = "";
};

async function createStory() {
    const media = document.getElementById("storyMediaUrl").value.trim();
    const text = document.getElementById("storyTextInput").value.trim();

    if (!media) return Swal.fire("Error", "Media URL required", "error");

    try {
        const res = await fetch(`${API_BASE}/social/stories`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ media, text }),
        });

        if (res.ok) {
            closeAddStory();
            loadStories();

            sendSound.play();

            Swal.fire({
                icon: 'success',
                title: 'Success',
                timer: 1500,
                showConfirmButton: false,
                timerProgressBar: false
            });

        } else {
            Swal.fire("Error", "Failed to add story", "error");
        }
    } catch (err) {
        Swal.fire("Error", "Network error", "error");
    }
}



async function viewCurrentStory() {
    const story = storyGroups[currentGroupIndex].stories[currentStoryIndex];
    if (story.authorId !== currentUser.id && !story.views.some(v => v.viewerId === currentUser.id)) {
        try {
            await fetch(`${API_BASE}/social/stories/${story.id}/view`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            story.views.push({ viewerId: currentUser.id, viewedAt: new Date() });
        } catch (err) {
            console.error("View story failed:", err);
        }
    }
}

let storyTimeout = null;
const STORY_DURATION = 6000; // 6 seconds

function renderCurrentStory() {
    const story = storyGroups[currentGroupIndex].stories[currentStoryIndex];
    const author = story.author;
    const name = author.displayName || author.username;

    document.getElementById("storyAuthorName").textContent = name;
    document.getElementById("storyTime").textContent = formatTime(story.createdAt);
    document.getElementById("storyAuthorAvatar").textContent = name[0].toUpperCase();
    document.getElementById("storyText").textContent = story.text || "";

    const mediaDiv = document.getElementById("storyMedia");
    mediaDiv.innerHTML = story.media.match(/\.(mp4|webm|ogg)$/i)
        ? `<video id="storyVideo" autoplay loop muted><source src="${story.media}"></video>`
        : `<img src="${story.media}" alt="Story">`;

    // Progress bar
    const total = storyGroups[currentGroupIndex].stories.length;
    document.querySelector(".story-progress-container").innerHTML =
        Array(total).fill(0).map((_, i) =>
            `<div class="story-progress-bar" data-index="${i}"></div>`
        ).join("");

    const bars = document.querySelectorAll(".story-progress-bar");
    bars.forEach((bar, i) => {
        if (i < currentStoryIndex) bar.style.transform = "scaleX(1)";
        else if (i === currentStoryIndex) bar.style.transform = "scaleX(0)";
        else bar.style.transform = "scaleX(0)";
    });

    startProgress();
}

function startProgress() {
    clearTimeout(storyTimeout);
    const bar = document.querySelector(`.story-progress-bar[data-index="${currentStoryIndex}"]`);
    bar.style.transition = `transform ${STORY_DURATION}ms linear`;
    bar.style.transform = "scaleX(1)";

    storyTimeout = setTimeout(() => {
        nextStory();
    }, STORY_DURATION);
}

function formatTime(date) {
    const d = new Date(date);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return d.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function escapeJs(str) {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

// Pause on hold
let holdTimer;
document.getElementById("storyViewer").addEventListener("mousedown", () => {
    clearTimeout(storyTimeout);
    holdTimer = setTimeout(() => { }, 100);
});
document.getElementById("storyViewer").addEventListener("mouseup", () => {
    clearTimeout(holdTimer);
    startProgress();
});


window.openStoryViewer = async function (groupIndex, storyIndex) {
    currentGroupIndex = groupIndex;
    currentStoryIndex = storyIndex;
    renderCurrentStory();
    document.getElementById("storyViewer").classList.add("active");
    await viewCurrentStory();
};


window.prevStory = function () {
    let changed = false;
    if (currentStoryIndex > 0) {
        currentStoryIndex--;
        changed = true;
    } else if (currentGroupIndex > 0) {
        currentGroupIndex--;
        currentStoryIndex = storyGroups[currentGroupIndex].stories.length - 1;
        changed = true;
    }
    if (changed) {
        renderCurrentStory();
        viewCurrentStory();
    }
};

window.nextStory = function () {
    let changed = false;
    if (currentStoryIndex < storyGroups[currentGroupIndex].stories.length - 1) {
        currentStoryIndex++;
        changed = true;
    } else if (currentGroupIndex < storyGroups.length - 1) {
        currentGroupIndex++;
        currentStoryIndex = 0;
        changed = true;
    }
    if (changed) {
        renderCurrentStory();
        viewCurrentStory();
    }
};

window.closeStoryViewer = function () {
    document.getElementById("storyViewer").classList.remove("active");
    currentGroupIndex = -1;
    currentStoryIndex = -1;
};

window.deleteStory = async function (storyId) {
    if (!confirm("Delete this story?")) return;

    try {
        const res = await fetch(`${API_BASE}/social/stories/${storyId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            loadStories();
        }
    } catch (err) {
        console.error("Delete story failed:", err);
    }
};

// COMMENT EDIT
window.editComment = function (commentId, currentContent) {
    editingCommentId = commentId;

    const decodeHtml = html => {
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    };

    const textarea = document.getElementById("editCommentText");
    textarea.value = decodeHtml(currentContent);

    document.getElementById("editCommentModal").classList.add("active");
    textarea.focus();

    autoResizeTextarea(textarea);
};


window.closeEditCommentModal = function () {
    document.getElementById("editCommentModal").classList.remove("active");
    editingCommentId = null;
};

window.saveCommentEdit = saveCommentEdit;


// POST EDIT
window.editPost = function (postId, content, media) {
    editingPostId = postId;
    document.getElementById("editText").value = content;
    document.getElementById("editMediaUrl").value = media;
    document.getElementById("editMediaPreview").innerHTML = media ? `<img src="${media}" style="width:100%; border-radius:12px;">` : "";
    document.getElementById("editModal").classList.add("active");
};

window.closeEditModal = function () {
    document.getElementById("editModal").classList.remove("active");
    editingPostId = null;
};

window.saveEdit = saveEdit;


// COMMENT CREATION / LIKE
window.toggleLike = toggleLike;
window.focusComment = focusComment;
window.handleCommentKeypress = handleCommentKeypress;
window.createComment = createComment;


// LOAD COMMENTS
window.loadFullComments = loadFullComments;


// STORIES
window.closeStoryViewer = closeStoryViewer;
window.prevStory = prevStory;
window.nextStory = nextStory;

window.closeAddStory = closeAddStory;
window.createStory = createStory;

window.openStoryViewer = openStoryViewer;
window.deleteStory = deleteStory;


// IMAGE PREVIEW
window.openImage = function (src) {
    document.getElementById("modalImage").src = src;
    document.getElementById("imageModal").classList.add("active");
};
