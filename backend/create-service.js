const path = require("path");
const { Service } = require("node-windows");

// ???? full backend
const svc = new Service({
  name: "roniya-backend",
  description: "Roniya Analyzer Backend Service",
  script: "C:\\projects\\AIStudioApp\\backend\\server.cjs",
  nodeOptions: [
    "--max_old_space_size=512"
  ]
});

svc.on("install", () => {
  console.log("Node backend service installed.");
  svc.start();
});

svc.on("start", () => {
  console.log("Service started successfully.");
});

svc.on("alreadyinstalled", () => {
  console.log("Service already installed.");
});

svc.install();
