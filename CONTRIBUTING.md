# Contributing to AgentIDP

This repository holds the protocol draft in `spec/` and the TypeScript packages in `packages/`.

## How to contribute

### Feedback

- Open an issue for questions, ambiguities, or errors in the spec or SDKs.
- Keep registry-hosting work in `agentidp/registry`.

### Spec edits

1. Fork this repository.
2. Branch from `main` with a descriptive name (e.g. `docs/ait-lifetime`).
3. Edit files under `spec/`.
4. Open a pull request with:
   - A clear title
   - What was wrong or unclear
   - What the edit changes
   - Whether it breaks a previous draft assumption

### SDK edits

1. Branch from `main`.
2. Change `packages/sdk` and/or `packages/verify`.
3. Keep Apache-2.0. Do not publish to npm from a contributor machine. See [docs/npm-publish.md](docs/npm-publish.md).
4. Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
5. Update the package `CHANGELOG.md` when the public API or version changes.
6. Open a pull request. Do not commit secrets, `.npmrc` tokens, or npm credentials; tests generate keys at runtime.

### Security

If you find a problem in the protocol design or SDK that should not be public yet, email security@gudlab.org.

## RFC process

1. **Draft** - change submitted as a PR.
2. **Review** - at least 30 days of comment for material spec changes.
3. **Revision** - author addresses feedback.
4. **Acceptance** - maintainers merge into the next spec version.

Major version changes (e.g. v1.0.0) use a 90-day comment period.

## License

By contributing, you agree that your contributions are licensed under Apache 2.0.
