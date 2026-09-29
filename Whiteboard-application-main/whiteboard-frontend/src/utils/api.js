import axios from "axios";
import { API_BASE_URL } from "./config";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Attach authorization token dynamically on every request
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("whiteboard_user_token");
    if (token) {
      config.headers.Authorization = token.startsWith("Bearer ")
        ? token
        : `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global response interceptor for auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If token is invalid or expired
      const isAuthPath =
        window.location.pathname === "/login" ||
        window.location.pathname === "/register";
      if (!isAuthPath) {
        localStorage.removeItem("whiteboard_user_token");
        localStorage.removeItem("whiteboard_user_email");
        localStorage.removeItem("whiteboard_user_id");
      }
    }
    return Promise.reject(error);
  }
);

export const registerUser = async (email, password) => {
  const response = await apiClient.post("/users/register", { email, password });
  return response.data;
};

export const loginUser = async (email, password) => {
  const response = await apiClient.post("/users/login", { email, password });
  return response.data;
};

export const getUserCanvases = async () => {
  const response = await apiClient.get("/canvas/list");
  return response.data;
};

export const createCanvas = async () => {
  const response = await apiClient.post("/canvas/create", {});
  return response.data;
};

export const loadCanvas = async (canvasId) => {
  const response = await apiClient.get(`/canvas/load/${canvasId}`);
  return response.data;
};

export const updateCanvas = async (canvasId, elements) => {
  try {
    const response = await apiClient.put("/canvas/update", {
      canvasId,
      elements,
    });
    return response.data;
  } catch (error) {
    console.error("Error updating canvas in DB:", error);
    throw error;
  }
};

export const shareCanvas = async (canvasId, email) => {
  const response = await apiClient.put(`/canvas/share/${canvasId}`, { email });
  return response.data;
};

export const deleteCanvas = async (canvasId) => {
  const response = await apiClient.delete(`/canvas/delete/${canvasId}`);
  return response.data;
};

// Backwards-compatible helper
export const fetchInitialCanvasElements = async (canvasId) => {
  try {
    const response = await apiClient.get(`/canvas/load/${canvasId}`);
    return response.data.elements || [];
  } catch (error) {
    console.error("Error fetching initial canvas elements:", error);
    return [];
  }
};

export default apiClient;
