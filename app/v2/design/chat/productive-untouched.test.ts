/**
 * SPABLA · UX-01 · Guard — ensures the productive `/v2/chat` tree
 * has not been modified by the design study. Hashes the file list
 * of the productive route directory and compares it to the last
 * commit on the branch (`git ls-tree`).
 */

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const PRODUCTIVE_PATHS = [
  "app/v2/chat/page.tsx",
  "app/v2/chat/components/OtpForm.tsx",
  "app/v2/chat/components/UnauthGate.tsx",
  "app/v2/chat/components/SessionArea.tsx",
  "app/v2/chat/components/ConversationHeader.tsx",
  "app/v2/chat/components/MessageComposer.tsx",
  "app/v2/chat/components/ChatSection.tsx",
  "app/v2/chat/components/ChatPageFrame.tsx",
  "app/v2/chat/components/AppHeader.tsx",
  "app/v2/chat/components/LanguageControls.tsx",
  "app/v2/chat/components/DeveloperPanel.tsx",
  "app/v2/layout.tsx",
];

describe("UX-01 · productive tree guard", () => {
  it("no productive file has an uncommitted diff on the UX-01 branch", () => {
    for (const p of PRODUCTIVE_PATHS) {
      const diff = execSync(`git -C "${REPO_ROOT}" diff HEAD -- "${p}"`, { encoding: "utf8" });
      expect(diff, `Productive file ${p} must not carry uncommitted changes`).toBe("");
    }
  });

  it("no file inside app/v2/chat/ was added or removed since HEAD", () => {
    const status = execSync(`git -C "${REPO_ROOT}" status --porcelain -- app/v2/chat/`, { encoding: "utf8" });
    expect(status.trim(), "app/v2/chat/ must have zero tracked or untracked changes").toBe("");
  });
});
