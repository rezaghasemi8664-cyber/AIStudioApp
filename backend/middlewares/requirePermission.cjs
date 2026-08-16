module.exports.requirePermission = (permission) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user || !Array.isArray(user.permissions)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!user.permissions.includes(permission)) {
      return res.status(403).json({
        message: "Insufficient permissions",
        required: permission
      });
    }

    next();
  };
};
