#!/usr/bin/env node
/* v0.17.0 — release-hardening wrapper for `cap sync android`.
 *
 * capacitor.config.ts reads CAP_RELEASE to decide whether the shipped web
 * bundle keeps remote WebView debugging enabled. Every sync that is meant
 * for packaging MUST run through this wrapper so CAP_RELEASE=1 is set
 * regardless of the host OS (no POSIX-only env prefixes in npm scripts).
 * Devs who want chrome://inspect can still run `npx cap sync android`
 * directly — that keeps debugging ON and is dev-only by definition.
 */
process.env.CAP_RELEASE = "1";
const { execSync } = require("child_process");
execSync("npx cap sync android", { stdio: "inherit", env: process.env });
