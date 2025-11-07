# KS Chat App – Frontend

A **real-time, responsive chat application** frontend built with **HTML, CSS, and vanilla JavaScript**.  
It features live messaging, typing indicators, emoji support, group chats, and WebRTC voice/video calls — all powered by a **Socket.IO** backend.

---

## Features

- **Real-time messaging** via WebSocket (Socket.IO)
- **Typing indicators** with sound feedback
- **Emoji picker** (via `@joeattardi/emoji-button`)
- **Group & private chats** with member management
- **WebRTC audio/video calling** (1:1 & group)
- **Online/offline status** with last-seen timestamps
- **Message editing & deletion** (for everyone)
- **Push notifications** (via Service Worker & VAPID)
- **Responsive design** – mobile & desktop friendly
- **Suggested users panel** (toggleable)
- **Debounced search** for users & groups
- **Optimistic UI updates** for instant feedback

---

## Tech Stack

| Layer        | Technology                                                               |
| ------------ | ------------------------------------------------------------------------ |
| **Frontend** | HTML5, CSS3 (Flexbox/Grid), Vanilla JavaScript (ES6+)                    |
| **Realtime** | [Socket.IO Client](https://socket.io)                                    |
| **Emoji**    | [`@joeattardi/emoji-button`](https://github.com/joeattardi/emoji-button) |
| **Alerts**   | [SweetAlert2](https://sweetalert2.github.io/)                            |
| **Icons**    | [Font Awesome](https://fontawesome.com)                                  |
| **WebRTC**   | Native `RTCPeerConnection`, `getUserMedia`, ICE (STUN/TURN)              |
| **PWA**      | Service Worker, Push API, Manifest                                       |

---

```
