module.exports = (socket) => {
  socket.on("conversation:join", ({ conversationId }) => {
    socket.join(`conversation:${conversationId}`);
  });

  socket.on("conversation:leave", ({ conversationId }) => {
    socket.leave(`conversation:${conversationId}`);
  });
};
