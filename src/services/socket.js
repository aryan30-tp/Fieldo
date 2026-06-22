import { io } from 'socket.io-client';

// 🚨 CHANGED FROM fieldo-backend TO your exact live domain fieldo
const RENDER_BACKEND_URL = "https://fieldo.onrender.com";

class SocketService {
  socket = null;

  connect(userId) {
    if (this.socket) return;

    this.socket = io(RENDER_BACKEND_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      console.log('📡 Connected to Render WebSocket Server!');
      // Register our profile identity immediately upon handshake
      this.socket.emit('register', { userId });
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from WebSocket Server');
    });
  }

  emitLocation(data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('location-update', data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

const socketInstance = new SocketService();
export default socketInstance;