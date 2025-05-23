const express = require("express");
const { verifyToken } = require("../middleware/tokenMiddleware");
const { postProject, getMyProjects, getProviderProjects } = require("../controllers/projects");

const router = express.Router();

router.post("/", verifyToken, postProject);
router.get("/me", verifyToken, getMyProjects);
router.get("/", verifyToken, getProviderProjects);

module.exports = { projectRouter: router };
