exports.health = async (req, res) => {
  return res.json({
    ok: true,
    name: "Roniya Backend API",
    status: "running",
    env: process.env.NODE_ENV || "development",
    pid: process.pid,
    instance: process.env.NODE_APP_INSTANCE ?? "0",
    timestamp: Date.now(),
  });
};
