#!/usr/bin/env node
/**
 * make-admin.js — run ONCE to promote an email address to admin
 * Usage: node make-admin.js nittishj@outlook.com
 */
require("dotenv").config();
const mongoose = require("mongoose");

const email = process.argv[2];
if (!email) {
  console.error("Usage: node make-admin.js <email>");
  process.exit(1);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = mongoose.model(
    "User",
    new mongoose.Schema(
      { name: String, email: String, role: String },
      { strict: false },
    ),
  );
  const user = await User.findOne({ email });
  if (!user) {
    console.error("No user found with email:", email);
    process.exit(1);
  }
  user.role = "admin";
  await user.save();
  console.log(`✅ ${user.name} (${email}) is now an admin.`);
  await mongoose.disconnect();
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
