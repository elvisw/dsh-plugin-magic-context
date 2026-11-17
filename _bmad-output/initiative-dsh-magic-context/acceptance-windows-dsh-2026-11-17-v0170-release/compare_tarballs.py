"""Compare local and registry tarballs for the 0.17.0 release packet."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import tarfile


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha1(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def members(path: Path) -> dict[str, bytes]:
    with tarfile.open(path) as archive:
        return {
            member.name: archive.extractfile(member).read()
            for member in archive.getmembers()
            if member.isfile()
        }


def normalized(value: bytes) -> bytes:
    return value.replace(b"\r\n", b"\n")


def compare(local: Path, registry: Path, previous: Path | None) -> dict:
    local_members = members(local)
    registry_members = members(registry)
    member_diff = sorted(
        name
        for name in set(local_members) | set(registry_members)
        if local_members.get(name) != registry_members.get(name)
    )
    result = {
        "localTarball": str(local),
        "localSha256": sha256(local),
        "localSha1": sha1(local),
        "localBytes": local.stat().st_size,
        "localFiles": len(local_members),
        "registryTarball": str(registry),
        "registrySha256": sha256(registry),
        "registrySha1": sha1(registry),
        "registryBytes": registry.stat().st_size,
        "registryFiles": len(registry_members),
        "registryIntegritySha512": base64.b64encode(
            hashlib.sha512(registry.read_bytes()).digest()
        ).decode(),
        "byteIdentical": local.read_bytes() == registry.read_bytes(),
        "memberContentDiff": member_diff,
    }
    if previous is not None:
        previous_members = members(previous)
        names = set(previous_members) | set(local_members)
        result["previousTarball"] = str(previous)
        result["previousSha256"] = sha256(previous)
        result["previousBytes"] = previous.stat().st_size
        result["rawChangedMembers"] = sorted(
            name
            for name in names
            if previous_members.get(name) != local_members.get(name)
        )
        result["normalizedChangedMembers"] = sorted(
            name
            for name in names
            if normalized(previous_members.get(name, b""))
            != normalized(local_members.get(name, b""))
        )
        result["libNormalizedChanged"] = [
            name
            for name in result["normalizedChangedMembers"]
            if name.startswith("package/lib/")
        ]
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--local", type=Path, required=True)
    parser.add_argument("--registry", type=Path, required=True)
    parser.add_argument("--previous", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    result = compare(args.local, args.registry, args.previous)
    text = json.dumps(result, indent=2) + "\n"
    if args.out:
        args.out.write_text(text, encoding="utf-8", newline="\n")
    print(text, end="")


if __name__ == "__main__":
    main()
