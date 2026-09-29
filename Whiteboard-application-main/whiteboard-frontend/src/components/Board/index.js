import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import rough from "roughjs";
import boardContext from "../../store/board-context";
import { TOOL_ACTION_TYPES, TOOL_ITEMS } from "../../constants";
import toolboxContext from "../../store/toolbox-context";
import socket from "../../utils/socket";
import { loadCanvas as apiLoadCanvas } from "../../utils/api";
import {
  getSvgPathFromStroke,
  rehydrateElement,
  cleanElementForTransmission,
} from "../../utils/element";
import getStroke from "perfect-freehand";
import classes from "./index.module.css";

function Board({ id }) {
  const canvasRef = useRef();
  const textAreaRef = useRef();
  const isRemoteUpdateRef = useRef(false);

  const {
    elements,
    toolActionType,
    boardMouseDownHandler,
    boardMouseMoveHandler,
    boardMouseUpHandler,
    textAreaBlurHandler,
    undo,
    redo,
    setCanvasId,
    setElements,
    setHistory,
  } = useContext(boardContext);
  const { toolboxState } = useContext(toolboxContext);

  const [isAuthorized, setIsAuthorized] = useState(true);

  // Resize canvas to window dimensions
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Real-time Socket.IO room joining and event handling
  useEffect(() => {
    if (!id) return;

    setIsAuthorized(true);
    setCanvasId(id);

    const token = localStorage.getItem("whiteboard_user_token");

    // Join the canvas room
    socket.emit("joinCanvas", { canvasId: id, token });

    // Listen for real-time updates from other collaborators
    const handleDrawingUpdate = (updatedElements) => {
      if (Array.isArray(updatedElements)) {
        isRemoteUpdateRef.current = true;
        const rehydrated = updatedElements.map(rehydrateElement);
        setElements(rehydrated);
      }
    };

    // Listen for canvas load data from socket
    const handleLoadCanvas = (initialElements) => {
      if (Array.isArray(initialElements)) {
        isRemoteUpdateRef.current = true;
        const rehydrated = initialElements.map(rehydrateElement);
        setElements(rehydrated);
        setHistory(rehydrated);
      }
    };

    const handleUnauthorized = (data) => {
      console.warn("Unauthorized socket access:", data?.message);
      setIsAuthorized(false);
      alert(data?.message || "Access Denied: You cannot view or edit this canvas.");
    };

    const handleConnect = () => {
      socket.emit("joinCanvas", {
        canvasId: id,
        token: localStorage.getItem("whiteboard_user_token"),
      });
    };

    socket.on("receiveDrawingUpdate", handleDrawingUpdate);
    socket.on("loadCanvas", handleLoadCanvas);
    socket.on("unauthorized", handleUnauthorized);
    socket.on("connect", handleConnect);

    // Initial load from HTTP API to ensure fastest initial render
    apiLoadCanvas(id)
      .then((data) => {
        if (data && Array.isArray(data.elements)) {
          isRemoteUpdateRef.current = true;
          const rehydrated = data.elements.map(rehydrateElement);
          setElements(rehydrated);
          setHistory(rehydrated);
        }
      })
      .catch((err) => {
        if (err.response && (err.response.status === 403 || err.response.status === 401)) {
          setIsAuthorized(false);
        }
      });

    return () => {
      socket.emit("leaveCanvas", { canvasId: id });
      socket.off("receiveDrawingUpdate", handleDrawingUpdate);
      socket.off("loadCanvas", handleLoadCanvas);
      socket.off("unauthorized", handleUnauthorized);
      socket.off("connect", handleConnect);
    };
  }, [id, setCanvasId, setElements, setHistory]);

  // Synchronize local changes to Socket.IO room in real-time
  useEffect(() => {
    if (!id || !isAuthorized) return;

    if (isRemoteUpdateRef.current) {
      // Change was received from a remote collaborator or initial load; don't broadcast back
      isRemoteUpdateRef.current = false;
      return;
    }

    // Local change (drawing, move, mouseup, eraser, text, undo, redo)
    const cleaned = elements.map(cleanElementForTransmission);
    socket.emit("drawingUpdate", { canvasId: id, elements: cleaned });
  }, [elements, id, isAuthorized]);

  // Keyboard shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y)
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.ctrlKey && event.key === "z") {
        undo();
      } else if (event.ctrlKey && event.key === "y") {
        redo();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [undo, redo]);

  // Canvas rendering
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.save();

    const roughCanvas = rough.canvas(canvas);

    elements.forEach((element) => {
      switch (element.type) {
        case TOOL_ITEMS.LINE:
        case TOOL_ITEMS.RECTANGLE:
        case TOOL_ITEMS.CIRCLE:
        case TOOL_ITEMS.ARROW: {
          let roughEle = element.roughEle;
          if (!roughEle || !roughEle.shape) {
            const rehydrated = rehydrateElement(element);
            roughEle = rehydrated.roughEle;
            element.roughEle = roughEle;
          }
          if (roughEle) {
            roughCanvas.draw(roughEle);
          }
          break;
        }
        case TOOL_ITEMS.BRUSH:
          if (element.points && element.points.length > 0) {
            context.fillStyle = element.stroke || "#000000";
            const path = new Path2D(getSvgPathFromStroke(getStroke(element.points)));
            context.fill(path);
            context.restore();
            context.save();
          }
          break;
        case TOOL_ITEMS.TEXT:
          context.textBaseline = "top";
          context.font = `${element.size || 32}px Caveat, sans-serif`;
          context.fillStyle = element.stroke || "#000000";
          context.fillText(element.text || "", element.x1, element.y1);
          context.restore();
          context.save();
          break;
        default:
          break;
      }
    });

    return () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [elements]);

  useEffect(() => {
    const textarea = textAreaRef.current;
    if (toolActionType === TOOL_ACTION_TYPES.WRITING && textarea) {
      setTimeout(() => {
        textarea.focus();
      }, 0);
    }
  }, [toolActionType]);

  const handleMouseDown = (event) => {
    if (!isAuthorized) return;
    boardMouseDownHandler(event, toolboxState);
  };

  const handleMouseMove = (event) => {
    if (!isAuthorized) return;
    boardMouseMoveHandler(event);
  };

  const handleMouseUp = () => {
    if (!isAuthorized) return;
    boardMouseUpHandler();
  };

  return (
    <>
      {toolActionType === TOOL_ACTION_TYPES.WRITING && elements.length > 0 && (
        <textarea
          type="text"
          ref={textAreaRef}
          className={classes.textElementBox}
          style={{
            top: elements[elements.length - 1]?.y1 || 0,
            left: elements[elements.length - 1]?.x1 || 0,
            fontSize: `${elements[elements.length - 1]?.size || 32}px`,
            color: elements[elements.length - 1]?.stroke || "#000000",
          }}
          onBlur={(event) => textAreaBlurHandler(event.target.value)}
        />
      )}
      <canvas
        ref={canvasRef}
        id="canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </>
  );
}

export default Board;
