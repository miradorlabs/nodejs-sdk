# Contributing to @miradorlabs/node

Thank you for your interest in contributing to the Mirador Node.js SDK! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Contributing to @miradorlabs/node](#contributing-to-miradorlabsnode)
  - [Table of Contents](#table-of-contents)
  - [Code of Conduct](#code-of-conduct)
  - [Getting Started](#getting-started)
  - [Development Setup](#development-setup)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Project Structure](#project-structure)
    - [Running the Example CLI](#running-the-example-cli)
  - [Making Changes](#making-changes)
  - [Testing](#testing)
    - [Writing Tests](#writing-tests)
  - [Submitting a Pull Request](#submitting-a-pull-request)
    - [PR Guidelines](#pr-guidelines)
  - [Release Process](#release-process)
  - [Questions?](#questions)

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all experience levels.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/nodejs-client.git
   cd nodejs-client
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/miradorlabs/nodejs-client.git
   ```

## Development Setup

### Prerequisites

- Node.js (see `.nvmrc` for version)
- npm

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

### Project Structure

```
nodejs-client/
├── src/           # Source code
├── tests/         # Test files
├── dist/          # Built output (generated)
├── example/       # Example usage and CLI
├── scripts/       # Build and utility scripts
└── index.ts       # Main entry point
```

### Running the Example CLI

```bash
# Requires MIRADOR_API_KEY in .env
npm run cli
```

## Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes following our coding standards:
   - Use TypeScript for all new code
   - Follow the existing code style
   - Run linting before committing

3. Write commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) format:

   ```text
   type(scope): description
   ```

   Common types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`, `ci`, `perf`, `build`

   Examples:

   ```text
   feat: add retry logic to gRPC client
   fix(grpc): handle null response from server
   chore: update dependencies
   ```

   A commit-msg hook enforced by [commitlint](https://commitlint.js.org/) will reject non-conforming messages.

4. Run linting:
   ```bash
   npm run lint        # Check for issues
   npm run lint:fix    # Auto-fix issues
   ```

## Testing

We use Jest for testing. Please add tests for any new functionality.

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Place test files in the `tests/` directory
- Name test files with `.test.ts` suffix
- Aim for meaningful test coverage of new features
- Mock gRPC calls where appropriate

## Submitting a Pull Request

1. Ensure all tests pass and linting is clean
2. Push your branch to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```

3. Open a Pull Request against the `main` branch

4. Fill out the PR template with:
   - A clear description of the changes
   - Any related issues
   - Testing performed

5. Wait for review and address any feedback

### PR Guidelines

- Keep PRs focused and reasonably sized
- One feature or fix per PR
- Update documentation if needed
- Add tests for new functionality

## Release Process

Releases are managed by maintainers using semantic versioning:

```bash
npm run release:patch  # Bug fixes (1.0.0 -> 1.0.1)
npm run release:minor  # New features (1.0.0 -> 1.1.0)
npm run release:major  # Breaking changes (1.0.0 -> 2.0.0)
```

## Questions?

If you have questions about contributing, please open an issue for discussion.

Thank you for contributing!
