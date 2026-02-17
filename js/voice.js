// ===== VOICE CHAT SYSTEM =====

class VoiceChat {
  constructor(socket) {
    this.socket = socket;
    this.localStream = null;
    this.peers = new Map();
    this.isActive = false;
    this.isMuted = false;

    this.setupSocketListeners();
  }

  setupSocketListeners() {
    this.socket.on('voice-signal', (data) => {
      this.handleSignal(data);
    });

    this.socket.on('user-joined', (data) => {
      if (this.isActive) {
        setTimeout(() => this.connectToPeer(data.id), 500);
      }
    });

    this.socket.on('user-left', (data) => {
      this.removePeer(data.id);
    });
  }

  async toggle() {
    if (this.isActive) {
      this.stop();
      return false;
    } else {
      return await this.start();
    }
  }

  async start() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      this.isActive = true;
      return true;
    } catch (err) {
      console.error('Microphone access denied:', err);
      return false;
    }
  }

  stop() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.peers.forEach((peer, id) => {
      if (peer.connection) {
        peer.connection.close();
      }
    });
    this.peers.clear();
    this.isActive = false;
  }

  toggleMute() {
    if (!this.localStream) return false;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });
    return this.isMuted;
  }

  async connectToPeer(peerId) {
    if (!this.isActive || !this.localStream) return;
    if (this.peers.has(peerId)) return;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      });

      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });

      pc.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.autoplay = true;

        const peerData = this.peers.get(peerId);
        if (peerData) {
          peerData.audio = audio;
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('voice-signal', {
            to: peerId,
            signal: {
              type: 'candidate',
              candidate: event.candidate
            }
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          this.removePeer(peerId);
        }
      };

      this.peers.set(peerId, { connection: pc, audio: null });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.socket.emit('voice-signal', {
        to: peerId,
        signal: {
          type: 'offer',
          sdp: pc.localDescription
        }
      });
    } catch (err) {
      console.error('Error connecting to peer:', err);
    }
  }

  async handleSignal(data) {
    const { from, signal } = data;

    if (signal.type === 'offer') {
      await this.handleOffer(from, signal.sdp);
    } else if (signal.type === 'answer') {
      await this.handleAnswer(from, signal.sdp);
    } else if (signal.type === 'candidate') {
      await this.handleCandidate(from, signal.candidate);
    }
  }

  async handleOffer(peerId, sdp) {
    if (!this.isActive) {
      // Auto-start voice if receiving offer
      const started = await this.start();
      if (!started) return;
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          pc.addTrack(track, this.localStream);
        });
      }

      pc.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.autoplay = true;

        const peerData = this.peers.get(peerId);
        if (peerData) {
          peerData.audio = audio;
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('voice-signal', {
            to: peerId,
            signal: {
              type: 'candidate',
              candidate: event.candidate
            }
          });
        }
      };

      this.peers.set(peerId, { connection: pc, audio: null });

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.emit('voice-signal', {
        to: peerId,
        signal: {
          type: 'answer',
          sdp: pc.localDescription
        }
      });
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  }

  async handleAnswer(peerId, sdp) {
    const peer = this.peers.get(peerId);
    if (peer && peer.connection) {
      try {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    }
  }

  async handleCandidate(peerId, candidate) {
    const peer = this.peers.get(peerId);
    if (peer && peer.connection) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error handling ICE candidate:', err);
      }
    }
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      if (peer.connection) {
        peer.connection.close();
      }
      if (peer.audio) {
        peer.audio.pause();
        peer.audio.srcObject = null;
      }
      this.peers.delete(peerId);
    }
  }

  destroy() {
    this.stop();
  }
}