{ pkgs ? import <nixpkgs> {} }:

let
  pickAttr = preferred: fallback:
    if builtins.hasAttr preferred pkgs
    then builtins.getAttr preferred pkgs
    else builtins.getAttr fallback pkgs;

  nodejs = pickAttr "nodejs_22" "nodejs";
  pnpm = if builtins.hasAttr "pnpm_10" pkgs then builtins.getAttr "pnpm_10" pkgs else pkgs.pnpm;
  prisma = pickAttr "prisma_6" "prisma";
  prismaEngines = pickAttr "prisma-engines_6" "prisma-engines";
in
pkgs.mkShell {
  packages = [
    nodejs
    pnpm
    prisma
    prismaEngines
  ];

  shellHook = ''
    export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig"
    export PRISMA_BIN="${prisma}/bin/prisma"
    export PRISMA_SCHEMA_ENGINE_BINARY="${prismaEngines}/bin/schema-engine"
    export PRISMA_QUERY_ENGINE_BINARY="${prismaEngines}/bin/query-engine"
    export PRISMA_QUERY_ENGINE_LIBRARY="${prismaEngines}/lib/libquery_engine.node"
    export PRISMA_FMT_BINARY="${prismaEngines}/bin/prisma-fmt"

    # Shell styling
    export NIX_SHELL_NAME="statix"
    if [ -n "$BASH_VERSION" ]; then
      export PS1="\[\e[1;35m\][nix:$NIX_SHELL_NAME]\[\e[0m\] \[\e[1;36m\]\w\[\e[0m\] \$ "
    elif [ -n "$ZSH_VERSION" ]; then
      export PROMPT="%F{magenta}[nix:$NIX_SHELL_NAME]%f %F{cyan}%~%f %# "
    fi
    '';
}
