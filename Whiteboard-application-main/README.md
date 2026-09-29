# Whiteboard Application

A full-stack, real-time collaborative whiteboard application that allows users to draw, sketch, and collaborate in real-time. 

This repository contains both the frontend (React) and backend (Node.js/Express) codebases.

## Project Structure

This is a monorepo containing two main directories:

- `/whiteboard-frontend` - The React application
- `/whiteboard-backend` - The Node.js Express server with Socket.io

## Features

- **Real-time Collaboration**: Multiple users can draw on the same canvas simultaneously using WebSockets.
- **Drawing Tools**: Supports freehand drawing, lines, and shapes (using `roughjs` and `perfect-freehand`).
- **User Authentication**: Secure login and registration using JWT and bcrypt.
- **Session Management**: Users can create or join specific whiteboard sessions.
- **Modern UI**: Clean and responsive user interface styled with Tailwind CSS.

## Tech Stack

**Frontend:**
- React (Create React App)
- Socket.io-client (Real-time communication)
- Rough.js & Perfect-Freehand (Canvas rendering & drawing)
- Tailwind CSS (Styling)
- React Router (Navigation)
- Axios (API requests)

**Backend:**
- Node.js & Express.js
- Socket.io (WebSocket server)
- MongoDB & Mongoose (Database)
- JSON Web Tokens (JWT) (Authentication)
- bcrypt (Password hashing)

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd whiteboard-backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on the environment requirements (e.g., `MONGO_URI`, `JWT_SECRET`).
4. Start the server:
   ```bash
   npm start
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd whiteboard-frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the React development server:
   ```bash
   npm start
   ```
4. Open your browser and navigate to `http://localhost:3000`.

## License

This project is open-source and available under the MIT License.
