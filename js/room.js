// ===== ROOM CONTROLLER =====

document.addEventListener('DOMContentLoaded', () => {
  // Parse room code from URL
  const pathParts = window.location.pathname.split('/');
  const roomCode = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
  const urlParams = new URLSearchParams(window.location.search);
  const username = urlParams.get('user') || localStorage.getItem('pwb_username') || 'Anonymous';

  if (!roomCode) {
    window.location.href = '/';
    return;
  }

  // Save username
  localStorage.setItem('pwb_username', username);

  // Display room code
  document.getElementById('roomCodeDisplay').textContent = roomCode;

  // Connect socket
  const socket = io({
    transports: ['websocket', 'polling']
  });

  // Init canvas
  const paintCanvas = new PaintCanvas('mainCanvas', socket);
  paintCanvas.drawerId = socket.id;

  // Init voice
  const voiceChat = new VoiceChat(socket);

  // ===== SOCKET EVENTS =====
  socket.on('connect', () => {
    paintCanvas.drawerId = socket.id;
    socket.emit('join-room', { roomCode, username });
  });

  socket.on('canvas-history', (history) => {
    if (history && history.length > 0) {
      paintCanvas.loadHistory(history);
    }
  });

  socket.on('draw', (data) => {
    paintCanvas.receiveDraw(data);
  });

  socket.on('draw-batch', (dataArray) => {
    paintCanvas.receiveDrawBatch(dataArray);
  });

  socket.on('clear-canvas', () => {
    paintCanvas.clearCanvas(false);
  });

  socket.on('full-redraw', (history) => {
    paintCanvas.loadHistory(history);
  });

  socket.on('users-updated', (users) => {
    updateUsersList(users);
    document.getElementById('userCount').textContent = users.length;
  });

  socket.on('user-joined', (data) => {
    showToast(`${data.username} joined the room! 🎨`, 'success');
    addSystemMessage(`${data.username} joined`);

    // Connect voice if active
    if (voiceChat.isActive) {
      voiceChat.connectToPeer(data.id);
    }
  });

  socket.on('user-left', (data) => {
    showToast(`${data.username} left the room`, 'info');
    addSystemMessage(`${data.username} left`);
    removeCursor(data.id);
  });

  socket.on('cursor-move', (data) => {
    updateRemoteCursor(data);
  });

  socket.on('chat-message', (data) => {
    addChatMessage(data);
  });

  // ===== TOOL SELECTION =====
  const toolBtns = document.querySelectorAll('.tool-btn');
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      paintCanvas.setTool(btn.dataset.tool);
    });
  });

  // ===== BRUSH SIZE =====
  const brushSizeSlider = document.getElementById('brushSize');
  const sizePreviewDot = document.getElementById('sizePreviewDot');
  const sizeValue = document.getElementById('sizeValue');

  brushSizeSlider.addEventListener('input', () => {
    const size = parseInt(brushSizeSlider.value);
    paintCanvas.setSize(size);
    sizeValue.textContent = `${size}px`;
    const dotSize = Math.min(size, 40);
    sizePreviewDot.style.width = dotSize + 'px';
    sizePreviewDot.style.height = dotSize + 'px';
  });

  // Init preview
  sizePreviewDot.style.width = '5px';
  sizePreviewDot.style.height = '5px';

  // ===== OPACITY =====
  const opacitySlider = document.getElementById('brushOpacity');
  const opacityValue = document.getElementById('opacityValue');

  opacitySlider.addEventListener('input', () => {
    const opacity = parseInt(opacitySlider.value) / 100;
    paintCanvas.setOpacity(opacity);
    opacityValue.textContent = `${opacitySlider.value}%`;
  });

  // ===== COLOR PALETTE =====
  const colors = [
    '#000000', '#FFFFFF', '#FF0000', '#FF4500', '#FF6B6B', '#FF8C00',
    '#FFA500', '#FFD700', '#FFFF00', '#ADFF2F', '#00FF00', '#00FA9A',
    '#00CED1', '#00BFFF', '#1E90FF', '#0000FF', '#4B0082', '#8B00FF',
    '#FF00FF', '#FF69B4', '#DEB887', '#8B4513', '#A0522D', '#808080',
    '#2F4F4F', '#F5F5DC', '#FFC0CB', '#E6E6FA', '#F0E68C', '#98FB98',
    '#87CEEB', '#DDA0DD', '#F4A460', '#CD853F', '#BC8F8F', '#D2691E'
  ];

  const palette = document.getElementById('colorPalette');
  let activeColorSwatch = null;

  colors.forEach((color, i) => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (i === 0 ? ' active' : '');
    swatch.style.background = color;
    swatch.addEventListener('click', () => {
      if (activeColorSwatch) activeColorSwatch.classList.remove('active');
      swatch.classList.add('active');
      activeColorSwatch = swatch;
      paintCanvas.setColor(color);
      document.getElementById('customColor').value = color;
    });
    palette.appendChild(swatch);
    if (i === 0) activeColorSwatch = swatch;
  });

  // Custom color
  document.getElementById('customColor').addEventListener('input', (e) => {
    if (activeColorSwatch) activeColorSwatch.classList.remove('active');
    activeColorSwatch = null;
    paintCanvas.setColor(e.target.value);
  });

  // ===== ACTION BUTTONS =====
  document.getElementById('undoBtn').addEventListener('click', () => {
    socket.emit('undo-request');
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    showConfirm('Clear Canvas?', 'This will clear the entire canvas for everyone!', () => {
      paintCanvas.clearCanvas(true);
    });
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    paintCanvas.saveCanvas();
    showToast('Canvas saved! 📁', 'success');
  });

  // ===== COPY ROOM CODE =====
  document.getElementById('copyCodeBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      showToast('Room code copied! 📋', 'success');
    }).catch(() => {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = roomCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Room code copied! 📋', 'success');
    });
  });

  // ===== VOICE TOGGLE =====
  const voiceToggle = document.getElementById('voiceToggle');
  const micIcon = document.getElementById('micIcon');
  const micOffIcon = document.getElementById('micOffIcon');

  voiceToggle.addEventListener('click', async () => {
    if (!voiceChat.isActive) {
      const started = await voiceChat.toggle();
      if (started) {
        voiceToggle.classList.add('active');
        micIcon.style.display = 'block';
        micOffIcon.style.display = 'none';
        showToast('Voice chat enabled! 🎤', 'success');

        // Connect to existing users
        const usersOnline = document.querySelectorAll('.user-tag');
        // Voice connections will happen automatically via user-joined events
      } else {
        showToast('Microphone access denied 😔', 'error');
      }
    } else {
      // Toggle mute
      const muted = voiceChat.toggleMute();
      if (muted) {
        voiceToggle.classList.remove('active');
        voiceToggle.classList.add('muted');
        micIcon.style.display = 'none';
        micOffIcon.style.display = 'block';
        showToast('Muted 🔇', 'info');
      } else {
        voiceToggle.classList.add('active');
        voiceToggle.classList.remove('muted');
        micIcon.style.display = 'block';
        micOffIcon.style.display = 'none';
        showToast('Unmuted 🔊', 'success');
      }
    }
  });

  // Long press to stop voice
  let voiceLongPress;
  voiceToggle.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (voiceChat.isActive) {
      voiceChat.stop();
      voiceToggle.classList.remove('active', 'muted');
      micIcon.style.display = 'block';
      micOffIcon.style.display = 'none';
      showToast('Voice chat disabled', 'info');
    }
  });

  // ===== CHAT =====
  const chatSidebar = document.getElementById('chatSidebar');
  const chatToggle = document.getElementById('chatToggle');
  const closeChatBtn = document.getElementById('closeChatBtn');
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');
  const chatMessages = document.getElementById('chatMessages');
  const chatBadge = document.getElementById('chatBadge');
  let chatOpen = false;
  let unreadCount = 0;

  chatToggle.addEventListener('click', () => {
    chatOpen = !chatOpen;
    chatSidebar.classList.toggle('hidden', !chatOpen);
    if (chatOpen) {
      unreadCount = 0;
      chatBadge.style.display = 'none';
      chatInput.focus();
    }
  });

  closeChatBtn.addEventListener('click', () => {
    chatOpen = false;
    chatSidebar.classList.add('hidden');
  });

  function sendChat() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit('chat-message', { message: msg });
    chatInput.value = '';
  }

  sendChatBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  function addChatMessage(data) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';

    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    msgDiv.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-msg-name" style="color: ${getColorForName(data.username)}">${escapeHtml(data.username)}</span>
        <span class="chat-msg-time">${time}</span>
      </div>
      <div class="chat-msg-text">${escapeHtml(data.message)}</div>
    `;

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (!chatOpen) {
      unreadCount++;
      chatBadge.textContent = unreadCount;
      chatBadge.style.display = 'flex';
    }
  }

  function addSystemMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg system';
    msgDiv.innerHTML = `<div class="chat-msg-text">${escapeHtml(text)}</div>`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ===== USERS LIST =====
  function updateUsersList(users) {
    const list = document.getElementById('usersList');
    list.innerHTML = '';
    users.forEach(user => {
      const tag = document.createElement('div');
      tag.className = 'user-tag';
      tag.innerHTML = `
        <span class="user-tag-dot" style="background: ${user.color}"></span>
        <span>${escapeHtml(user.username)}${user.id === socket.id ? ' (you)' : ''}</span>
      `;
      list.appendChild(tag);
    });
  }

  // ===== REMOTE CURSORS =====
  const cursorsLayer = document.getElementById('cursorsLayer');
  const remoteCursors = new Map();

  function updateRemoteCursor(data) {
    let cursor = remoteCursors.get(data.id);
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.className = 'remote-cursor';
      cursor.innerHTML = `
        <div class="cursor-dot" style="background: ${getColorForName(data.username)}"></div>
        <div class="cursor-name">${escapeHtml(data.username)}</div>
      `;
      cursorsLayer.appendChild(cursor);
      remoteCursors.set(data.id, cursor);
    }
    cursor.style.left = data.x + 'px';
    cursor.style.top = data.y + 'px';
  }

  function removeCursor(id) {
    const cursor = remoteCursors.get(id);
    if (cursor) {
      cursor.remove();
      remoteCursors.delete(id);
    }
  }

  // ===== KEYBOARD SHORTCUTS =====
  document.addEventListener('keydown', (e) => {
    // Don't capture when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          socket.emit('undo-request');
          break;
        case 's':
          e.preventDefault();
          paintCanvas.saveCanvas();
          showToast('Canvas saved! 📁', 'success');
          break;
      }
    }

    // Number keys for quick tool switch
    const toolMap = {
      '1': 'brush',
      '2': 'pencil',
      '3': 'marker',
      '4': 'spray',
      '5': 'watercolor',
      '6': 'crayon',
      '7': 'calligraphy',
      '8': 'eraser',
      '9': 'fill'
    };

    if (toolMap[e.key]) {
      toolBtns.forEach(b => b.classList.remove('active'));
      const btn = document.querySelector(`[data-tool="${toolMap[e.key]}"]`);
      if (btn) {
        btn.classList.add('active');
        paintCanvas.setTool(toolMap[e.key]);
      }
    }

    // Bracket keys for size
    if (e.key === '[') {
      const newSize = Math.max(1, parseInt(brushSizeSlider.value) - 3);
      brushSizeSlider.value = newSize;
      brushSizeSlider.dispatchEvent(new Event('input'));
    }
    if (e.key === ']') {
      const newSize = Math.min(80, parseInt(brushSizeSlider.value) + 3);
      brushSizeSlider.value = newSize;
      brushSizeSlider.dispatchEvent(new Event('input'));
    }
  });

  // ===== HELPERS =====
  function getColorForName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 60%)`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
      toast.className = 'toast';
    }, 3000);
  }

  function showConfirm(title, message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="confirm-buttons">
          <button class="confirm-no">Cancel</button>
          <button class="confirm-yes">Confirm</button>
        </div>
      </div>
    `;

    overlay.querySelector('.confirm-yes').addEventListener('click', () => {
      onConfirm();
      overlay.remove();
    });

    overlay.querySelector('.confirm-no').addEventListener('click', () => {
      overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  // ===== CLEANUP =====
  window.addEventListener('beforeunload', () => {
    paintCanvas.destroy();
    voiceChat.destroy();
    socket.disconnect();
  });
});