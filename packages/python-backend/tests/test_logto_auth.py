import base64
import json
import importlib.util
import inspect
import sys
import time
import unittest
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi import Request


_MODULE_PATH = Path(__file__).parents[1] / "src" / "multi_publish" / "auth" / "logto.py"
_SPEC = importlib.util.spec_from_file_location("multi_publish_logto_auth_test_target", _MODULE_PATH)
logto_auth = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = logto_auth
_SPEC.loader.exec_module(logto_auth)


def _encode(value: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=").decode()


def _token(private_key, claims: dict, kid: str = "key-1") -> str:
    header = _encode({"alg": "RS256", "typ": "JWT", "kid": kid})
    payload = _encode(claims)
    signing_input = f"{header}.{payload}".encode()
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    return f"{header}.{payload}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


class LogtoAuthTest(unittest.TestCase):
    def test_fastapi_dependency_declares_request_type(self):
        dependency = logto_auth.create_fastapi_dependency(
            logto_auth.LogtoJwtVerifier("https://id.example.com", "audience")
        )
        parameter = inspect.signature(dependency).parameters["request"]
        self.assertIn(parameter.annotation, (Request, "Request"))

    def test_rejects_insecure_non_local_issuer(self):
        with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_ISSUER_INVALID"):
            logto_auth.LogtoJwtVerifier("http://id.example.com", "audience")

    def test_allows_http_localhost_for_development(self):
        verifier = logto_auth.LogtoJwtVerifier("http://127.0.0.1:8080", "audience")
        self.assertEqual(verifier.issuer, "http://127.0.0.1:8080")

    def test_rejects_cross_origin_jwks_without_trust(self):
        async def fetcher(url):
            class Response:
                status_code = 200

                def json(self):
                    if url.endswith("openid-configuration"):
                        return {"issuer": "https://id.example.com", "jwks_uri": "https://keys.example.net/jwks"}
                    return {"keys": []}

            return Response()

        verifier = logto_auth.LogtoJwtVerifier("https://id.example.com", "audience", fetcher=fetcher)
        with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_DISCOVERY_INVALID"):
            import asyncio

            asyncio.run(verifier._get_keys())

    def test_allows_cross_origin_jwks_from_explicitly_trusted_host(self):
        async def fetcher(url):
            class Response:
                status_code = 200

                def json(self):
                    if url.endswith("openid-configuration"):
                        return {"issuer": "https://id.example.com", "jwks_uri": "https://keys.example.net/jwks"}
                    return {"keys": []}

            return Response()

        verifier = logto_auth.LogtoJwtVerifier(
            "https://id.example.com",
            "audience",
            fetcher=fetcher,
            trusted_jwks_hosts=frozenset({"keys.example.net"}),
        )
        import asyncio

        self.assertEqual(asyncio.run(verifier._get_keys()), {})

    def test_rejects_malformed_jwks_url_as_auth_error(self):
        async def fetcher(url):
            class Response:
                status_code = 200

                def json(self):
                    return {"issuer": "https://id.example.com", "jwks_uri": "https://id.example.com:bad/jwks"}

            return Response()

        verifier = logto_auth.LogtoJwtVerifier("https://id.example.com", "audience", fetcher=fetcher)
        with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_DISCOVERY_INVALID"):
            import asyncio

            asyncio.run(verifier._get_keys())

    def test_fetch_errors_are_normalized_to_auth_error(self):
        async def fetcher(_url):
            raise TimeoutError("network down")

        verifier = logto_auth.LogtoJwtVerifier("https://id.example.com", "audience", fetcher=fetcher)
        with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_JWKS_UNAVAILABLE"):
            import asyncio

            asyncio.run(verifier._get_keys())

    def test_jwks_filters_encryption_and_non_rsa_keys(self):
        async def fetcher(url):
            class Response:
                status_code = 200

                def json(self):
                    if url.endswith("openid-configuration"):
                        return {"issuer": "https://id.example.com", "jwks_uri": "https://id.example.com/jwks"}
                    return {
                        "keys": [
                            {"kid": "enc", "kty": "RSA", "use": "enc", "alg": "RSA-OAEP", "n": "bad", "e": "AQAB"},
                            {"kid": "ec", "kty": "EC", "use": "sig", "alg": "ES256"},
                        ]
                    }

            return Response()

        verifier = logto_auth.LogtoJwtVerifier("https://id.example.com", "audience", fetcher=fetcher)
        import asyncio

        self.assertEqual(asyncio.run(verifier._get_keys()), {})

    def test_verify_logto_jwt_checks_signature_claims_and_scopes(self):
        AuthError = logto_auth.AuthError
        require_scopes = logto_auth.require_scopes
        verify_logto_jwt = logto_auth.verify_logto_jwt

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        now = int(time.time())
        claims = {
            "sub": "sub-1",
            "iss": "https://id.example.com/oidc",
            "aud": "https://api.multi-publish.com",
            "scope": "publish:read publish:submit",
            "iat": now - 10,
            "exp": now + 300,
        }
        token = _token(private_key, claims)
        auth = verify_logto_jwt(
            token,
            public_key=private_key.public_key(),
            issuer=claims["iss"],
            audience=claims["aud"],
            now=now,
        )
        self.assertEqual(auth, {"subject": "sub-1", "scopes": ["publish:read", "publish:submit"]})
        self.assertTrue(require_scopes(auth, ["publish:submit"]))
        with self.assertRaisesRegex(AuthError, "AUTH_SCOPE_MISSING"):
            require_scopes(auth, ["admin:users"])
        with self.assertRaisesRegex(AuthError, "AUTH_AUDIENCE_INVALID"):
            verify_logto_jwt(
                token,
                public_key=private_key.public_key(),
                issuer=claims["iss"],
                audience="https://wrong.example",
                now=now,
            )

    def test_rejects_algorithm_downgrade_and_expired_token(self):
        AuthError = logto_auth.AuthError
        verify_logto_jwt = logto_auth.verify_logto_jwt

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        now = int(time.time())
        expired = _token(
            private_key,
            {"sub": "sub-1", "iss": "issuer", "aud": "audience", "iat": now - 500, "exp": now - 120},
        )
        with self.assertRaisesRegex(AuthError, "AUTH_TOKEN_EXPIRED"):
            verify_logto_jwt(
                expired,
                public_key=private_key.public_key(),
                issuer="issuer",
                audience="audience",
                now=now,
            )
        _, payload, signature = expired.split(".")
        bad_header = _encode({"alg": "none", "typ": "JWT", "kid": "key-1"})
        with self.assertRaisesRegex(AuthError, "AUTH_ALGORITHM_INVALID"):
            verify_logto_jwt(
                f"{bad_header}.{payload}.{signature}",
                public_key=private_key.public_key(),
                issuer="issuer",
                audience="audience",
                now=now,
            )

    def test_non_string_or_list_scope_never_grants_permission(self):
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        now = int(time.time())
        token = _token(
            private_key,
            {"sub": "sub-1", "iss": "issuer", "aud": "audience", "scope": 123, "exp": now + 300},
        )

        auth = logto_auth.verify_logto_jwt(
            token,
            public_key=private_key.public_key(),
            issuer="issuer",
            audience="audience",
            now=now,
        )

        self.assertEqual(auth["scopes"], [])
        with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_SCOPE_MISSING"):
            logto_auth.require_scopes(auth, ["123"])

    def test_rejects_non_finite_and_boolean_numeric_dates(self):
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        now = int(time.time())
        base_claims = {"sub": "sub-1", "iss": "issuer", "aud": "audience", "exp": now + 300}

        for invalid_exp in (True, float("nan"), float("inf"), float("-inf")):
            with self.subTest(exp=invalid_exp):
                token = _token(private_key, {**base_claims, "exp": invalid_exp})
                with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_TOKEN_EXPIRED"):
                    logto_auth.verify_logto_jwt(
                        token,
                        public_key=private_key.public_key(),
                        issuer="issuer",
                        audience="audience",
                        now=now,
                    )

        for invalid_nbf in (True, float("nan"), float("inf"), float("-inf")):
            with self.subTest(nbf=invalid_nbf):
                token = _token(private_key, {**base_claims, "nbf": invalid_nbf})
                with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_TOKEN_NOT_ACTIVE"):
                    logto_auth.verify_logto_jwt(
                        token,
                        public_key=private_key.public_key(),
                        issuer="issuer",
                        audience="audience",
                        now=now,
                    )

        for invalid_nbf in (None, "123"):
            with self.subTest(nbf=invalid_nbf):
                token = _token(private_key, {**base_claims, "nbf": invalid_nbf})
                with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_TOKEN_NOT_ACTIVE"):
                    logto_auth.verify_logto_jwt(
                        token,
                        public_key=private_key.public_key(),
                        issuer="issuer",
                        audience="audience",
                        now=now,
                    )

    def test_malformed_base64_is_normalized_to_auth_error(self):
        with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_TOKEN_INVALID"):
            logto_auth._decode_part("a")

    def test_invalid_discovery_is_not_cached_for_a_later_request(self):
        calls = []

        async def fetcher(url):
            calls.append(url)

            class Response:
                status_code = 200

                def json(self):
                    if url.endswith("openid-configuration"):
                        return {"issuer": "https://id.example.com", "jwks_uri": "http://127.0.0.1:9/private"}
                    return {"keys": []}

            return Response()

        verifier = logto_auth.LogtoJwtVerifier("https://id.example.com", "audience", fetcher=fetcher)
        import asyncio

        for _ in range(2):
            with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_DISCOVERY_INVALID"):
                asyncio.run(verifier._get_keys())
        self.assertEqual(calls.count("https://id.example.com/.well-known/openid-configuration"), 2)
        self.assertEqual(verifier._discovery, None)

    def test_unknown_kid_refresh_is_single_flight_and_bounded(self):
        calls = []

        async def fetcher(url):
            calls.append(url)

            class Response:
                status_code = 200

                def json(self):
                    if url.endswith("openid-configuration"):
                        return {"issuer": "https://id.example.com", "jwks_uri": "https://id.example.com/jwks"}
                    return {"keys": []}

            return Response()

        verifier = logto_auth.LogtoJwtVerifier(
            "https://id.example.com", "audience", fetcher=fetcher,
            unknown_kid_cache_ttl_seconds=60, forced_refresh_cooldown_seconds=60,
            unknown_kid_cache_max=8,
        )
        import asyncio

        def unknown_token(kid):
            return f'{_encode({"alg": "RS256", "kid": kid})}.{_encode({"sub": "x"})}.AA'

        async def run():
            return await asyncio.gather(
                *(verifier.verify(unknown_token(f"random-{index}")) for index in range(100)),
                return_exceptions=True,
            )

        errors = asyncio.run(run())
        self.assertTrue(all(isinstance(error, logto_auth.AuthError) for error in errors))
        self.assertLessEqual(calls.count("https://id.example.com/jwks"), 2)
        self.assertLessEqual(len(verifier._unknown_kid_cache), 8)
        with self.assertRaisesRegex(logto_auth.AuthError, "AUTH_KEY_NOT_FOUND"):
            asyncio.run(verifier.verify(unknown_token("x" * 129)))


if __name__ == "__main__":
    unittest.main()
