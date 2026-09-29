const SECRET_KEY = "test_secret_key";
process.env.JWT_SECRET = SECRET_KEY;

const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { Server } = require("socket.io");
const { io: Client } = require("socket.io-client");
const { MongoMemoryServer } = require("mongodb-memory-server");
const jwt = require("jsonwebtoken");

const userRoutes = require("./routes/userRoutes");
const canvasRoutes = require("./routes/canvasRoutes");
const Canvas = require("./models/canvasModel");
const User = require("./models/userModel");

async function runTestFlow() {
  console.log("=== STARTING FULL APPLICATION TEST FLOW ===");

  // 1. Start In-Memory MongoDB
  console.log("Starting MongoMemoryServer...");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  console.log("Connected to in-memory MongoDB at:", uri);

  // 2. Set up Express + Socket.IO Server
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api/users", userRoutes);
  app.use("/api/canvas", canvasRoutes);

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" },
  });

  let canvasData = {};
  let saveTimeouts = {};

  const saveCanvasDebounced = (canvasId, elements) => {
    if (saveTimeouts[canvasId]) clearTimeout(saveTimeouts[canvasId]);
    saveTimeouts[canvasId] = setTimeout(async () => {
      try {
        await Canvas.findByIdAndUpdate(canvasId, { elements }, { new: true });
      } catch (err) {
        console.error("Save error:", err);
      } finally {
        delete saveTimeouts[canvasId];
      }
    }, 100);
  };

  io.on("connection", (socket) => {
    socket.on("joinCanvas", async ({ canvasId, token: payloadToken }) => {
      try {
        let token =
          (socket.handshake.auth && socket.handshake.auth.token) ||
          socket.handshake.headers?.authorization ||
          payloadToken;

        if (token && token.startsWith("Bearer ")) token = token.slice(7).trim();

        if (!token) {
          return socket.emit("unauthorized", { message: "Access Denied: No Token" });
        }

        let decoded;
        try {
          decoded = jwt.verify(token, SECRET_KEY);
        } catch (err) {
          return socket.emit("unauthorized", { message: "Invalid or expired token" });
        }

        const userId = decoded.userId;
        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
          return socket.emit("unauthorized", { message: "Canvas not found" });
        }

        const isOwner = String(canvas.owner) === String(userId);
        const isShared = canvas.shared && canvas.shared.some((id) => String(id) === String(userId));

        if (!isOwner && !isShared) {
          return socket.emit("unauthorized", { message: "You are not authorized to join this canvas." });
        }

        const room = String(canvasId);
        for (const r of socket.rooms) {
          if (r !== socket.id) socket.leave(r);
        }
        socket.join(room);

        if (canvasData[room] !== undefined) {
          socket.emit("loadCanvas", canvasData[room]);
        } else {
          socket.emit("loadCanvas", canvas.elements || []);
        }
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("drawingUpdate", ({ canvasId, elements }) => {
      if (!canvasId) return;
      const room = String(canvasId);
      canvasData[room] = elements;
      socket.to(room).emit("receiveDrawingUpdate", elements);
      saveCanvasDebounced(room, elements);
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  const makeReq = async (endpoint, options = {}) => {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  // STEP A: Register User A
  console.log("\n--- STEP A: Register User A ---");
  const regA = await makeReq("/api/users/register", {
    method: "POST",
    body: JSON.stringify({ email: "usera@example.com", password: "Password123" }),
  });
  console.log("Register User A result:", regA);
  if (regA.status !== 201) throw new Error("Step A Failed");

  // STEP B: Register User B
  console.log("\n--- STEP B: Register User B ---");
  const regB = await makeReq("/api/users/register", {
    method: "POST",
    body: JSON.stringify({ email: "userb@example.com", password: "Password123" }),
  });
  console.log("Register User B result:", regB);
  if (regB.status !== 201) throw new Error("Step B Failed");

  // STEP C: Login as User A
  console.log("\n--- STEP C: Login as User A ---");
  const loginA = await makeReq("/api/users/login", {
    method: "POST",
    body: JSON.stringify({ email: "usera@example.com", password: "Password123" }),
  });
  console.log("Login User A status:", loginA.status, "Token exists:", !!loginA.data.token);
  const tokenA = loginA.data.token;
  if (!tokenA) throw new Error("Step C Failed");

  // STEP D: Create a Canvas with User A
  console.log("\n--- STEP D: Create Canvas as User A ---");
  const createRes = await makeReq("/api/canvas/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  console.log("Create Canvas result:", createRes.data);
  const canvasId = createRes.data.canvasId;
  if (!canvasId) throw new Error("Step D Failed");

  // STEP E: Draw something (Simulate User A drawing a stroke)
  console.log("\n--- STEP E: Draw initial stroke as User A ---");
  const initialElements = [
    { id: 1, type: "LINE", x1: 10, y1: 20, x2: 100, y2: 200, stroke: "#ff0000", size: 2 },
  ];
  const updateRes = await makeReq("/api/canvas/update", {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ canvasId, elements: initialElements }),
  });
  console.log("Update Canvas result:", updateRes.data);
  if (updateRes.status !== 200) throw new Error("Step E Failed");

  // STEP F: Share canvas with User B's email
  console.log("\n--- STEP F: Share canvas with User B ---");
  const shareRes = await makeReq(`/api/canvas/share/${canvasId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ email: "userb@example.com" }),
  });
  console.log("Share result:", shareRes.data);
  if (shareRes.status !== 200) throw new Error("Step F Failed");

  // Prevent duplicate share test
  const dupShare = await makeReq(`/api/canvas/share/${canvasId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ email: "userb@example.com" }),
  });
  console.log("Duplicate share prevention:", dupShare.data);
  if (dupShare.status !== 400) throw new Error("Duplicate share prevention failed");

  // STEP G & H: Login as User B
  console.log("\n--- STEP G & H: Login as User B ---");
  const loginB = await makeReq("/api/users/login", {
    method: "POST",
    body: JSON.stringify({ email: "userb@example.com", password: "Password123" }),
  });
  const tokenB = loginB.data.token;
  console.log("Login User B status:", loginB.status, "Token exists:", !!tokenB);
  if (!tokenB) throw new Error("Step G & H Failed");

  // STEP I: Verify shared canvas appears in User B's list
  console.log("\n--- STEP I: Verify User B canvas list ---");
  const listB = await makeReq("/api/canvas/list", {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  console.log("User B canvas count:", listB.data.length);
  const foundShared = listB.data.find((c) => String(c._id) === String(canvasId));
  if (!foundShared) throw new Error("Step I Failed: Shared canvas not in User B's list");
  console.log("Found shared canvas in User B's list:", foundShared._id, "Owner:", foundShared.owner.email);

  // STEP J & K: User B loads the shared canvas and verifies User A's drawing appears
  console.log("\n--- STEP J & K: User B loads shared canvas ---");
  const loadB = await makeReq(`/api/canvas/load/${canvasId}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  console.log("User B loaded elements:", loadB.data.elements);
  if (loadB.data.elements.length !== 1 || loadB.data.elements[0].type !== "LINE") {
    throw new Error("Step J & K Failed: Elements missing or incorrect");
  }

  // STEP L, M, N: Real-Time Socket Collaboration (User A and User B simultaneously)
  console.log("\n--- STEP L, M, N: Real-Time Socket Collaboration ---");
  const socketA = Client(baseUrl, {
    auth: { token: tokenA },
    transports: ["websocket"],
  });
  const socketB = Client(baseUrl, {
    auth: { token: tokenB },
    transports: ["websocket"],
  });

  await new Promise((res) => socketA.on("connect", res));
  await new Promise((res) => socketB.on("connect", res));
  console.log("Both socket clients connected!");

  socketA.on("unauthorized", (e) => console.error("socketA unauthorized:", e));
  socketB.on("unauthorized", (e) => console.error("socketB unauthorized:", e));
  socketA.on("error", (e) => console.error("socketA error:", e));
  socketB.on("error", (e) => console.error("socketB error:", e));

  // Listen for join confirmation
  const joinAPromise = new Promise((res) => socketA.once("loadCanvas", res));
  const joinBPromise = new Promise((res) => socketB.once("loadCanvas", res));

  // Join room
  socketA.emit("joinCanvas", { canvasId });
  socketB.emit("joinCanvas", { canvasId });

  await Promise.all([joinAPromise, joinBPromise]);
  console.log("Both socket clients joined room successfully!");

  // Verify User B receives drawing update from User A in real-time
  const promiseBReceives = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for User B to receive update")), 3000);
    socketB.on("receiveDrawingUpdate", (elements) => {
      clearTimeout(timeout);
      console.log(">>> User B received drawingUpdate in real-time:", elements);
      resolve(elements);
    });
  });

  const updatedFromA = [
    ...initialElements,
    { id: 2, type: "RECTANGLE", x1: 50, y1: 50, x2: 150, y2: 150, stroke: "#0000ff", size: 3 },
  ];
  socketA.emit("drawingUpdate", { canvasId, elements: updatedFromA });

  const receivedByB = await promiseBReceives;
  if (receivedByB.length !== 2) throw new Error("Step M Failed");

  // Verify User A receives drawing update from User B in real-time
  const promiseAReceives = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for User A to receive update")), 3000);
    socketA.on("receiveDrawingUpdate", (elements) => {
      clearTimeout(timeout);
      console.log(">>> User A received drawingUpdate in real-time:", elements);
      resolve(elements);
    });
  });

  const updatedFromB = [
    ...updatedFromA,
    { id: 3, type: "CIRCLE", x1: 200, y1: 200, x2: 300, y2: 300, stroke: "#00ff00", size: 1 },
  ];
  socketB.emit("drawingUpdate", { canvasId, elements: updatedFromB });

  const receivedByA = await promiseAReceives;
  if (receivedByA.length !== 3) throw new Error("Step N Failed");

  // STEP O: Refresh / Persistence test
  console.log("\n--- STEP O: Canvas Persistence Test ---");
  // Wait 200ms for debounced save to persist to MongoDB
  await new Promise((r) => setTimeout(r, 300));
  const persistedCanvas = await Canvas.findById(canvasId);
  console.log("Persisted elements count in MongoDB:", persistedCanvas.elements.length);
  if (persistedCanvas.elements.length !== 3) {
    throw new Error("Step O Failed: Database persistence did not save elements");
  }

  // STEP P: Create additional canvases
  console.log("\n--- STEP P: Create additional canvas for User B ---");
  const createCanvasB = await makeReq("/api/canvas/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  console.log("User B created canvas:", createCanvasB.data);
  const canvasBId = createCanvasB.data.canvasId;

  const listBAfter = await makeReq("/api/canvas/list", {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  console.log("User B canvases after creation:", listBAfter.data.length);
  if (listBAfter.data.length !== 2) throw new Error("Step P Failed");

  // STEP Q: Delete canvas
  console.log("\n--- STEP Q: Delete canvas ---");
  const deleteRes = await makeReq(`/api/canvas/delete/${canvasBId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  console.log("Delete result:", deleteRes.data);
  if (deleteRes.status !== 200) throw new Error("Step Q Failed");

  const listBAfterDel = await makeReq("/api/canvas/list", {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  console.log("User B canvases after delete:", listBAfterDel.data.length);
  if (listBAfterDel.data.length !== 1) throw new Error("Step Q Failed");

  // STEP R: Security & Unauthorized Access test
  console.log("\n--- STEP R: Security & Unauthorized Access Test ---");
  // Register User C (unauthorized)
  await makeReq("/api/users/register", {
    method: "POST",
    body: JSON.stringify({ email: "userc@example.com", password: "Password123" }),
  });
  const loginC = await makeReq("/api/users/login", {
    method: "POST",
    body: JSON.stringify({ email: "userc@example.com", password: "Password123" }),
  });
  const tokenC = loginC.data.token;

  // User C tries to HTTP load User A's canvas
  const loadC = await makeReq(`/api/canvas/load/${canvasId}`, {
    headers: { Authorization: `Bearer ${tokenC}` },
  });
  console.log("User C load private canvas HTTP status:", loadC.status, loadC.data);
  if (loadC.status !== 403) throw new Error("Step R HTTP Auth check Failed");

  // User C tries to join room over socket
  const socketC = Client(baseUrl, {
    auth: { token: tokenC },
    transports: ["websocket"],
  });
  await new Promise((res) => socketC.on("connect", res));

  const promiseCUnauthorized = new Promise((resolve) => {
    socketC.on("unauthorized", (data) => {
      console.log("User C socket unauthorized event received as expected:", data);
      resolve(data);
    });
  });

  socketC.emit("joinCanvas", { canvasId });
  await promiseCUnauthorized;

  // Cleanup
  socketA.disconnect();
  socketB.disconnect();
  socketC.disconnect();
  server.close();
  await mongoose.disconnect();
  await mongod.stop();

  console.log("\n============================================");
  console.log("ALL TESTS (A to R) PASSED SUCCESSFULLY!");
  console.log("============================================\n");
}

runTestFlow().catch((err) => {
  console.error("TEST FAILED WITH ERROR:", err);
  process.exit(1);
});
