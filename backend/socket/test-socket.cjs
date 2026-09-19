const { io } = require("socket.io-client");

console.log("? starting socket test...");

const socket = io("http://localhost:3001", {
  transports: ["websocket"],
  autoConnect: false,
});

socket.on("connect", () => {
  console.log("? connected:", socket.id);

  // ? ???? ???? ??? (??? auth)
  socket.emit("message:send", { text: "hello before auth" });
});

socket.on("connect_error", (err) => {
  console.log("? connect error:", err.message);
});

socket.on("error", (err) => {
  console.log("? socket error:", err);
});

setTimeout(() => {
  console.log("? sending auth...");

  socket.emit(
    "auth",
    "PUT_YOUR_VALID_JWT_HERE",
    (res) => {
      console.log("? auth response:", res);

      setTimeout(() => {
        socket.emit("message:send", { text: "hello after auth" });
      }, 500);
    }
  );
}, 1000);

socket.on("disconnect", (reason) => {
  console.log("? disconnected:", reason);
});

socket.connect();

// ? keep process alive
setTimeout(() => {
  console.log("? test finished");
  process.exit(0);
}, 8000);
