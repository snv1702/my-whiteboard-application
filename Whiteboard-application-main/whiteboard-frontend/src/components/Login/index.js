import React, { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import styles from "./index.module.css";
import boardContext from "../../store/board-context";
import { loginUser } from "../../utils/api";
import { reconnectSocketWithAuth } from "../../utils/socket";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const { setUserLoginStatus } = useContext(boardContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const data = await loginUser(email.trim(), password);

      if (data && data.token) {
        localStorage.setItem("whiteboard_user_token", data.token);
        if (data.user) {
          localStorage.setItem("whiteboard_user_email", data.user.email);
          localStorage.setItem("whiteboard_user_id", data.user.id);
        }
        setUserLoginStatus(true);
        reconnectSocketWithAuth();
        navigate("/");
      } else {
        setErrorMsg(data.error || data.message || "Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      const msg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        "An error occurred during login. Please try again.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <h2>Login</h2>
      {errorMsg && (
        <div style={{ color: "#e74c3c", marginBottom: "15px", fontSize: "14px" }}>
          {errorMsg}
        </div>
      )}
      <form onSubmit={handleSubmit} className={styles.loginForm}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
      <p>
        Don't have an account? <Link to="/register">Register here</Link>
      </p>
    </div>
  );
};

export default Login;
