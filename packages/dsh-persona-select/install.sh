#!/usr/bin/env bash
# 把 0.4.0 的“一张卡 + 两个组件”一次装齐：
#   1) 三个包复制进 <DSH_HOME>/plugin-src
#   2) 在 profile 的 node_modules 建链接
#   3) package.json 的 dependencies 补 link:
#   4) bundles 只保留主包（组件由主包 patch 插入）
#   5) 删掉旧的 .disabled 标记
#   6) 清掉 plugin-activations 里这条记录，避免宿主按“上次没确认”把整包停用
#
# 用法：bash install.sh [profile]     # 默认 profile 是 web
# 前提：本脚本所在包与 picker / settings 两个包目录同级。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="$(dirname "$HERE")"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="${1:-web}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
NODE_MODULES="$PROFILE_DIR/node_modules"

PACKAGES=(dsh-persona-select dsh-persona-select-picker dsh-persona-select-settings)

echo "DSH_HOME = $DSH_HOME"
echo "profile  = $PROFILE"

missing=0
for p in "${PACKAGES[@]}"; do
  if [ ! -f "$BUNDLE_DIR/$p/package.json" ]; then
    echo "缺少包目录：$BUNDLE_DIR/$p" >&2
    missing=1
  fi
done
[ "$missing" = 0 ] || { echo "请把三个包目录放在同一层后重试。" >&2; exit 1; }

[ -d "$PROFILE_DIR" ] || { echo "找不到 profile 目录：$PROFILE_DIR" >&2; exit 1; }

mkdir -p "$DSH_HOME/plugin-src" "$NODE_MODULES"

for p in "${PACKAGES[@]}"; do
  rm -rf "$DSH_HOME/plugin-src/$p"
  cp -a "$BUNDLE_DIR/$p" "$DSH_HOME/plugin-src/$p"

  if [ -e "$NODE_MODULES/$p" ] && [ ! -L "$NODE_MODULES/$p" ]; then
    rm -rf "$NODE_MODULES/$p"
  fi
  ln -sfn "../../../plugin-src/$p" "$NODE_MODULES/$p"

  rm -f "$NODE_MODULES/$p.disabled"
  echo "已放入：$p"
done

python3 - "$PROFILE_DIR" "$DSH_HOME" "${PACKAGES[@]}" <<'PY'
import json, os, sys, time

profile, home, packages = sys.argv[1], sys.argv[2], sys.argv[3:]

pkg_path = os.path.join(profile, "package.json")
with open(pkg_path, encoding="utf-8") as fh:
    doc = json.load(fh)

deps = doc.setdefault("dependencies", {})
for name in packages:
    deps[name] = "link:" + os.path.join(home, "plugin-src", name)

bundles = doc.setdefault("dsh", {}).setdefault("profile", {}).setdefault("bundles", [])
if "dsh-persona-select" not in bundles:
    bundles.append("dsh-persona-select")

with open(pkg_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
print("已更新 profile/package.json（dependencies + bundles）")

act_path = os.path.join(home, "plugin-activations.json")
try:
    with open(act_path, encoding="utf-8") as fh:
        act = json.load(fh)
except Exception:
    act = {"format": 1, "entries": {}}

entries = act.setdefault("entries", {})
removed = entries.pop("dsh-persona-select", None) is not None

with open(act_path, "w", encoding="utf-8") as fh:
    json.dump(act, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
print("已清理激活记录" if removed else "激活记录里本来就没有这条")
PY

cat <<'MSG'

装好了，重启 DSH 后生效。
重启后插件卡下面应出现两行：picker / settings，
对话输入区有人设选择器，设置里有「人设管理」。
MSG
