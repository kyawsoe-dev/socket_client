const API_BASE = "https://socket-server-ohp4.onrender.com/api/v1";
const token = localStorage.getItem("token");
const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

if (!token || !currentUser.id) {
    window.location.href = "/index.html";
}

let editingPostId = null;
let storyGroups = [];
let currentGroupIndex = -1;
let currentStoryIndex = -1;

document.addEventListener("DOMContentLoaded", () => {
    const avatarEl = document.getElementById("userAvatar");
    avatarEl.textContent = (currentUser.displayName || currentUser.username || "U")[0].toUpperCase();

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
        } else {
            searchInput.value = "";
            loadPosts();
        }
    };

    function debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    const handleSearch = debounce(() => {
        loadPosts(searchInput.value.trim());
    }, 500);

    searchInput.addEventListener("input", handleSearch);

    // Close image modal
    document.getElementById("imageModal").onclick = (e) => {
        if (e.target === document.getElementById("imageModal") || e.target.classList.contains("close-modal")) {
            document.getElementById("imageModal").classList.remove("active");
        }
    };

    // Story viewer close
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
document.getElementById("mediaUrl").oninput = (e) => {
    const url = e.target.value.trim();
    const preview = document.getElementById("mediaPreview");
    preview.innerHTML = "";
    if (url) {
        if (url.match(/\.(jpeg|jpg|gif|png)$/i)) {
            preview.innerHTML = `<img src="${url}" alt="Preview" style="width:100%; border-radius:12px;">`;
        } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
            preview.innerHTML = `<video controls style="width:100%; border-radius:12px;"><source src="${url}"></video>`;
        }
    }
};

document.getElementById("editMediaUrl").oninput = (e) => {
    const url = e.target.value.trim();
    const preview = document.getElementById("editMediaPreview");
    preview.innerHTML = "";
    if (url) {
        if (url.match(/\.(jpeg|jpg|gif|png)$/i)) {
            preview.innerHTML = `<img src="${url}" alt="Preview" style="width:100%; border-radius:12px;">`;
        } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
            preview.innerHTML = `<video controls style="width:100%; border-radius:12px;"><source src="${url}"></video>`;
        }
    }
};

document.getElementById("storyMediaUrl").oninput = (e) => {
    const url = e.target.value.trim();
    const preview = document.getElementById("storyMediaPreview");
    preview.innerHTML = "";
    if (url) {
        if (url.match(/\.(jpeg|jpg|gif|png)$/i)) {
            preview.innerHTML = `<img src="${url}" alt="Preview" style="width:100%; border-radius:12px;">`;
        } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
            preview.innerHTML = `<video controls style="width:100%; border-radius:12px;"><source src="${url}"></video>`;
        }
    }
};

async function createPost() {
    const content = document.getElementById("postText").value.trim();
    const media = document.getElementById("mediaUrl").value.trim();

    if (!content && !media) {
        return Swal.fire("Empty", "Write something or add media", "info");
    }

    try {
        const res = await fetch(`${API_BASE}/social/posts`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content, media, visibility: "PUBLIC" }),
        });

        if (res.ok) {
            document.getElementById("postText").value = "";
            document.getElementById("mediaUrl").value = "";
            document.getElementById("mediaPreview").innerHTML = "";
            loadPosts();
            Swal.fire("Success", "Posted!", "success");
        } else {
            const err = await res.json();
            Swal.fire("Error", err.error || "Failed to post", "error");
        }
    } catch (err) {
        Swal.fire("Error", "Network error", "error");
    }
}

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

    // Show skeleton
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
            localStorage.removeItem("token");
            window.location.href = "index.html";
            return;
        }

        const { data } = await res.json();

        if (data.length < limit) hasMore = false;
        if (data.length === 0 && currentPage === 1) {
            document.getElementById("postsFeed").innerHTML = "<p style='text-align:center; color:#666; padding:40px'>No posts yet.</p>";
            return;
        }

        const feed = document.getElementById("postsFeed");
        const newPosts = data.map(renderPost).join("");

        if (currentPage === 1) {
            feed.innerHTML = newPosts;
        } else {
            feed.insertAdjacentHTML("beforeend", newPosts);
        }

        currentPage++;
    } catch (err) {
        console.error(err);
        Swal.fire("Error", "Failed to load posts", "error");
    } finally {
        isLoading = false;
    }
}

