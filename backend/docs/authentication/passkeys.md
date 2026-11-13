# Passkey / Biometric Login

Ronya uses WebAuthn passkeys. The biometric gesture (Face ID, Touch ID, Android biometrics, or the device screen lock) is verified by the operating system/authenticator. The application never receives biometric templates or images.

## Production configuration

Set these backend environment variables before enabling the feature in production:

- \`WEBAUTHN_RP_NAME\`: user-visible relying-party name (for example \`رونیا\`).
- \`WEBAUTHN_RP_ID\`: the exact registrable domain or a valid parent domain of the frontend host (without scheme or port).
- \`WEBAUTHN_ORIGIN\`: exact HTTPS frontend origin, including scheme and any non-default port. Multiple trusted origins may be comma-separated.

The origin must exactly match the frontend origin. Do not use wildcards. Keep these values consistent with the domain users open when adding Ronya to the Home Screen.

## Database

Apply migration \`20261113150000_add_passkey_biometric_login\` through the approved database migration process. It creates:

- \`PasskeyCredential\`: public credential key, credential identifier hash, signature counter and device metadata.
- \`PasskeyChallenge\`: short-lived, one-time registration/authentication challenges.

The per-user enabled/disabled preference is stored in the existing \`UserPreference\` table. No biometric data or private credential keys are stored by Ronya.

## User flow

1. A signed-in user opens Settings and registers the current device.
2. The browser invokes the platform authenticator and verifies the user.
3. The server verifies the WebAuthn attestation and stores the public key.
4. On the login page, the user may choose passkey login. The server verifies the signed assertion before issuing the normal Ronya access and refresh tokens.
5. Users can disable passkey login without deleting credentials, remove one device, or remove all devices from Settings.

The existing password and SMS recovery flows remain available.
