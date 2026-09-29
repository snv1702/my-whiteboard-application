import { io } from "socket.io-client";
import { BACKEND_URL } from "./config";

const socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ["websocket", "polling"],
  auth: (cb) => {
    const token = localStorage.getItem("whiteboard_user_token");
    cb({
      token: token
        ? token.startsWith("Bearer ")
          ? token
          : `Bearer ${token}`
        : "",
    });
  },
});

export const reconnectSocketWithAuth = () => {
  const token = localStorage.getItem("whiteboard_user_token");
  socket.auth = {
    token: token
      ? token.startsWith("Bearer ")
        ? token
        : `Bearer ${token}`
      : "",
  };
  if (socket.connected) {
    socket.disconnect().connect();
  } else {
    socket.connect();
  }
};

export default socket;
