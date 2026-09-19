const appConfigService = require("../services/appConfig.service");

module.exports = function registerConfigSocket(io, socket) {
  /*
   =====================================
   ? GET ALL CONFIGS (ON DEMAND)
   =====================================
   */
  socket.on("config:get", async (callback) => {
    try {
      const configs = await appConfigService.getAllConfigs();

      // ? support ack pattern
      if (typeof callback === "function") {
        return callback({
          ok: true,
          data: configs,
        });
      }

      // ? fallback emit
      socket.emit("config:list", configs);
    } catch (err) {
      if (typeof callback === "function") {
        return callback({
          ok: false,
          message: "Failed to load configs",
        });
      }

      socket.emit("config:error", {
        message: "Failed to load configs",
      });
    }
  });

  /*
   =====================================
   ? OPTIONAL: SEND CONFIGS ON CONNECT
   =====================================
   */
  socket.emit("config:ready");
};
