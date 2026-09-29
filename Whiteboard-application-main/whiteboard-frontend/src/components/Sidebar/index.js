import React, { useState, useEffect, useContext, useCallback, useRef } from "react";
import "./index.min.css";
import { useNavigate, useParams } from "react-router-dom";
import boardContext from "../../store/board-context";
import {
  getUserCanvases,
  createCanvas as apiCreateCanvas,
  deleteCanvas as apiDeleteCanvas,
  shareCanvas as apiShareCanvas,
} from "../../utils/api";

const Sidebar = () => {
  const [canvases, setCanvases] = useState([]);
  const { canvasId, setCanvasId, isUserLoggedIn, setUserLoginStatus } =
    useContext(boardContext);
  const navigate = useNavigate();
  const { id } = useParams();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const initialCreatedRef = useRef(false);

  // Extract current logged-in user ID
  const getCurrentUserId = useCallback(() => {
    const token = localStorage.getItem("whiteboard_user_token");
    if (!token) return null;
    try {
      const payload = token.replace("Bearer ", "").split(".")[1];
      const decoded = JSON.parse(atob(payload));
      return decoded.userId;
    } catch (e) {
      return null;
    }
  }, []);

  const currentUserId = getCurrentUserId();

  // Load canvases for the logged-in user
  const fetchCanvases = useCallback(async () => {
    if (!isUserLoggedIn) return;
    try {
      const data = await getUserCanvases();
      setCanvases(data);

      if (data.length === 0 && !initialCreatedRef.current) {
        initialCreatedRef.current = true;
        const newCanvas = await apiCreateCanvas();
        if (newCanvas && newCanvas.canvasId) {
          setCanvases([newCanvas.canvas || { _id: newCanvas.canvasId }]);
          setCanvasId(newCanvas.canvasId);
          navigate(`/${newCanvas.canvasId}`);
        }
      } else if (data.length > 0 && !id) {
        setCanvasId(data[0]._id);
        navigate(`/${data[0]._id}`);
      }
    } catch (err) {
      console.error("Error loading canvases:", err);
    }
  }, [id, isUserLoggedIn, navigate, setCanvasId]);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  useEffect(() => {
    if (id) {
      setCanvasId(id);
    }
  }, [id, setCanvasId]);

  const handleCreateCanvas = async () => {
    if (!isUserLoggedIn) return;
    try {
      const res = await apiCreateCanvas();
      if (res && res.canvasId) {
        const createdCanvas = res.canvas || {
          _id: res.canvasId,
          owner: { _id: currentUserId },
        };
        setCanvases((prev) => [createdCanvas, ...prev]);
        setCanvasId(res.canvasId);
        navigate(`/${res.canvasId}`);
      }
    } catch (err) {
      console.error("Error creating canvas:", err);
      alert(err.response?.data?.error || "Failed to create canvas.");
    }
  };

  const handleDeleteCanvas = async (targetCanvasId, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this canvas?")) {
      return;
    }
    try {
      await apiDeleteCanvas(targetCanvasId);
      const remaining = canvases.filter((c) => c._id !== targetCanvasId);
      setCanvases(remaining);

      // If the currently active canvas was deleted
      const activeId = id || canvasId;
      if (activeId === targetCanvasId) {
        if (remaining.length > 0) {
          setCanvasId(remaining[0]._id);
          navigate(`/${remaining[0]._id}`);
        } else {
          // No canvases left; create a new one automatically
          handleCreateCanvas();
        }
      }
    } catch (err) {
      console.error("Error deleting canvas:", err);
      alert(err.response?.data?.error || "Failed to delete canvas.");
    }
  };

  const handleCanvasClick = (targetId) => {
    setCanvasId(targetId);
    navigate(`/${targetId}`);
  };

  const handleLogout = () => {
    localStorage.removeItem("whiteboard_user_token");
    localStorage.removeItem("whiteboard_user_email");
    localStorage.removeItem("whiteboard_user_id");
    setCanvases([]);
    setUserLoginStatus(false);
    navigate("/login");
  };

  const handleLogin = () => {
    navigate("/login");
  };

  const activeId = id || canvasId;
  const currentCanvas = canvases.find((c) => c._id === activeId);
  const isCurrentCanvasOwner =
    currentCanvas &&
    (currentCanvas.owner?._id
      ? String(currentCanvas.owner._id) === String(currentUserId)
      : String(currentCanvas.owner) === String(currentUserId));

  const handleShare = async () => {
    if (!email.trim()) {
      setError("Please enter an email.");
      return;
    }

    if (!activeId) {
      setError("No active canvas to share.");
      return;
    }

    try {
      setIsSharing(true);
      setError("");
      setSuccess("");

      const response = await apiShareCanvas(activeId, email.trim());
      setSuccess(response.message || "Canvas shared successfully!");
      setEmail("");
      setTimeout(() => {
        setSuccess("");
      }, 5000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to share canvas.");
      setTimeout(() => {
        setError("");
      }, 5000);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="sidebar">
      <button
        className="create-button"
        onClick={handleCreateCanvas}
        disabled={!isUserLoggedIn}
      >
        + Create New Canvas
      </button>

      <ul className="canvas-list">
        {canvases.map((c) => {
          const isOwner = c.owner?._id
            ? String(c.owner._id) === String(currentUserId)
            : String(c.owner) === String(currentUserId);

          return (
            <li
              key={c._id}
              className={`canvas-item ${c._id === activeId ? "selected" : ""}`}
              onClick={() => handleCanvasClick(c._id)}
            >
              <div className="canvas-info">
                <span className="canvas-name">Canvas {c._id.slice(-6)}</span>
                <span
                  className={`canvas-badge ${
                    isOwner ? "canvas-badge-owner" : "canvas-badge-shared"
                  }`}
                >
                  {isOwner ? "Owner" : `Shared by ${c.owner?.email || "user"}`}
                </span>
              </div>
              {isOwner && (
                <button
                  className="delete-button"
                  title="Delete canvas"
                  onClick={(e) => handleDeleteCanvas(c._id, e)}
                >
                  del
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {isUserLoggedIn && (
        <div className="share-container">
          {isCurrentCanvasOwner ? (
            <>
              <input
                type="email"
                placeholder="Recipient's registered email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSharing}
              />
              <button
                className="share-button"
                onClick={handleShare}
                disabled={isSharing || !email.trim()}
              >
                {isSharing ? "Sharing..." : "Share"}
              </button>
            </>
          ) : (
            <div className="shared-notice">
              Viewing shared canvas. Real-time collaboration active.
            </div>
          )}
          {error && <p className="error-message">{error}</p>}
          {success && <p className="success-message">{success}</p>}
        </div>
      )}

      {isUserLoggedIn ? (
        <button className="auth-button logout-button" onClick={handleLogout}>
          Logout
        </button>
      ) : (
        <button className="auth-button login-button" onClick={handleLogin}>
          Login
        </button>
      )}
    </div>
  );
};

export default Sidebar;
