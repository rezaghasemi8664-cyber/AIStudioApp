module.exports = (io, socket) => {
  socket.on("message:send", ({ conversationId, message }) => {
    io.to(`conversation:${conversationId}`).emit("message:new", {
      conversationId,
      message,
    });
  });
};
