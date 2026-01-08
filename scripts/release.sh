#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Parallax Node.js SDK Release Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if logged in to npm
echo -e "${YELLOW}Checking npm login status...${NC}"
if ! npm whoami &> /dev/null; then
    echo -e "${RED}Not logged in to npm. Starting login...${NC}"
    npm login
    echo ""
fi

NPM_USER=$(npm whoami)
echo -e "${GREEN}Logged in as: ${NPM_USER}${NC}"
echo ""

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "Current version: ${YELLOW}${CURRENT_VERSION}${NC}"

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Calculate next versions
NEXT_PATCH="$MAJOR.$MINOR.$((PATCH + 1))"
NEXT_MINOR="$MAJOR.$((MINOR + 1)).0"
NEXT_MAJOR="$((MAJOR + 1)).0.0"

echo ""
echo -e "${BLUE}Select release type:${NC}"
echo -e "  ${GREEN}1)${NC} patch  → ${NEXT_PATCH}  (bug fixes)"
echo -e "  ${GREEN}2)${NC} minor  → ${NEXT_MINOR}  (new features, backwards compatible)"
echo -e "  ${GREEN}3)${NC} major  → ${NEXT_MAJOR}  (breaking changes)"
echo -e "  ${GREEN}4)${NC} cancel"
echo ""

read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        RELEASE_TYPE="patch"
        NEXT_VERSION=$NEXT_PATCH
        ;;
    2)
        RELEASE_TYPE="minor"
        NEXT_VERSION=$NEXT_MINOR
        ;;
    3)
        RELEASE_TYPE="major"
        NEXT_VERSION=$NEXT_MAJOR
        ;;
    4)
        echo -e "${YELLOW}Release cancelled.${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${YELLOW}Releasing version ${NEXT_VERSION}...${NC}"
echo ""

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}Error: You have uncommitted changes.${NC}"
    echo "Please commit or stash your changes before releasing."
    git status --short
    exit 1
fi

# Run tests
echo -e "${BLUE}Running tests...${NC}"
npm test

# Build
echo -e "${BLUE}Building...${NC}"
npm run build

# Bump version and create git tag
echo -e "${BLUE}Bumping version...${NC}"
npm version $RELEASE_TYPE

# Push to git with tags
echo -e "${BLUE}Pushing to git...${NC}"
git push --follow-tags

# Publish to npm
echo -e "${BLUE}Publishing to npm...${NC}"
npm publish

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Successfully released v${NEXT_VERSION}${NC}"
echo -e "${GREEN}========================================${NC}"
