// Frontend configuration for API and Socket.IO URLs
export const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  "https://my-whiteboard-application.onrender.com";

export const API_BASE_URL = `${BACKEND_URL}/api`;
