import json
import hashlib
import base64
from typing import Dict, Optional

import redis.asyncio as aioredis
from cryptography.fernet import Fernet, MultiFernet

from gateway.config import settings


def _derive_fernet_key(secret: str) -> bytes:
    """Derive a stable Fernet key from a secret via SHA-256."""
    return base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())


def _get_multifernet() -> MultiFernet:
    """MultiFernet over [current, *previous] data-encryption keys (key rotation).

    Encrypts with the current key, decrypts with any configured key, so rotating
    the secret keeps existing vault entries readable during the grace window.

    DB4 key split: the current key is the dedicated ``encryption_secret``,
    falling back to ``jwt_secret`` when unset (back-compat with vaults written
    before signing/encryption keys were separated). Previous keys come from
    ``encryption_previous_secrets``, falling back to ``jwt_previous_secrets``.
    """
    current = settings.encryption_secret or settings.jwt_secret
    previous = (
        getattr(settings, "encryption_previous_secrets", "")
        or getattr(settings, "jwt_previous_secrets", "")
        or ""
    )
    secrets_list = [current]
    secrets_list += [s.strip() for s in previous.split(",") if s.strip()]
    return MultiFernet([Fernet(_derive_fernet_key(s)) for s in secrets_list])


class SessionStore:
    def __init__(self, redis_url: str):
        self.redis = aioredis.from_url(redis_url, decode_responses=True)
        self.fernet = _get_multifernet()
        self.TTL = 3600  # 1 hour

    # --- Provider config ---

    async def set_provider_config(self, session_id: str, config: dict) -> None:
        if config.get("api_key"):
            config["api_key"] = self.fernet.encrypt(
                config["api_key"].encode()
            ).decode()
        key = f"session:{session_id}:provider"
        await self.redis.setex(key, self.TTL, json.dumps(config))

    async def get_provider_config(self, session_id: str) -> Optional[dict]:
        key = f"session:{session_id}:provider"
        data = await self.redis.get(key)
        if not data:
            return None
        config = json.loads(data)
        if config.get("api_key"):
            config["api_key"] = self.fernet.decrypt(
                config["api_key"].encode()
            ).decode()
        return config

    # --- Session ownership (DB3: bind a session to its creator) ---

    async def set_session_owner(self, session_id: str, sub: str, tenant: str) -> None:
        key = f"session:{session_id}:owner"
        await self.redis.setex(key, self.TTL, json.dumps({"sub": sub, "tenant": tenant}))

    async def get_session_owner(self, session_id: str) -> Optional[dict]:
        data = await self.redis.get(f"session:{session_id}:owner")
        return json.loads(data) if data else None

    # --- Token map ---

    async def set_token_map(self, session_id: str, token_map: Dict[str, str]) -> None:
        # DB2: the token map is the token->real-PII reversal vault. Encrypt it at
        # rest so raw PII never sits readable in Redis.
        key = f"session:{session_id}:tokens"
        blob = self.fernet.encrypt(json.dumps(token_map).encode()).decode()
        await self.redis.setex(key, self.TTL, blob)

    async def get_token_map(self, session_id: str) -> Dict[str, str]:
        key = f"session:{session_id}:tokens"
        data = await self.redis.get(key)
        if not data:
            return {}
        return json.loads(self.fernet.decrypt(data.encode()).decode())

    async def update_token_map(self, session_id: str, new_tokens: Dict[str, str]) -> None:
        existing = await self.get_token_map(session_id)
        existing.update(new_tokens)
        await self.set_token_map(session_id, existing)

    # --- Per-entity counters (for deterministic token numbering) ---

    async def get_or_create_token_for_hash(
        self, session_id: str, val_hash: str, entity_type: str, short: str
    ) -> str:
        """
        If val_hash already has a token in this session, return it.
        Otherwise, increment the entity counter and create a new token.
        """
        hash_key = f"session:{session_id}:hash:{val_hash}"
        existing = await self.redis.get(hash_key)
        if existing:
            return existing

        counter_key = f"session:{session_id}:counter:{entity_type}"
        count = await self.redis.incr(counter_key)
        await self.redis.expire(counter_key, self.TTL)

        token = f"{{{{{short}_{count}}}}}"
        # Atomic claim (R4): only the first of two concurrent callers for the same
        # value wins the SET NX; the loser reads the winner's token instead of
        # minting a second token for one value. A skipped counter value is a
        # harmless gap in numbering.
        won = await self.redis.set(hash_key, token, nx=True, ex=self.TTL)
        if won:
            return token
        winner = await self.redis.get(hash_key)
        return winner if winner else token

    async def close(self) -> None:
        await self.redis.aclose()
