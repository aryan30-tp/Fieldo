import { io } from 'socket.io-client';

// 🚨 CHANGED FROM fieldo-backend TO your exact live domain fieldo
const RENDER_BACKEND_URL = "https://fieldo.onrender.com";

class SocketService {
  socket = null;
  pendingLocation = null;

  connect(userId) {
    if (this.socket) {
      if (this.socket.userId === userId) return;
      this.disconnect();
    }

    this.socket = io(RENDER_BACKEND_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });
    this.socket.userId = userId;

    this.socket.on('connect', () => {
      console.log('📡 Connected to Render WebSocket Server!');
      this.socket.emit('register', { userId });
      if (this.pendingLocation) {
        this.socket.emit('location-update', this.pendingLocation);
        this.pendingLocation = null;
      }
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from WebSocket Server');
    });
  }

  emitLocation(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('location-update', data);
    } else {
      this.pendingLocation = data;
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.pendingLocation = null;
  }
}

const socketInstance = new SocketService();
export default socketInstance;