function renderPost(post) {
    const author = post.author;
    const name = author.displayName || author.username;
    const isOwnPost = author.id === currentUser.id;
    const hasLiked = post.likes?.some(l => l.userId === currentUser.id);
    const mediaHtml = post.media ? `
        <div class="post-media">
            <img src="${post.media}" alt="Post media" onclick="openImage('${post.media}')" style="width:100%; cursor:pointer; border-radius:8px;" loading="lazy">
        </div>` : "";

    const menuHtml = isOwnPost ? `
        <button class="post-menu-btn">⋮</button>
        <div class="post-menu">
            <button onclick="editPost(${post.id}, '${escapeJs(post.content || "")}', '${post.media || ""}')">Edit Post</button>
        </div>` : "";

    const commentsHtml = post.comments ? post.comments.map(renderComment).join("") : "";
    const viewMoreComments = post.comments && post.comments.length >= 2 ? `<div class="view-more-comments" onclick="loadFullComments(${post.id})">View more comments</div>` : "";

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
                <button class="action-btn" onclick="focusComment(${post.id})"><i class="far fa-comment"></i> Comment</button>
                <button class="action-btn"><i class="far fa-share-square"></i> Share</button>
            </div>
            <div class="comments-section" id="comments-${post.id}">
                ${commentsHtml}
                ${viewMoreComments}
                <div class="add-comment">
                    <textarea id="comment-text-${post.id}" placeholder="Write a comment..." onkeypress="handleCommentKeypress(event, ${post.id})"></textarea>
                    <button onclick="createComment(${post.id})"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        </article>
    `;
}

function renderComment(comment) {
    const author = comment.author;
    const name = author.displayName || author.username;
    const isOwnComment = author.id === currentUser.id;
    const hasLiked = comment.likes?.some(l => l.userId === currentUser.id);
    const menuHtml = isOwnComment ? `
        <button class="comment-menu-btn">⋮</button>
        <div class="comment-menu">
            <button onclick="editComment(${comment.id}, '${escapeJs(comment.content)}')">Edit</button>
        </div>
    ` : "";

    return `
        <div class="comment" id="comment-${comment.id}">
            <div class="comment-avatar">${name[0].toUpperCase()}</div>
            <div class="comment-body">
                <div class="comment-author">${name}</div>
                <div class="comment-text">${escapeHtml(comment.content)}</div>
                <div class="comment-actions">
                    <button class="${hasLiked ? 'liked' : ''}" onclick="toggleLike(${comment.id}, 'comment')">
                        Like (${comment.likes?.length || 0})
                    </button>
                    <span>${formatTime(comment.createdAt)}</span>
                </div>
            </div>
            ${menuHtml}
        </div>
    `;
}

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

async function createComment(postId) {
    const content = document.getElementById(`comment-text-${postId}`).value.trim();
    if (!content) return;

    try {
        const res = await fetch(`${API_BASE}/social/posts/${postId}/comments`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content }),
        });
        if (res.ok) {
            document.getElementById(`comment-text-${postId}`).value = "";
            loadPosts(); // Refresh to show new comment
        } else {
            Swal.fire("Error", "Failed to comment", "error");
        }
    } catch (err) {
        Swal.fire("Error", "Network error", "error");
    }
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
        Swal.fire("Error", "Network error", "error");
    }
}

let editingCommentId = null;

window.editComment = function (commentId, currentContent) {
    editingCommentId = commentId;
    document.getElementById("editCommentText").value = currentContent;
    autoResizeTextarea(document.getElementById("editCommentText"));
    document.getElementById("editCommentModal").classList.add("active");
};

function closeEditCommentModal() {
    document.getElementById("editCommentModal").classList.remove("active");
    editingCommentId = null;
}

async function saveCommentEdit() {
    const content = document.getElementById("editCommentText").value.trim();
    if (!content) return Swal.fire("Empty", "Comment cannot be empty", "warning");

    try {
        const res = await fetch(`${API_BASE}/social/comments/${editingCommentId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content }),
        });

        if (res.ok) {
            closeEditCommentModal();
            loadPosts();
            Swal.fire("Updated!", "Comment updated", "success");
        }
    } catch (err) {
        Swal.fire("Error", "Failed to update comment", "error");
    }
}

async function toggleLike(id, type) {
    const endpoint = type === 'post' ? `/social/posts/${id}/like` : `/social/comments/${id}/like`;
    const isLiked = document.querySelector(`#${type}-${id} .liked`) !== null;
    const method = isLiked ? "DELETE" : "POST";

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            loadPosts();
        }
    } catch (err) {
        console.error("Toggle like failed:", err);
    }
}

window.editPost = function (postId, content, media) {
    console.log(postId, content, media, "edit post")
    editingPostId = postId;
    document.getElementById("editText").value = content;
    document.getElementById("editMediaUrl").value = media;
    const preview = document.getElementById("editMediaPreview");
    preview.innerHTML = media ? `<img src="${media}" style="width:100%; border-radius:12px;">` : "";
    document.getElementById("editModal").classList.add("active");
};

window.closeEditModal = function () {
    document.getElementById("editModal").classList.remove("active");
    editingPostId = null;
};

async function saveEdit() {
    const content = document.getElementById("editText").value.trim();
    const media = document.getElementById("editMediaUrl").value.trim();

    if (!content && !media) return Swal.fire("Error", "Content or media required", "error");

    try {
        const res = await fetch(`${API_BASE}/social/posts/${editingPostId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ content, media, visibility: "PUBLIC" }),
        });

        if (res.ok) {
            closeEditModal();
            loadPosts();
            Swal.fire("Updated!", "Post updated", "success");
        } else {
            Swal.fire("Error", "Update failed", "error");
        }
    } catch (err) {
        Swal.fire("Error", "Network error", "error");
    }
}

window.openImage = function (src) {
    document.getElementById("modalImage").src = src;
    document.getElementById("imageModal").classList.add("active");
};

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
            Swal.fire("Success", "Story added!", "success");
        } else {
            Swal.fire("Error", "Failed to add story", "error");
        }
    } catch (err) {
        Swal.fire("Error", "Network error", "error");
    }
}

window.openStoryViewer = async function (groupIndex, storyIndex) {
    currentGroupIndex = groupIndex;
    currentStoryIndex = storyIndex;
    renderCurrentStory();
    document.getElementById("storyViewer").classList.add("active");
    await viewCurrentStory();
};

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
document.getElementById("storyViewer").addEventListener("touchstart", (e) => e.preventDefault());

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
    return str.replace(/`/g, "\\`").replace(/\${/g, "\\${");
}

window.toggleLike = toggleLike;
window.focusComment = focusComment;
window.handleCommentKeypress = handleCommentKeypress;
window.createComment = createComment;
window.editPost = editPost;
window.loadFullComments = loadFullComments;
window.editComment = editComment;
window.closeStoryViewer = closeStoryViewer;
window.prevStory = prevStory;
window.nextStory = nextStory;
window.closeAddStory = closeAddStory;
window.createStory = createStory;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.openImage = openImage;
window.openStoryViewer = openStoryViewer;
window.deleteStory = deleteStory;