# CODAL relay deployment

This file is the hardened replacement for the relay's current PHP front controller.

1. Back up the current relay entrypoint on the cPanel host.
2. Upload this file as the front controller in the document root used by
   `https://codal-relay.codal.mytestdomain123.ir`.
3. Keep the existing relay hostname and `CODAL_DOCUMENT_RELAY_URL` unchanged.
4. Confirm PHP cURL is enabled and outbound HTTPS requests to the approved CODAL
   hosts are allowed.
5. Test an Excel URL and a PDF URL from an authenticated/controlled environment.
   Do not expose a public endpoint that can proxy arbitrary domains.

The relay accepts only HTTPS on port 443 for `codal.ir`, `www.codal.ir` and
`excel.codal.ir`. Redirects are followed manually and each destination is
revalidated. The response is streamed into a bounded buffer with a 32 MiB cap.

Do not expand the host allowlist unless a real CODAL announcement has been
inspected and its official document host confirmed.
