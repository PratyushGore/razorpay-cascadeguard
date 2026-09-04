let mockIntervalId: any = null;
let currentDelayMs: number = 4000;
let activeCallback: ((data: any) => void) | null = null;
let idCounter = 50; // Offset to not clash with initial mock txn numbers

export const websocketService = {
  setStreamInterval(ms: number) {
    currentDelayMs = ms;
    if (mockIntervalId && activeCallback) {
      clearInterval(mockIntervalId);
      mockIntervalId = null;
      this.startMockStream(activeCallback);
    }
  },

  startMockStream(callback: (data: any) => void) {
    if (mockIntervalId) {
      clearInterval(mockIntervalId);
      mockIntervalId = null;
    }
    mockIntervalId = setInterval(() => {
      idCounter++;
      console.log('📡 [CascadeGuard Sim] Mock WebSocket stream event pushed.');
      callback({
        type: 'NEW_FAILURE',
        idCounter,
        timestamp: new Date().toISOString()
      });
    }, currentDelayMs);
  },

  connect(onMessage: (data: any) => void): () => void {
    activeCallback = onMessage;
    let socket: WebSocket | null = null;
    let isCleanedUp = false;
    let reconnectTimeoutId: any = null;

    const initiateConnection = () => {
      if (isCleanedUp) return;

      try {
        socket = new WebSocket('ws://localhost:8000/ws/failures');

        socket.onopen = () => {
          if (isCleanedUp) {
            socket?.close();
            return;
          }
          console.log('📡 [CascadeGuard WS] Connected to live backend stream.');
          if (mockIntervalId) {
            clearInterval(mockIntervalId);
            mockIntervalId = null;
          }
        };

        socket.onmessage = (event) => {
          if (isCleanedUp) return;
          try {
            const data = JSON.parse(event.data);
            onMessage(data);
          } catch (err) {
            console.error('[CascadeGuard WS] Failed to parse WebSocket packet', err);
          }
        };

        socket.onclose = () => {
          if (!isCleanedUp) {
            console.warn('⚠️ [CascadeGuard WS] Server connection closed. Initializing mock streamer fallback.');
            if (!mockIntervalId) {
              this.startMockStream(onMessage);
            }
            // Attempt to reconnect after 8 seconds
            reconnectTimeoutId = setTimeout(initiateConnection, 8000);
          }
        };

        socket.onerror = () => {
          // Triggers close handler
        };
      } catch (e) {
        if (!isCleanedUp) {
          console.warn('⚠️ [CascadeGuard WS] Failed to open WebSocket. Initializing mock streamer fallback.');
          if (!mockIntervalId) {
            this.startMockStream(onMessage);
          }
        }
      }
    };

    initiateConnection();

    // Return cleanup function to unsubscribe
    return () => {
      isCleanedUp = true;
      activeCallback = null;
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }
      if (socket) {
        try {
          socket.close();
        } catch {}
        socket = null;
      }
      if (mockIntervalId) {
        clearInterval(mockIntervalId);
        mockIntervalId = null;
      }
    };
  }
};
