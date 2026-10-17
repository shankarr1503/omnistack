#!/bin/sh
# Install the OmniStack skill library into Claude Code, Codex and/or OpenCode.
# Usage: sh install.sh [--claude] [--codex] [--opencode] [--project DIR] [--force] [--uninstall]
# With no host flags, installs into every host whose config directory exists
# (falls back to Claude Code). Claude Code also gets the company roles as omni-* subagents.
# Existing files that differ are never overwritten without --force.
set -eu

REPO_URL="https://github.com/shankarr1503/omnistack.git"
hosts="" project="" force=0 uninstall=0
while [ $# -gt 0 ]; do
  case "$1" in
    --claude) hosts="$hosts claude" ;;
    --codex) hosts="$hosts codex" ;;
    --opencode) hosts="$hosts opencode" ;;
    --project) shift; project="${1:?--project needs a directory}" ;;
    --force) force=1 ;;
    --uninstall) uninstall=1 ;;
    -h|--help) sed -n '2,6p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 64 ;;
  esac
  shift
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || echo "")
if [ -n "$script_dir" ] && [ -d "$script_dir/library/skills" ]; then
  source_dir="$script_dir/library/skills"
else
  command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
  git clone --quiet --depth 1 "$REPO_URL" "$tmp/omnistack"
  source_dir="$tmp/omnistack/library/skills"
fi

claude_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"
claude_agents_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agents"
codex_dir="$HOME/.agents/skills"
opencode_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/skills"

if [ -n "$project" ]; then
  [ -d "$project" ] || { echo "No such directory: $project" >&2; exit 1; }
  claude_dir="$project/.claude/skills"
  claude_agents_dir="$project/.claude/agents"
  codex_dir="$project/.agents/skills"
  opencode_dir="$project/.opencode/skills"
fi

# Succeeds when the omni plugin is installed for the user (not just for one project)
# and not disabled in settings.json. Without node, any install that is not disabled counts.
plugin_enabled() {
  installed="$1/plugins/installed_plugins.json" settings="$1/settings.json"
  [ -f "$installed" ] || return 1
  if command -v node >/dev/null 2>&1; then
    node -e '
      const read = (p) => { try { return JSON.parse(require("fs").readFileSync(p, "utf8")); } catch { return {}; } };
      const entry = (read(process.argv[1]).plugins || {})["omni@omnistack"];
      const scopes = (Array.isArray(entry) ? entry : entry ? [entry] : []).map((e) => (e && e.scope) || "user");
      const enabled = (read(process.argv[2]).enabledPlugins || {})["omni@omnistack"] !== false;
      process.exit(scopes.includes("user") && enabled ? 0 : 1);
    ' "$installed" "$settings"
  else
    grep -q '"omni@omnistack"' "$installed" &&
      ! grep -Eq '"omni@omnistack"[[:space:]]*:[[:space:]]*false' "$settings" 2>/dev/null
  fi
}

if [ -z "$hosts" ]; then
  claude_home="${CLAUDE_CONFIG_DIR:-$HOME/.claude}" plugin_installed=0
  # The Claude Code plugin already provides these skills as omni:<name>; a second copy
  # would load every skill twice, so auto-detection leaves Claude Code to the plugin.
  # A --project install is for everyone who opens the project, so it never skips.
  if [ "$uninstall" -eq 0 ] && [ -z "$project" ] && plugin_enabled "$claude_home"; then
    plugin_installed=1
    echo "claude: the omni plugin is installed; skipping Claude Code (pass --claude to install anyway)"
  elif [ -d "$claude_home" ]; then
    hosts="$hosts claude"
  fi
  { [ -d "$HOME/.codex" ] || [ -d "$HOME/.agents" ]; } && hosts="$hosts codex"
  [ -d "${XDG_CONFIG_HOME:-$HOME/.config}/opencode" ] && hosts="$hosts opencode"
  if [ -z "$hosts" ]; then
    [ "$plugin_installed" -eq 1 ] && exit 0
    hosts="claude"
  fi
fi

# Company roles become Claude Code subagents named omni-<role>, so they cannot
# collide with the user's own agents. Sets agents_changed and agents_skipped.
roles_dir="$source_dir/company/roles"
install_agents() {
  agents_changed=0 agents_skipped=""
  [ -d "$roles_dir" ] || return 0
  for role in "$roles_dir"/*.md; do
    name=$(basename "$role" .md)
    dest="$claude_agents_dir/omni-$name.md"
    sed "s/^name: $name\$/name: omni-$name/" "$role" > "$tmp/agent.md"
    if [ "$uninstall" -eq 1 ]; then
      if [ -f "$dest" ] && [ ! -L "$dest" ] && cmp -s "$tmp/agent.md" "$dest"; then
        rm -f "$dest"; agents_changed=$((agents_changed + 1))
      fi
      continue
    fi
    if [ -L "$dest" ]; then agents_skipped="$agents_skipped omni-$name(symlink)"; continue; fi
    if [ -e "$dest" ] && [ "$force" -eq 0 ] && ! cmp -s "$tmp/agent.md" "$dest"; then
      agents_skipped="$agents_skipped omni-$name"; continue
    fi
    mkdir -p "$claude_agents_dir"
    cp "$tmp/agent.md" "$dest"
    agents_changed=$((agents_changed + 1))
  done
}

status=0
for host in $hosts; do
  case "$host" in
    claude) target="$claude_dir" ;;
    codex) target="$codex_dir" ;;
    opencode) target="$opencode_dir" ;;
  esac
  installed=0 skipped=""
  for skill in "$source_dir"/*/; do
    name=$(basename "$skill")
    dest="$target/$name"
    if [ "$uninstall" -eq 1 ]; then
      # Remove only an exact, unmodified copy; any edited or added file keeps the skill.
      if [ -d "$dest" ] && [ ! -L "$dest" ] && diff -rq "$skill" "$dest" >/dev/null 2>&1; then
        rm -rf "$dest"; installed=$((installed + 1))
      fi
      continue
    fi
    if [ -L "$dest" ]; then skipped="$skipped $name(symlink)"; continue; fi
    if [ -e "$dest" ] && [ "$force" -eq 0 ] && ! diff -rq "$skill" "$dest" >/dev/null 2>&1; then
      skipped="$skipped $name"; continue
    fi
    mkdir -p "$target"
    rm -rf "$dest"
    cp -R "$skill" "$dest"
    installed=$((installed + 1))
  done
  if [ "$uninstall" -eq 1 ]; then
    echo "$host: removed $installed unchanged skills from $target"
  else
    echo "$host: installed $installed skills into $target"
  fi
  if [ "$host" = claude ]; then
    install_agents
    if [ "$uninstall" -eq 1 ]; then
      echo "$host: removed $agents_changed unchanged company agents from $claude_agents_dir"
    else
      echo "$host: installed $agents_changed company agents into $claude_agents_dir"
    fi
    skipped="$skipped$agents_skipped"
  fi
  if [ -n "$skipped" ]; then
    echo "  kept your existing:$skipped (re-run with --force to replace)" >&2
    status=1
  fi
done
[ "$uninstall" -eq 1 ] || echo "Restart your agent session, then ask it to use a skill, e.g. \"use root-cause on this failing test\"."
exit $status
