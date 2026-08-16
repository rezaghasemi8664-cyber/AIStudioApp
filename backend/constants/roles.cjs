"use strict";

const ROLES = Object.freeze({
  /* =====================
     Semantic roles (runtime / JWT)
  ===================== */
  USER: "USER",
  ADMIN: "ADMIN",

  /* =====================
     DB ? Runtime
  ===================== */
  fromValue(value) {
    if (Number(value) === 2) return "ADMIN";
    return "USER";
  },

  /* =====================
     Runtime ? DB
  ===================== */
  toValue(role) {
    return String(role).toUpperCase() === "ADMIN" ? 2 : 1;
  },

  /* =====================
     Validation helper
  ===================== */
  isValid(role) {
    const normalized = String(role).toUpperCase();
    return normalized === "ADMIN" || normalized === "USER";
  },
});

module.exports = ROLES;
