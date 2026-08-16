const { verifySocketToken } = require("../services/auth.service");

module.exports = (io, socket) => {
  socket.on("auth", async (data, ack) => {
    try {
      // ? ???????? ?? ?? ?? ???? (test-socket.js ? client)
      const token =
        typeof data === "string" ? data : data?.token;

      if (!token) {
        throw new Error("TOKEN_REQUIRED");
      }

      // ? verify JWT
      const payload = verifySocketToken(token);

      const user = {
        id: payload.sub,
        role: payload.role,
      };

      // ? attach user to socket
      socket.user = user;
      socket.isAuthenticated = true;

      // ? personal room (???? unread? notify? ...)
      socket.join(`user:${user.id}`);

      console.log("?? Socket authenticated:", user);

      ack?.({
        ok: true,
        user,
      });
    } catch (err) {
      console.log("? Socket auth failed:", err.message);

      ack?.({
        ok: false,
        error: err.message || "AUTH_FAILED",
      });
    }
  });
};
