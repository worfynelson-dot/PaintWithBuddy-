// ===== LANDING PAGE LOGIC =====

document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('username');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const roomCodeInput = document.getElementById('roomCodeInput');

  // Load saved username
  const savedUsername = localStorage.getItem('pwb_username');
  if (savedUsername) {
    usernameInput.value = savedUsername;
  }

  // Generate room code
  function generateRoomCode() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return `${day}${month}${year}${randomPart}`;
  }

  function getUsername() {
    const name = usernameInput.value.trim();
    if (!name) {
      showToast('Please enter your name first! 👤', 'error');
      usernameInput.focus();
      return null;
    }
    localStorage.setItem('pwb_username', name);
    return name;
  }

  // Create Room
  createRoomBtn.addEventListener('click', () => {
    const username = getUsername();
    if (!username) return;

    const code = generateRoomCode();
    window.location.href = `/room/${code}?user=${encodeURIComponent(username)}`;
  });

  // Join Room
  joinRoomBtn.addEventListener('click', () => {
    const username = getUsername();
    if (!username) return;

    const code = roomCodeInput.value.trim();
    if (!code) {
      showToast('Please enter a room code! 🔑', 'error');
      roomCodeInput.focus();
      return;
    }

    window.location.href = `/room/${code}?user=${encodeURIComponent(username)}`;
  });

  // Enter key support
  roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoomBtn.click();
  });

  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (roomCodeInput.value.trim()) {
        joinRoomBtn.click();
      } else {
        createRoomBtn.click();
      }
    }
  });
});

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}