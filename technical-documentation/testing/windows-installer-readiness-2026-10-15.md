# Windows installer/update readiness — 2026-10-15

**Status: installer execution is pending a host reboot and a newer QA candidate.
No host installation, upgrade, uninstall, merge or release was performed.**

Work continues in the isolated `test/studio-windows-preflight` worktree. The prior
[fresh voice/project checks](windows-preflight-2026-10-15.md) remain valid for
their recorded CI binary; they do not validate the additional updater source
change in this pass.

## Installer identity and version gate

Read-only inspection of the installed ASAR and Windows uninstall registration
shows `1.10.0-subscription.12`. The final production-workflow CI candidate is
still `1.10.0-subscription.11`, source `35a7da3b`, so it is **not an upgrade**.
Both use `io.github.purpleprintai.openscreen-subscription` and the NSIS GUID
`e088f995-f6f1-5758-98eb-9a95cc984d0e`.

The matching electron-builder NSIS sources read the existing uninstall registry
and invoke the old uninstaller before replacing application files. Selecting a
different directory or passing `/D` is therefore **not installation isolation**.
Neither cached installer was executed on the host.

Verified local installer inputs:

| Role | Version | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Existing-version baseline | `1.10.0-subscription.12` | 245,994,029 | `ab32a87267e44a924fcd7e6036d6b28f1cab6cef7adb4850add6eff2181bae2a` |
| Current CI candidate, unsuitable for upgrade | `1.10.0-subscription.11` | 246,454,947 | `379f989437d08b9b76d28d778d4be42ba4251db90fd22a9836249fdc277aa55c` |

The next installation candidate must include the reviewed source changes and be
semantically newer than `.12`. Changing only an installer filename or feed version
would not establish that; verify ASAR metadata, PE version and feed identity after
building. Creating a QA candidate does not authorize publishing a release.

## Updater eligibility correction

The installed electron-updater API returns `updateInfo` even when
`isUpdateAvailable` is false (older version, unsupported update or staged rollout).
The wrapper previously inferred eligibility merely from a different version
string. Five targeted regression cases reproduced incorrect eligibility before
the fix. The wrapper now requires the updater's explicit positive verdict and a
strictly newer semantic version, with six regression cases including `.12 → .11`.

The outer GitHub release check already filters older published versions in the
normal flow. This correction hardens the inner eligibility result against feed/
cache/eligibility disagreement; **no actual downgrade or unrequested installation
was observed**. Automatic download/install-on-quit remain disabled, and no update
payload was downloaded by these tests.

Validation of the source change:

- Relevant updater/release/install-channel suites: **53 passed**.
- Full Windows suite: **221 files, 2,462 passed / 5 skipped**.
- App and test TypeScript checks, changed-file Biome and production Vite build
  passed. This did not start a QA app or build a new installer.
- The new source has not yet been verified in a new Windows CI installer.

## Sandbox activation

The host is Windows 11 Pro. Sandbox was disabled; no configured Windows Sandbox,
VirtualBox or VMware executable was available for immediate isolated installation.
The owner explicitly approved activating Sandbox and handling UAC personally.

An elevated helper enabled `Containers-DisposableClientVM` and its required
dependencies using **`-All -LimitAccess -NoRestart`**. It completed successfully:
state `Disabled → Enabled`, **RestartNeeded=true**. No automatic reboot was
requested, and online Windows Update feature-source downloads were disallowed.
Execution policy and Windows security warnings were not bypassed. The helper
finished; Sandbox itself and the installers were not launched.

Evidence is local under `D:/purpleprint-build/studio-installer-validation-20261015`:
activation result/transcript, installer identity checks, failing/passing regression
logs, full tests and build output. Do not publish account-specific registry/log data.

## Resume after the owner's reboot

1. Confirm Sandbox is available and that no reboot is still required. Do not
   enable unrelated Windows features or download additional components silently.
2. Prepare a newer, unpublished QA installer with matching version metadata and
   checksums. Obtain approval before additional downloads or host replacement.
3. In disposable Windows only: verify clean install, registry/shortcut paths and
   startup; install the `.12` baseline with copied fixtures, then upgrade to the
   newer candidate and verify project/chat/settings preservation and uninstall.
4. Exercise update eligibility/download/install as separate gates; distinguish a
   controlled local feed from real signed distribution and automatic-update proof.
5. Shut down the guest/QA apps and confirm the host installation remains unchanged.

Computer Use remains prohibited. The host's installed app and Claude work remain
untouched. A Sandbox test cannot substitute for another physical GPU/driver or
real recording/OS-dialog checks.
