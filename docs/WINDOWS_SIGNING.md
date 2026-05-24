# Windows Signing

OpenBrief currently distributes the Windows build as an unsigned Tauri NSIS
installer:

```text
OpenBrief_<version>_x64-setup.exe
```

This is acceptable for early open-source releases when the installer is built by
GitHub Actions, uploaded to GitHub Releases, and accompanied by clear user
messaging. The main downside is user trust and SmartScreen friction: Windows may
warn users that the installer is unsigned or has limited reputation.

## Current Decision

- Keep shipping the NSIS `.exe` installer as the primary Windows download.
- Do not switch to MSI unless enterprise deployment becomes a requirement.
- Defer Windows code signing until an active Azure tenant or another signing
  provider is ready.
- Publish SHA256 checksums for release assets before broader Windows promotion.
- Add website/release copy that says Windows builds are currently unsigned.

## Why Signing Is Deferred

Azure Artifact Signing is the preferred future path, but setup is currently
blocked by the Microsoft Entra sign-in error:

```text
AADSTS5000225: This tenant has been blocked due to inactivity.
```

That is an Azure tenant lifecycle/account issue, not a repository issue. The
repo should not block Windows distribution on this until there is an active
Azure tenant or another signing provider.

## Future Preferred Path

Use Azure Artifact Signing, formerly Azure Trusted Signing, with GitHub Actions.
This keeps private signing material out of GitHub Secrets and works well with
modern cloud/HSM-backed certificates.

Reference docs:

- https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
- https://v2.tauri.app/distribute/sign/windows/
- https://v2.tauri.app/distribute/windows-installer/

## Azure Setup Tasks

1. Create or select an active Azure tenant and subscription.
2. Register the `Microsoft.CodeSigning` resource provider.
3. Create an Azure Artifact Signing account in a supported region.
4. Complete public identity validation.
5. Create a public trust certificate profile for OpenBrief.
6. Create a Microsoft Entra app registration for GitHub Actions.
7. Grant the app the `Artifact Signing Certificate Profile Signer` role on the
   signing account or certificate profile scope.
8. Add GitHub repository secrets:

```text
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
AZURE_TENANT_ID
AZURE_ARTIFACT_SIGNING_ENDPOINT
AZURE_ARTIFACT_SIGNING_ACCOUNT
AZURE_ARTIFACT_SIGNING_PROFILE
```

## Repo Implementation Tasks

Once Azure signing is ready, update
`client/apps/tauri/src-tauri/tauri.conf.json` under `bundle.windows`:

```json
{
  "signCommand": "trusted-signing-cli -e %AZURE_ARTIFACT_SIGNING_ENDPOINT% -a %AZURE_ARTIFACT_SIGNING_ACCOUNT% -c %AZURE_ARTIFACT_SIGNING_PROFILE% -d OpenBrief %1"
}
```

Then update `.github/workflows/release.yml` for the `windows-x64` job:

1. Authenticate to Azure before `pnpm tauri build`.
2. Install/configure the signing CLI.
3. Expose the signing endpoint, account, and profile as environment variables.
4. Build the NSIS installer with the existing Tauri release command.
5. Verify the final installer signature before upload.

Example verification step:

```powershell
$installer = Get-ChildItem `
  "client/apps/tauri/src-tauri/target/x86_64-pc-windows-msvc/release/bundle" `
  -Recurse `
  -Filter "*setup.exe" |
  Select-Object -First 1

if (-not $installer) {
  throw "No Windows setup installer found."
}

$signature = Get-AuthenticodeSignature $installer.FullName
$signature | Format-List

if ($signature.Status -ne "Valid") {
  throw "Windows installer signature is not valid: $($signature.Status)"
}
```

## Interim Unsigned Release Checklist

Until signing is enabled:

1. Build Windows installers only from GitHub Actions.
2. Upload installers only to GitHub Releases.
3. Publish SHA256 checksums for every release asset.
4. Add release notes that say the Windows installer is currently unsigned.
5. Tell users to download only from the official GitHub release.
6. Keep the bundled binary smoke workflow passing for Windows.

Suggested Windows release note:

```text
Windows builds are currently unsigned. Windows SmartScreen may show a warning.
Only run this installer if it was downloaded from the official OpenBrief GitHub
release, and verify the SHA256 checksum when possible.
```

## MSI Guidance

Do not add MSI by default. NSIS `.exe` is the better primary installer for a
consumer/open-source desktop app. Add MSI only if OpenBrief needs managed
enterprise deployment through tools such as Intune, SCCM, Group Policy, or MSI
transforms.
