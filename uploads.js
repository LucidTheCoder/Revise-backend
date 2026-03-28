/**
 * Uploads Module — Multer + Cloudinary
 *
 * Handles:
 *   - Profile pictures / avatars  (images → Cloudinary)
 *   - Topic images / diagrams     (images → Cloudinary)
 *   - PDFs (past papers / notes)  (PDFs   → Cloudinary)
 *
 * Install: npm install multer cloudinary multer-storage-cloudinary
 */

const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// ============================================================================
// CLOUDINARY CONFIG
// ============================================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ============================================================================
// STORAGE CONFIGS
// One storage config per upload type so files land in organised folders.
// ============================================================================

// --- Profile pictures ---
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "revise/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [
      { width: 256, height: 256, crop: "fill", gravity: "face" },
    ],
    // Auto-generates a unique public_id, e.g. revise/avatars/abc123
  },
});

// --- Topic images / diagrams ---
const topicImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "revise/topic-images",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif", "svg"],
    transformation: [{ width: 1200, crop: "limit" }], // cap width, preserve aspect ratio
  },
});

// --- PDFs ---
const pdfStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "revise/pdfs",
    allowed_formats: ["pdf"],
    resource_type: "raw", // required for non-image files
  },
});

// ============================================================================
// FILE FILTERS
// Extra validation before multer accepts the file.
// ============================================================================

function imageFilter(req, file, cb) {
  // Validate declared MIME type (browser-provided, can be spoofed)
  const allowedMime = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ];
  if (!allowedMime.includes(file.mimetype)) {
    return cb(
      new Error("Only image files are allowed (jpg, png, webp, gif, svg)."),
      false,
    );
  }
  // Block double-extensions like "shell.php.jpg" which can bypass naive checks
  const originalName = (file.originalname || "").toLowerCase();
  const dangerousExtensions =
    /\.(php|php3|php4|php5|phtml|asp|aspx|jsp|cgi|sh|exe|bat|cmd|pl|py|rb)(\.|$)/;
  if (dangerousExtensions.test(originalName)) {
    return cb(new Error("File name contains a dangerous extension."), false);
  }
  // Restrict filename to safe characters
  const safeName = /^[a-zA-Z0-9._\- ]+$/;
  if (!safeName.test(originalName)) {
    return cb(new Error("File name contains invalid characters."), false);
  }
  cb(null, true);
}

function pdfFilter(req, file, cb) {
  if (file.mimetype !== "application/pdf") {
    return cb(new Error("Only PDF files are allowed."), false);
  }
  const originalName = (file.originalname || "").toLowerCase();
  if (!originalName.endsWith(".pdf")) {
    return cb(new Error("File must have a .pdf extension."), false);
  }
  // Block double-extension attacks
  const dangerousExtensions = /\.(php|asp|aspx|jsp|sh|exe|bat|pl|py|rb)\./;
  if (dangerousExtensions.test(originalName)) {
    return cb(new Error("File name contains a dangerous extension."), false);
  }
  cb(null, true);
}

// ============================================================================
// MULTER INSTANCES
// ============================================================================

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; //  5 MB
const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: imageFilter,
}).single("avatar"); // field name in the form

const uploadTopicImage = multer({
  storage: topicImageStorage,
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: imageFilter,
}).single("image");

const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: MAX_PDF_SIZE },
  fileFilter: pdfFilter,
}).single("pdf");

// ============================================================================
// MULTER ERROR WRAPPER
// Multer passes errors via callback, not next() — this normalises it.
// ============================================================================

function handleUpload(uploadFn) {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "File is too large."
            : `Upload error: ${err.message}`;
        return res.status(400).json({ success: false, error: message });
      }

      // Custom filter errors (wrong file type, etc.)
      return res.status(400).json({ success: false, error: err.message });
    });
  };
}

// ============================================================================
// CLOUDINARY DELETE HELPER
// Call this when replacing or removing an existing upload.
// ============================================================================

async function deleteFile(publicId, resourceType = "image") {
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  } catch (err) {
    console.error("Cloudinary delete failed:", err.message);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  handleUpload,
  uploadAvatar,
  uploadTopicImage,
  uploadPdf,
  deleteFile,
};
