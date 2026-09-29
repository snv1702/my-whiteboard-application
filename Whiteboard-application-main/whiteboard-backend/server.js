const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const connectToDB = require("./config/db");
const { Server } = require("socket.io");
const http = require("http");
const Canvas = require("./models/canvasModel");
const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";
const PORT = process.env.PORT || 5000;

const userRoutes = require("./routes/userRoutes");
const canvasRoutes = require("./routes/canvasRoutes");

const app = express();

// Allowed origins for CORS
const allowedOrigins = [
  "https://my-whiteboard-application.vercel.app",
  "https://my-whiteboard-application-cqkjmmf9v-saanvi18.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (process.env.CLIENT_URL && process.env.CLIENT_URL === origin) return true;
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith(".vercel.app")) return true;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  } catch (e) {
    return false;
  }
  return false;
};

// Express Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow browser requests matching allowed origins or any vercel.app preview
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Allow to prevent blocking unexpected preview URLs
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Routes
app.use("/api/users", userRoutes);
app.use("/api/canvas", canvasRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

connectToDB();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ["GET", "POST"],
    credentials: true,
  },
});

let canvasData = {};
let saveTimeouts = {};

const saveCanvasDebounced = (canvasId, elements) => {
  if (saveTimeouts[canvasId]) {
    clearTimeout(saveTimeouts[canvasId]);
  }
  saveTimeouts[canvasId] = setTimeout(async () => {
    try {
      await Canvas.findByIdAndUpdate(canvasId, { elements }, { new: true });
    } catch (err) {
      console.error(`Error persisting canvas ${canvasId}:`, err.message);
    } finally {
      delete saveTimeouts[canvasId];
    }
  }, 500);
};

const flushCanvasSave = async (canvasId) => {
  if (saveTimeouts[canvasId]) {
    clearTimeout(saveTimeouts[canvasId]);
    delete saveTimeouts[canvasId];
    if (canvasData[canvasId]) {
      try {
        await Canvas.findByIdAndUpdate(canvasId, { elements: canvasData[canvasId] }, { new: true });
      } catch (err) {
        console.error(`Error flushing canvas ${canvasId}:`, err.message);
      }
    }
  }
};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("joinCanvas", async ({ canvasId, token: payloadToken }) => {
    console.log(`Socket ${socket.id} joining canvas:`, canvasId);
    try {
      if (!canvasId || !mongoose.Types.ObjectId.isValid(canvasId)) {
        return socket.emit("error", { message: "Invalid canvas ID" });
      }

      // Read token from handshake auth, handshake headers, or payload
      let token =
        (socket.handshake.auth && socket.handshake.auth.token) ||
        socket.handshake.headers?.authorization ||
        payloadToken;

      if (token && token.startsWith("Bearer ")) {
        token = token.slice(7).trim();
      }

      if (!token) {
        console.log("No token provided during joinCanvas.");
        socket.emit("unauthorized", { message: "Access Denied: No Token" });
        return;
      }

      let decoded;
      try {
        decoded = jwt.verify(token, SECRET_KEY);
      } catch (jwtErr) {
        console.log("Invalid token in joinCanvas:", jwtErr.message);
        socket.emit("unauthorized", { message: "Invalid or expired token" });
        return;
      }

      const userId = decoded.userId;

      const canvas = await Canvas.findById(canvasId);
      if (!canvas) {
        socket.emit("unauthorized", { message: "Canvas not found" });
        return;
      }

      const isOwner = String(canvas.owner) === String(userId);
      const isShared = canvas.shared && canvas.shared.some((id) => String(id) === String(userId));

      if (!isOwner && !isShared) {
        console.log(`User ${userId} is not authorized for canvas ${canvasId}`);
        socket.emit("unauthorized", { message: "You are not authorized to join this canvas." });
        return;
      }

      // Leave previous canvas rooms if switching
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          socket.leave(room);
        }
      }

      const room = String(canvasId);
      socket.join(room);
      console.log(`User ${userId} (socket ${socket.id}) successfully joined canvas ${room}`);

      if (canvasData[room] !== undefined) {
        socket.emit("loadCanvas", canvasData[room]);
      } else {
        socket.emit("loadCanvas", canvas.elements || []);
      }
    } catch (error) {
      console.error("joinCanvas error:", error);
      socket.emit("error", { message: "An error occurred while joining the canvas." });
    }
  });

  socket.on("leaveCanvas", ({ canvasId }) => {
    if (canvasId) {
      const room = String(canvasId);
      socket.leave(room);
      flushCanvasSave(room);
    }
  });

  socket.on("drawingUpdate", async ({ canvasId, elements }) => {
    try {
      if (!canvasId) return;
      const room = String(canvasId);
      canvasData[room] = elements;

      // Broadcast to other users in the room
      socket.to(room).emit("receiveDrawingUpdate", elements);

      // Debounce saving to MongoDB to avoid rate-limiting writes while maintaining persistence
      saveCanvasDebounced(room, elements);
    } catch (error) {
      console.error("drawingUpdate error:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
