const Canvas = require("../models/canvasModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");

// Helper to validate ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Create a new canvas
exports.createCanvas = async (req, res) => {
    try {
        const userId = req.userId; // Get the authenticated user ID

        const newCanvas = new Canvas({
            owner: userId,
            shared: [],
            elements: []
        });

        await newCanvas.save();
        await newCanvas.populate("owner", "email");
        res.status(201).json({ message: "Canvas created successfully", canvasId: newCanvas._id, canvas: newCanvas });
    } catch (error) {
        res.status(500).json({ error: "Failed to create canvas", details: error.message });
    }
};

// Update an existing canvas (when elements are drawn)
exports.updateCanvas = async (req, res) => {
    try {
        const { canvasId, elements } = req.body;
        const userId = req.userId;

        if (!canvasId || !isValidObjectId(canvasId)) {
            return res.status(400).json({ error: "Invalid canvas ID" });
        }

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return res.status(404).json({ error: "Canvas not found" });
        }

        // Ensure only the owner or shared users can update
        const isOwner = canvas.owner.toString() === userId.toString();
        const isShared = canvas.shared && canvas.shared.some(id => id.toString() === userId.toString());

        if (!isOwner && !isShared) {
            return res.status(403).json({ error: "Unauthorized to update this canvas" });
        }

        canvas.elements = elements || [];
        await canvas.save();

        res.json({ message: "Canvas updated successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to update canvas", details: error.message });
    }
};

// Load a canvas
exports.loadCanvas = async (req, res) => {
    try {
        const canvasId = req.params.id;
        const userId = req.userId;

        if (!canvasId || !isValidObjectId(canvasId)) {
            return res.status(400).json({ error: "Invalid canvas ID" });
        }

        const canvas = await Canvas.findById(canvasId).populate("owner", "email");
        if (!canvas) {
            return res.status(404).json({ error: "Canvas not found" });
        }

        // Ensure only the owner or shared users can access it
        const isOwner = canvas.owner._id ? canvas.owner._id.toString() === userId.toString() : canvas.owner.toString() === userId.toString();
        const isShared = canvas.shared && canvas.shared.some(id => id.toString() === userId.toString());

        if (!isOwner && !isShared) {
            return res.status(403).json({ error: "Unauthorized to access this canvas" });
        }

        res.json(canvas);
    } catch (error) {
        res.status(500).json({ error: "Failed to load canvas", details: error.message });
    }
};

exports.shareCanvas = async (req, res) => {
    try {
        const { email } = req.body; 
        const canvasId = req.params.id;
        const userId = req.userId; 

        if (!canvasId || !isValidObjectId(canvasId)) {
            return res.status(400).json({ error: "Invalid canvas ID" });
        }

        if (!email || !email.trim()) {
            return res.status(400).json({ error: "Recipient email is required" });
        }

        // Find the user by normalized email
        const userToShare = await User.findOne({ email: email.trim().toLowerCase() });
        if (!userToShare) {
            return res.status(404).json({ error: "User with this email not found" });
        }

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return res.status(404).json({ error: "Canvas not found" });
        }

        if (canvas.owner.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Only the owner can share this canvas" });
        }

        // Prevent adding the owner to shared list
        if (canvas.owner.toString() === userToShare._id.toString()) {
            return res.status(400).json({ error: "You cannot share a canvas with yourself" });
        }

        // Check if the user is already in the shared array
        const alreadyShared = canvas.shared.some(id => id.toString() === userToShare._id.toString());
        if (alreadyShared) {
            return res.status(400).json({ error: "Canvas is already shared with this user" });
        }

        // Add user to shared list
        canvas.shared.push(userToShare._id);
        await canvas.save();

        res.json({ message: `Canvas shared successfully with ${userToShare.email}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to share canvas", details: error.message });
    }
};

// Unshare canvas from a user
exports.unshareCanvas = async (req, res) => {
    try {
        const { userIdToRemove } = req.body;
        const canvasId = req.params.id;
        const userId = req.userId;

        if (!canvasId || !isValidObjectId(canvasId)) {
            return res.status(400).json({ error: "Invalid canvas ID" });
        }

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return res.status(404).json({ error: "Canvas not found" });
        }

        if (canvas.owner.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Only the owner can unshare this canvas" });
        }

        canvas.shared = canvas.shared.filter(id => id.toString() !== userIdToRemove.toString());
        await canvas.save();

        res.json({ message: "Canvas unshared successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to unshare canvas", details: error.message });
    }
};

exports.deleteCanvas = async (req, res) => {
    try {
        const canvasId = req.params.id;
        const userId = req.userId;

        if (!canvasId || !isValidObjectId(canvasId)) {
            return res.status(400).json({ error: "Invalid canvas ID" });
        }

        const canvas = await Canvas.findById(canvasId);
        if (!canvas) {
            return res.status(404).json({ error: "Canvas not found" });
        }

        if (canvas.owner.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Only the owner can delete this canvas" });
        }

        await Canvas.findByIdAndDelete(canvasId);
        res.json({ message: "Canvas deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete canvas", details: error.message });
    }
};

exports.getUserCanvases = async (req, res) => {
    try {
        const userId = req.userId;

        const canvases = await Canvas.find({
            $or: [{ owner: userId }, { shared: userId }]
        })
        .populate("owner", "email")
        .sort({ createdAt: -1 });

        res.json(canvases);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch canvases", details: error.message });
    }
};