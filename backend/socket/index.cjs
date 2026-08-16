module.exports = function bootstrapSockets(io) {
  io.on("connection", (socket) => {
    console.log("?? Socket connected:", socket.id);

    /* ===================================================
     ? AUTH GUARD (BLOCK EVENTS UNTIL AUTH SUCCESS)
     =================================================== */
    socket.isAuthenticated = false;

    socket.use((packet, next) => {
      const eventName = packet[0];

      // allow auth + disconnect always
      if (eventName === "auth" || eventName === "disconnect") {
        return next();
      }

      if (!socket.isAuthenticated || !socket.user) {
        return next(new Error("UNAUTHORIZED"));
      }

      next();
    });

    /* ===================================================
     ? AUTH
     =================================================== */
    require("./auth.socket")(io, socket);

    /* ===================================================
     ? CONFIG
     =================================================== */
    require("./config.socket")(io, socket);

    /* ===================================================
     ? CHAT
     =================================================== */
    require("./conversation.socket")(io, socket);
    require("./message.socket")(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(
        "? Socket disconnected:",
        socket.id,
        "| reason:",
        reason,
        "| user:",
        socket.user?.id
      );
    });
  });
};
